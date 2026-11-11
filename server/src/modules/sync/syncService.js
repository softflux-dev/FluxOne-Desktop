import config from '../../config/index.js';
import * as syncMetaModel from '../../models/syncMeta.model.js';
import * as syncOutboxModel from '../../models/syncOutbox.model.js';
import * as cloudClient from './cloudClient.js';
import {
  CloudError,
  CLOUD_ERROR_TYPE,
  formatCloudErrorMessage,
  isCloudError,
} from './cloudErrors.js';
import {
  collectAcceptedEventIds,
  collectPushSaleIds,
  collectSkippedEventIds,
  normalizePushResult,
  normalizeRejectedEvent,
} from './mappers.js';
import {
  applyCatalogSnapshot,
  applyCloudSales,
  markBootstrapDone,
} from './syncApply.js';
import {
  SYNC_ERROR_CODE,
  defaultHintForCode,
  normalizeErrorCode,
  resolveRetryable,
} from './syncErrorCodes.js';

const MAX_OUTBOX_RETRIES = 10;
const SALES_PAGE_LIMIT = 100;

/** Pre-production sync diagnostics — strip or gate before client delivery. */
function syncLog(level, message, extra) {
  const line = `[fluxone:sync] ${message}`;
  if (level === 'error') {
    if (extra !== undefined) console.error(line, extra);
    else console.error(line);
    return;
  }
  if (extra !== undefined) console.log(line, extra);
  else console.log(line);
}

function logRejectedEvent(rejection) {
  const ctx = rejection.context || {};
  syncLog(
    'error',
    `REJECTED ${rejection.eventType || '?'} ${rejection.clientEventId}` +
      ` code=${rejection.code}` +
      ` retryable=${resolveRetryable(rejection.code, rejection.retryable)}` +
      (ctx.saleNumber ? ` saleNumber=${ctx.saleNumber}` : '') +
      (Array.isArray(rejection.fieldPaths) && rejection.fieldPaths.length
        ? ` fields=${rejection.fieldPaths.join(',')}`
        : '') +
      (Array.isArray(ctx.productIds) && ctx.productIds.length
        ? ` productIds=${ctx.productIds.join(',')}`
        : '') +
      ` — ${rejection.reason}` +
      (rejection.hint ? ` | hint: ${rejection.hint}` : '')
  );
}

export function isNetworkOnline() {
  return config.isOnline;
}

export function applyBootstrap(data, options = {}) {
  return applyCatalogSnapshot(data, { isBootstrap: true, ...options });
}

export function applyDelta(data) {
  return applyCatalogSnapshot(data, { isBootstrap: false });
}

/**
 * Pull catalog then page-loop sales history before marking bootstrap done.
 * Stock is never adjusted from sales restore.
 */
export async function pullBootstrap(branchId) {
  const resolvedBranchId = branchId || syncMetaModel.getSyncMeta()?.branchId;
  const data = await cloudClient.getBootstrap(resolvedBranchId);
  const counts = applyBootstrap(data, { deferBootstrapDone: true });

  const sales = await pullAllSalesPages(resolvedBranchId);
  const salesStats = applyCloudSales(sales.items);

  markBootstrapDone();

  return {
    counts: {
      ...counts,
      sales: salesStats.applied,
      salesSkippedPending: salesStats.skippedPending,
      salesSkippedInvalid: salesStats.skippedInvalid,
      salesTotal: sales.total,
    },
    sales: salesStats,
    raw: data,
  };
}

async function pullAllSalesPages(branchId) {
  const metaBranchId = branchId || syncMetaModel.getSyncMeta()?.branchId;
  if (!metaBranchId) {
    return { items: [], total: 0, pageCount: 0 };
  }

  const allItems = [];
  let page = 1;
  let pageCount = 1;
  let total = 0;

  while (page <= pageCount) {
    const result = await cloudClient.getSalesPage({
      branchId: metaBranchId,
      page,
      limit: SALES_PAGE_LIMIT,
    });
    const items = Array.isArray(result.items) ? result.items : [];
    allItems.push(...items);

    const pagination = result.pagination || {};
    total = Number(pagination.total) || allItems.length;
    pageCount = Math.max(1, Number(pagination.pageCount) || 1);

    if (items.length === 0 || items.length < SALES_PAGE_LIMIT) {
      break;
    }
    page += 1;
    if (page > pageCount) break;
  }

  return { items: allItems, total, pageCount };
}

export async function pullDelta() {
  const meta = syncMetaModel.getSyncMeta();
  if (!meta?.bootstrapDone) {
    return { pulled: false, reason: 'bootstrap_required' };
  }
  // Prefer cloud syncVersion as delta cursor
  const since = meta.syncVersion || meta.lastPullAt;
  if (!since) {
    return { pulled: false, reason: 'missing_last_pull_at' };
  }

  try {
    const data = await cloudClient.getDelta(meta.branchId, since);
    const counts = applyDelta(data);
    return { pulled: true, counts, raw: data };
  } catch (error) {
    if (isCloudError(error) && error.status === 403) {
      return {
        pulled: false,
        reason: 'branch_denied',
        error: formatCloudErrorMessage(error),
        code: error.code ?? SYNC_ERROR_CODE.BRANCH_ACCESS_DENIED,
        hint: error.hint ?? defaultHintForCode(SYNC_ERROR_CODE.BRANCH_ACCESS_DENIED),
        fieldPaths: error.fieldPaths ?? null,
        retryable: resolveRetryable(error.code, error.retryable),
      };
    }
    throw error;
  }
}

/** Cloud push batch max is 200 — keep default at the contract limit. */
export const SYNC_PUSH_MAX_EVENTS = 200;

function applyAcceptedEvents(pending, acceptedIds, saleIdsByEvent) {
  for (const clientEventId of acceptedIds) {
    syncOutboxModel.markAccepted(clientEventId);
    const row = pending.find((item) => item.clientEventId === clientEventId);
    const invoiceId = row?.payload ? readInvoiceIdFromPayload(row.payload) : null;
    if (!invoiceId) continue;

    const cloudSaleId = saleIdsByEvent.get(clientEventId) ?? null;
    const isSaleEvent = row?.eventType === 'sale' || row?.eventType === 'refund';
    if (isSaleEvent || cloudSaleId) {
      syncOutboxModel.markInvoiceCloudSynced(invoiceId, cloudSaleId);
    }
  }
}

function applySkippedEvents(skippedMap) {
  for (const [clientEventId, reason] of skippedMap) {
    syncOutboxModel.markSkipped(clientEventId, reason);
    syncLog('info', `Cloud SKIPPED ${clientEventId}: ${reason} (treated as synced)`);
  }
}

function applyRejectedEvents(pending, rejectedItems, { httpStatus = 202 } = {}) {
  let permanent = 0;
  let transient = 0;

  for (const item of rejectedItems) {
    const rejection = normalizeRejectedEvent(item, { httpStatus });
    if (!rejection?.clientEventId) continue;

    const row = pending.find((p) => p.clientEventId === rejection.clientEventId);
    if (!rejection.eventType && row?.eventType) {
      rejection.eventType = row.eventType;
    }
    // Prefer context from payload when cloud omits it
    if (!rejection.context && row?.payload) {
      rejection.context = buildRejectionContext(row);
    }

    syncOutboxModel.markRejected(rejection.clientEventId, rejection);
    logRejectedEvent(rejection);

    if (resolveRetryable(rejection.code, rejection.retryable)) {
      transient += 1;
    } else {
      permanent += 1;
    }
  }

  return { permanent, transient };
}

function buildRejectionContext(row) {
  try {
    const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
    const lines = payload?.lines ?? payload?.items ?? [];
    return {
      saleNumber: payload?.saleNumber ?? payload?.invoiceId ?? null,
      lineCount: Array.isArray(lines) ? lines.length : 0,
      productIds: Array.isArray(lines)
        ? lines.map((l) => l.productId ?? l.product_id).filter(Boolean)
        : [],
      eventType: row.eventType,
    };
  } catch {
    return { eventType: row.eventType };
  }
}

export async function pushOutbox(batchSize = SYNC_PUSH_MAX_EVENTS, { requeue = true } = {}) {
  const limit = Math.min(Math.max(1, Number(batchSize) || SYNC_PUSH_MAX_EVENTS), SYNC_PUSH_MAX_EVENTS);
  if (!isNetworkOnline()) {
    return {
      pushed: 0,
      accepted: 0,
      rejected: 0,
      skipped: 0,
      pending: syncOutboxModel.countPending(),
      hasFailures: false,
      reason: 'offline',
    };
  }

  // Only re-queue retryable rejects whose backoff window elapsed.
  let requeued = 0;
  if (requeue) {
    requeued = syncOutboxModel.requeueFailed();
    if (requeued > 0) {
      syncLog('info', `Re-queued ${requeued} retryable outbox event(s)`);
    }
  }

  const pending = syncOutboxModel.listPending(limit);
  if (!pending.length) {
    return {
      pushed: 0,
      accepted: 0,
      rejected: 0,
      skipped: 0,
      pending: 0,
      hasFailures: syncOutboxModel.countFailed() > 0,
      reason: 'empty',
      requeued,
      failed: syncOutboxModel.countFailed(),
    };
  }

  syncLog(
    'info',
    `Pushing ${pending.length} outbox event(s): ${pending
      .map((r) => `${r.eventType}:${r.clientEventId}`)
      .join(', ')}`,
  );

  const events = pending.map((row) => ({
    clientEventId: row.clientEventId,
    eventType: row.eventType,
    payload: JSON.parse(row.payload),
    deviceId: row.deviceId,
  }));

  try {
    await cloudClient.ensureValidSession();
  } catch (error) {
    syncLog('error', `Push auth failed: ${formatCloudErrorMessage(error)}`);
    return {
      pushed: 0,
      accepted: 0,
      rejected: 0,
      skipped: 0,
      pending: syncOutboxModel.countPending(),
      hasFailures: true,
      reason: error?.status === 403 ? 'branch_denied' : 'auth_failed',
      error: formatCloudErrorMessage(error),
      code: error?.code ?? SYNC_ERROR_CODE.AUTH_REQUIRED,
      hint: error?.hint ?? defaultHintForCode(SYNC_ERROR_CODE.AUTH_REQUIRED),
      fieldPaths: error?.fieldPaths ?? null,
      retryable: resolveRetryable(error?.code, error?.retryable ?? true),
      requeued,
    };
  }

  try {
    const rawResult = await cloudClient.pushEvents(events);
    const result = normalizePushResult(rawResult);
    const acceptedIds = collectAcceptedEventIds(result);
    const skippedMap = collectSkippedEventIds(result);
    const saleIdsByEvent = collectPushSaleIds(result);

    // Skipped first so they are not also treated as accepted duplicates.
    applySkippedEvents(skippedMap);

    const acceptedOnly = acceptedIds.filter((id) => !skippedMap.has(id));
    applyAcceptedEvents(pending, acceptedOnly, saleIdsByEvent);

    const rejectStats = applyRejectedEvents(pending, result.rejected, {
      httpStatus: 202,
    });

    if (result.hasFailures) {
      syncLog(
        'error',
        `Push hasFailures=true accepted=${result.acceptedCount}` +
          ` rejected=${result.rejectedCount} skipped=${result.skippedCount}` +
          (result.message ? ` — ${result.message}` : ''),
      );
    } else if (acceptedOnly.length || skippedMap.size) {
      syncLog(
        'info',
        `Cloud accepted=${acceptedOnly.length} skipped=${skippedMap.size}` +
          (result.message ? ` — ${result.message}` : ''),
      );
    }

    syncMetaModel.updateSyncMeta({ lastPushAt: new Date().toISOString() });

    return {
      pushed: acceptedOnly.length + skippedMap.size,
      accepted: acceptedOnly.length,
      rejected: result.rejectedCount,
      skipped: skippedMap.size,
      pending: syncOutboxModel.countPending(),
      failed: syncOutboxModel.countFailed(),
      permanentRejected: rejectStats.permanent,
      transientRejected: rejectStats.transient,
      hasFailures: result.hasFailures || syncOutboxModel.countFailed() > 0,
      message: result.message,
      requeued,
    };
  } catch (error) {
    return handlePushFailure(pending, error, { requeued });
  }
}

function readInvoiceIdFromPayload(payloadText) {
  try {
    const payload = typeof payloadText === 'string' ? JSON.parse(payloadText) : payloadText;
    return payload?.invoiceId ?? payload?.saleNumber ?? payload?.sale_number ?? null;
  } catch {
    return null;
  }
}

function handlePushFailure(pending, error, { requeued = 0 } = {}) {
  const message = formatCloudErrorMessage(error) || 'Cloud push failed';
  const type = isCloudError(error) ? error.type : CLOUD_ERROR_TYPE.SERVER;
  const status = error?.status || 0;
  const code = normalizeErrorCode(error?.code || (status === 422 ? 'VALIDATION_FAILED' : 'UNKNOWN'));
  const hint = error?.hint || defaultHintForCode(code);
  const retryable = resolveRetryable(code, error?.retryable);

  syncLog('error', `Push batch failed type=${type} status=${status}: ${message}`);

  if (type === CLOUD_ERROR_TYPE.NETWORK) {
    return {
      pushed: 0,
      accepted: 0,
      rejected: 0,
      skipped: 0,
      pending: syncOutboxModel.countPending(),
      hasFailures: false,
      reason: 'network',
      error: message,
      code,
      hint,
      retryable: true,
      requeued,
    };
  }

  if (type === CLOUD_ERROR_TYPE.AUTH) {
    const reason = status === 403 ? 'branch_denied' : 'auth_failed';
    // Leave events pending; AUTH_REQUIRED is transient after re-login.
    return {
      pushed: 0,
      accepted: 0,
      rejected: 0,
      skipped: 0,
      pending: syncOutboxModel.countPending(),
      hasFailures: true,
      reason,
      error: message,
      code: code || (status === 403 ? SYNC_ERROR_CODE.BRANCH_ACCESS_DENIED : SYNC_ERROR_CODE.AUTH_REQUIRED),
      hint,
      fieldPaths: error?.fieldPaths ?? null,
      retryable: true,
      requeued,
    };
  }

  // Request-level validation / permanent body errors → mark each event rejected.
  if (type === CLOUD_ERROR_TYPE.VALIDATION || status === 422 || !retryable) {
    for (const row of pending) {
      syncOutboxModel.markRejected(row.clientEventId, {
        code,
        reason: message,
        retryable: false,
        hint,
        fieldPaths: error?.fieldPaths ?? null,
        details: error?.details ?? null,
        httpStatus: status,
        context: buildRejectionContext(row),
      });
      logRejectedEvent({
        clientEventId: row.clientEventId,
        eventType: row.eventType,
        code,
        reason: message,
        retryable: false,
        hint,
        fieldPaths: error?.fieldPaths,
        context: buildRejectionContext(row),
      });
    }
    return {
      pushed: 0,
      accepted: 0,
      rejected: pending.length,
      skipped: 0,
      pending: syncOutboxModel.countPending(),
      failed: syncOutboxModel.countFailed(),
      hasFailures: true,
      reason: 'validation',
      error: message,
      code,
      hint,
      fieldPaths: error?.fieldPaths ?? null,
      retryable: false,
      requeued,
    };
  }

  if (type === CLOUD_ERROR_TYPE.SERVER || status >= 500 || retryable) {
    for (const row of pending) {
      const nextRetry = (row.retryCount || 0) + 1;
      const forcePermanent = nextRetry >= MAX_OUTBOX_RETRIES;
      syncOutboxModel.markRejected(row.clientEventId, {
        code: forcePermanent ? SYNC_ERROR_CODE.UNKNOWN : code || SYNC_ERROR_CODE.INTERNAL_ERROR,
        reason: message,
        retryable: !forcePermanent,
        hint: forcePermanent
          ? 'Max retries exceeded — inspect payload and cloud logs.'
          : hint,
        fieldPaths: error?.fieldPaths ?? null,
        details: error?.details ?? null,
        httpStatus: status,
        context: buildRejectionContext(row),
      });
      syncLog(
        forcePermanent ? 'error' : 'info',
        `${forcePermanent ? 'Marked REJECTED (max retries)' : `Retry scheduled ${nextRetry}/${MAX_OUTBOX_RETRIES}`}` +
          ` ${row.eventType} ${row.clientEventId}: ${message}`,
      );
    }
    return {
      pushed: 0,
      accepted: 0,
      rejected: pending.length,
      skipped: 0,
      pending: syncOutboxModel.countPending(),
      failed: syncOutboxModel.countFailed(),
      hasFailures: true,
      reason: 'server',
      error: message,
      code,
      hint,
      retryable: true,
      requeued,
    };
  }

  for (const row of pending) {
    syncOutboxModel.markRejected(row.clientEventId, {
      code: SYNC_ERROR_CODE.INTERNAL_ERROR,
      reason: message,
      retryable: true,
      hint: defaultHintForCode(SYNC_ERROR_CODE.INTERNAL_ERROR),
      httpStatus: status,
      context: buildRejectionContext(row),
    });
  }

  return {
    pushed: 0,
    accepted: 0,
    rejected: pending.length,
    skipped: 0,
    pending: syncOutboxModel.countPending(),
    failed: syncOutboxModel.countFailed(),
    hasFailures: true,
    reason: 'error',
    error: message,
    code,
    hint,
    retryable: true,
    requeued,
  };
}

/**
 * Sync cycle order (cloud contract):
 *  1) delta pull (catalog / inventory SoT)
 *  2) push pending local events
 * Sales history pull remains bootstrap-only (optional UI restore).
 */
export async function runSyncCycle({ batchSize = SYNC_PUSH_MAX_EVENTS } = {}) {
  const meta = syncMetaModel.getSyncMeta();
  const limit = Math.min(
    Math.max(1, Number(batchSize) || SYNC_PUSH_MAX_EVENTS),
    SYNC_PUSH_MAX_EVENTS
  );

  let pull = { pulled: false, reason: 'skipped' };
  if (!meta?.bootstrapDone) {
    pull = { pulled: false, reason: 'bootstrap_required' };
  } else if (!isNetworkOnline()) {
    pull = { pulled: false, reason: 'offline' };
  } else {
    try {
      pull = await pullDelta();
    } catch (error) {
      if (error instanceof CloudError && error.type === CLOUD_ERROR_TYPE.NETWORK) {
        pull = {
          pulled: false,
          reason: 'network',
          error: formatCloudErrorMessage(error),
          code: error.code,
          hint: error.hint,
          retryable: true,
        };
      } else if (error instanceof CloudError && error.status === 403) {
        pull = {
          pulled: false,
          reason: 'branch_denied',
          error: formatCloudErrorMessage(error),
          code: error.code ?? SYNC_ERROR_CODE.BRANCH_ACCESS_DENIED,
          hint: error.hint,
          retryable: false,
        };
      } else if (error instanceof CloudError && error.type === CLOUD_ERROR_TYPE.AUTH) {
        pull = {
          pulled: false,
          reason: 'auth_failed',
          error: formatCloudErrorMessage(error),
          code: error.code ?? SYNC_ERROR_CODE.AUTH_REQUIRED,
          hint: error.hint,
          retryable: true,
        };
      } else {
        pull = {
          pulled: false,
          reason: 'error',
          error: formatCloudErrorMessage(error) || error.message,
          code: error?.code ?? null,
          hint: error?.hint ?? null,
          fieldPaths: error?.fieldPaths ?? null,
          retryable: resolveRetryable(error?.code, error?.retryable),
        };
      }
    }
  }

  // Stop push when branch is denied (local data is not wiped).
  let push = {
    pushed: 0,
    accepted: 0,
    rejected: 0,
    skipped: 0,
    pending: syncOutboxModel.countPending(),
    hasFailures: false,
  };

  if (pull.reason === 'branch_denied') {
    push = {
      ...push,
      reason: 'branch_denied',
      error: pull.error,
      code: pull.code,
      hint: pull.hint,
      hasFailures: true,
    };
  } else if (isNetworkOnline()) {
    let firstBatch = true;
    for (;;) {
      const batch = await pushOutbox(limit, { requeue: firstBatch });
      firstBatch = false;
      push = {
        ...batch,
        pushed: (push.pushed || 0) + (batch.pushed || 0),
        accepted: (push.accepted || 0) + (batch.accepted || 0),
        rejected: (push.rejected || 0) + (batch.rejected || 0),
        skipped: (push.skipped || 0) + (batch.skipped || 0),
        hasFailures: Boolean(push.hasFailures || batch.hasFailures),
      };
      if (batch.reason === 'branch_denied' || batch.reason === 'auth_failed') {
        break;
      }
      // Stop when nothing more accepted/skipped or queue drained.
      if ((batch.accepted || 0) + (batch.skipped || 0) === 0 || (batch.pending || 0) === 0) {
        break;
      }
    }
  } else {
    push = { ...push, reason: 'offline' };
  }

  const failedOutbox = syncOutboxModel.countFailed();
  const failedEvents = syncOutboxModel.listFailedSummaries(10);
  if (failedOutbox > 0) {
    syncLog(
      'error',
      `Cycle done with ${failedOutbox} rejected upload(s). Open Sync badge/page for code/hint.`,
    );
    for (const row of failedEvents) {
      syncLog(
        'error',
        `  → ${row.eventType} ${row.saleNumber || row.clientEventId}` +
          ` [${row.lastErrorCode || 'UNKNOWN'}]` +
          ` retryable=${row.retryable}: ${row.lastError}` +
          (row.lastErrorHint ? ` | ${row.lastErrorHint}` : ''),
      );
    }
  }

  return {
    meta: syncMetaModel.getSyncMeta(),
    pendingOutbox: syncOutboxModel.countPending(),
    failedOutbox,
    pendingByType: syncOutboxModel.countPendingByType(),
    // DEV: remove failedEvents from API before client delivery
    failedEvents,
    push,
    pull,
  };
}

export function getSyncStatus() {
  const meta = syncMetaModel.getSyncMeta();
  return {
    meta,
    pendingOutbox: syncOutboxModel.countPending(),
    failedOutbox: syncOutboxModel.countFailed(),
    pendingByType: syncOutboxModel.countPendingByType(),
    // DEV: remove failedEvents before client delivery
    failedEvents: syncOutboxModel.listFailedSummaries(10),
    cloudConfigured: cloudClient.isCloudConfigured(),
    online: isNetworkOnline(),
  };
}

export default {
  isNetworkOnline,
  applyBootstrap,
  applyDelta,
  pullBootstrap,
  pullDelta,
  pushOutbox,
  runSyncCycle,
  getSyncStatus,
  SYNC_PUSH_MAX_EVENTS,
};
