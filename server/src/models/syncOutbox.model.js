import { connectDb } from '../config/database.js';
import {
  computeNextRetryAt,
  defaultHintForCode,
  normalizeErrorCode,
  resolveRetryable,
} from '../modules/sync/syncErrorCodes.js';

const OUTBOX_FIELDS = `
  id,
  client_event_id AS clientEventId,
  event_type AS eventType,
  payload,
  device_id AS deviceId,
  created_at AS createdAt,
  synced_at AS syncedAt,
  sync_status AS syncStatus,
  retry_count AS retryCount,
  last_error AS lastError,
  last_error_code AS lastErrorCode,
  last_error_hint AS lastErrorHint,
  last_error_details AS lastErrorDetails,
  field_paths AS fieldPaths,
  http_status AS httpStatus,
  retryable,
  next_retry_at AS nextRetryAt
`;

function parseJsonColumn(value, fallback = null) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function stringifyJson(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function mapOutboxRow(row) {
  if (!row) return null;
  return {
    ...row,
    retryable: row.retryable === 1 || row.retryable === true,
    lastErrorDetails: parseJsonColumn(row.lastErrorDetails, null),
    fieldPaths: parseJsonColumn(row.fieldPaths, null),
    attempts: Number(row.retryCount) || 0,
  };
}

export function runTx(fn) {
  return connectDb().transaction(fn)();
}

export function insertOutboxEvent({
  clientEventId,
  eventType,
  payload,
  deviceId,
}) {
  const db = connectDb();
  db.prepare(
    `
    INSERT INTO sync_outbox (
      client_event_id, event_type, payload, device_id, sync_status
    ) VALUES (
      @clientEventId, @eventType, @payload, @deviceId, 'pending'
    )
  `
  ).run({
    clientEventId,
    eventType,
    payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
    deviceId,
  });
  return findByClientEventId(clientEventId);
}

export function findByClientEventId(clientEventId) {
  const db = connectDb();
  const row =
    db
      .prepare(`SELECT ${OUTBOX_FIELDS} FROM sync_outbox WHERE client_event_id = ?`)
      .get(clientEventId) || null;
  return mapOutboxRow(row);
}

/**
 * Pending rows ready to push (respects exponential backoff window).
 * Never regenerates client_event_id — callers must reuse stored ids.
 */
export function listPending(limit = 50) {
  const db = connectDb();
  const rows = db
    .prepare(
      `
    SELECT ${OUTBOX_FIELDS}
    FROM sync_outbox
    WHERE sync_status = 'pending'
      AND (next_retry_at IS NULL OR next_retry_at <= datetime('now'))
    ORDER BY created_at ASC
    LIMIT ?
  `
    )
    .all(limit);
  return rows.map(mapOutboxRow);
}

export function countPending() {
  const db = connectDb();
  return db
    .prepare(
      `
      SELECT COUNT(*) AS n FROM sync_outbox
      WHERE sync_status = 'pending'
    `
    )
    .get().n;
}

/** Permanent + transient rejects that still need operator attention. */
export function countFailed() {
  const db = connectDb();
  return db
    .prepare(
      `
      SELECT COUNT(*) AS n FROM sync_outbox
      WHERE sync_status = 'rejected'
    `
    )
    .get().n;
}

export function countRejectedPermanent() {
  const db = connectDb();
  return db
    .prepare(
      `
      SELECT COUNT(*) AS n FROM sync_outbox
      WHERE sync_status = 'rejected' AND retryable = 0
    `
    )
    .get().n;
}

export function listFailed(limit = 20) {
  const db = connectDb();
  return db
    .prepare(
      `
    SELECT ${OUTBOX_FIELDS}
    FROM sync_outbox
    WHERE sync_status = 'rejected'
    ORDER BY created_at DESC
    LIMIT ?
  `
    )
    .all(limit)
    .map(mapOutboxRow);
}

/**
 * Re-queue only retryable rejects whose backoff window has elapsed.
 * Permanent rejects stay rejected until payload/data is fixed.
 */
export function requeueFailed() {
  const db = connectDb();
  const result = db
    .prepare(
      `
    UPDATE sync_outbox
    SET sync_status = 'pending'
    WHERE sync_status = 'rejected'
      AND retryable = 1
      AND (next_retry_at IS NULL OR next_retry_at <= datetime('now'))
  `
    )
    .run();
  return Number(result.changes) || 0;
}

/** Compact rows for GET /sync/status (UI + terminal diagnosis). */
export function listFailedSummaries(limit = 10) {
  return listFailed(limit).map((row) => {
    let invoiceId = null;
    let saleNumber = null;
    try {
      const payload =
        typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
      invoiceId = payload?.invoiceId ?? payload?.saleNumber ?? null;
      saleNumber = payload?.saleNumber ?? payload?.sale_number ?? invoiceId;
    } catch {
      // keep nulls
    }
    return {
      clientEventId: row.clientEventId,
      eventType: row.eventType,
      invoiceId,
      saleNumber,
      retryCount: Number(row.retryCount) || 0,
      attempts: Number(row.retryCount) || 0,
      lastError: row.lastError || 'Unknown error',
      lastErrorCode: row.lastErrorCode || null,
      lastErrorHint: row.lastErrorHint || null,
      fieldPaths: row.fieldPaths || null,
      retryable: Boolean(row.retryable),
      httpStatus: row.httpStatus ?? null,
      createdAt: row.createdAt,
    };
  });
}

/** Counts pending outbox rows grouped by event_type (POS → cloud upload queue). */
export function countPendingByType() {
  const db = connectDb();
  const rows = db
    .prepare(
      `
      SELECT event_type AS eventType, COUNT(*) AS n
      FROM sync_outbox
      WHERE sync_status = 'pending'
      GROUP BY event_type
    `
    )
    .all();

  const byType = {
    sale: 0,
    refund: 0,
    cashier_log: 0,
    attendance: 0,
    product_price_update: 0,
    price_change: 0,
  };

  for (const row of rows) {
    const key = row.eventType;
    const n = Number(row.n) || 0;
    byType[key] = n;
  }

  return byType;
}

export function markAccepted(clientEventId) {
  const db = connectDb();
  db.prepare(
    `
    UPDATE sync_outbox
    SET sync_status = 'accepted',
        synced_at = datetime('now'),
        last_error = NULL,
        last_error_code = NULL,
        last_error_hint = NULL,
        last_error_details = NULL,
        field_paths = NULL,
        http_status = NULL,
        retryable = 0,
        next_retry_at = NULL
    WHERE client_event_id = ?
  `
  ).run(clientEventId);
}

/** @deprecated Use markAccepted — kept for call-site compatibility during transition. */
export function markSent(clientEventId) {
  return markAccepted(clientEventId);
}

export function markSkipped(clientEventId, reason = null) {
  const db = connectDb();
  db.prepare(
    `
    UPDATE sync_outbox
    SET sync_status = 'skipped',
        synced_at = datetime('now'),
        last_error = NULL,
        last_error_code = @reason,
        last_error_hint = 'Skipped by cloud — treated as synced (not a failure).',
        last_error_details = NULL,
        field_paths = NULL,
        http_status = NULL,
        retryable = 0,
        next_retry_at = NULL
    WHERE client_event_id = @clientEventId
  `
  ).run({
    clientEventId,
    reason: reason ? String(reason).slice(0, 120) : 'skipped',
  });
}

/**
 * Mark rejected with full cloud diagnostic payload.
 * retryable=true → schedule backoff; false → stop until fixed.
 */
export function markRejected(clientEventId, rejection = {}) {
  const db = connectDb();
  const code = normalizeErrorCode(rejection.code);
  const retryable = resolveRetryable(code, rejection.retryable);
  const reason =
    rejection.reason || rejection.message || rejection.error || 'Rejected by cloud';
  const hint = rejection.hint || defaultHintForCode(code);
  const current = findByClientEventId(clientEventId);
  const nextAttempts = (Number(current?.retryCount) || 0) + 1;
  const nextRetryAt = retryable ? computeNextRetryAt(nextAttempts - 1) : null;

  db.prepare(
    `
    UPDATE sync_outbox
    SET sync_status = 'rejected',
        retry_count = @attempts,
        last_error = @reason,
        last_error_code = @code,
        last_error_hint = @hint,
        last_error_details = @details,
        field_paths = @fieldPaths,
        http_status = @httpStatus,
        retryable = @retryable,
        next_retry_at = @nextRetryAt
    WHERE client_event_id = @clientEventId
  `
  ).run({
    clientEventId,
    attempts: nextAttempts,
    reason: String(reason).slice(0, 2000),
    code,
    hint: String(hint).slice(0, 2000),
    details: stringifyJson(rejection.details ?? rejection.context ?? null),
    fieldPaths: stringifyJson(rejection.fieldPaths ?? null),
    httpStatus: rejection.httpStatus ?? null,
    retryable: retryable ? 1 : 0,
    nextRetryAt,
  });
}

/** @deprecated Prefer markRejected with structured rejection. */
export function markFailed(clientEventId, errorMessage, { incrementRetry = true } = {}) {
  if (!incrementRetry) {
    const db = connectDb();
    db.prepare(
      `
      UPDATE sync_outbox
      SET sync_status = 'rejected',
          last_error = @error,
          last_error_code = 'UNKNOWN',
          retryable = 0,
          next_retry_at = NULL
      WHERE client_event_id = @clientEventId
    `
    ).run({ clientEventId, error: errorMessage || null });
    return;
  }
  markRejected(clientEventId, {
    code: 'UNKNOWN',
    reason: errorMessage,
    retryable: true,
  });
}

export function incrementRetry(clientEventId, errorMessage) {
  markRejected(clientEventId, {
    code: 'INTERNAL_ERROR',
    reason: errorMessage,
    retryable: true,
    hint: defaultHintForCode('INTERNAL_ERROR'),
  });
}

export function markInvoiceCloudSynced(invoiceId, cloudSaleId = null) {
  const db = connectDb();
  if (cloudSaleId) {
    db.prepare(
      `
      UPDATE invoices
      SET cloud_synced_at = datetime('now'), cloud_sale_id = @cloudSaleId
      WHERE id = @invoiceId
    `
    ).run({ invoiceId, cloudSaleId });
    return;
  }
  db.prepare(
    `
    UPDATE invoices
    SET cloud_synced_at = datetime('now')
    WHERE id = ?
  `
  ).run(invoiceId);
}
