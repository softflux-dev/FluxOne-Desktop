/**
 * Cloud sync error-code → local retry policy.
 * Cloud is source of truth for codes; POS only decides retry vs fix-first.
 */

export const SYNC_ERROR_CODE = Object.freeze({
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  BRANCH_REQUIRED: 'BRANCH_REQUIRED',
  BRANCH_ACCESS_DENIED: 'BRANCH_ACCESS_DENIED',
  BRANCH_NOT_FOUND: 'BRANCH_NOT_FOUND',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  SALE_VALIDATION_FAILED: 'SALE_VALIDATION_FAILED',
  REFUND_VALIDATION_FAILED: 'REFUND_VALIDATION_FAILED',
  REFUND_MISSING_INVOICE: 'REFUND_MISSING_INVOICE',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  INSUFFICIENT_BRANCH_STOCK: 'INSUFFICIENT_BRANCH_STOCK',
  PRODUCT_INACTIVE: 'PRODUCT_INACTIVE',
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  PRICE_VALIDATION_FAILED: 'PRICE_VALIDATION_FAILED',
  CASHIER_LOG_VALIDATION_FAILED: 'CASHIER_LOG_VALIDATION_FAILED',
  UNKNOWN: 'UNKNOWN',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  RATE_LIMITED: 'RATE_LIMITED',
  SYNC_STORE_FAILED: 'SYNC_STORE_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

/** Permanent — fix payload/data before retry; do not auto-requeue. */
export const PERMANENT_SYNC_CODES = new Set([
  SYNC_ERROR_CODE.VALIDATION_FAILED,
  SYNC_ERROR_CODE.BRANCH_REQUIRED,
  SYNC_ERROR_CODE.BRANCH_ACCESS_DENIED,
  SYNC_ERROR_CODE.BRANCH_NOT_FOUND,
  SYNC_ERROR_CODE.PERMISSION_DENIED,
  SYNC_ERROR_CODE.SALE_VALIDATION_FAILED,
  SYNC_ERROR_CODE.REFUND_VALIDATION_FAILED,
  SYNC_ERROR_CODE.REFUND_MISSING_INVOICE,
  SYNC_ERROR_CODE.INSUFFICIENT_STOCK,
  SYNC_ERROR_CODE.INSUFFICIENT_BRANCH_STOCK,
  SYNC_ERROR_CODE.PRODUCT_INACTIVE,
  SYNC_ERROR_CODE.PRODUCT_NOT_FOUND,
  SYNC_ERROR_CODE.PRICE_VALIDATION_FAILED,
  SYNC_ERROR_CODE.CASHIER_LOG_VALIDATION_FAILED,
  SYNC_ERROR_CODE.UNKNOWN,
]);

/** Transient — backoff and retry with the SAME clientEventId. */
export const TRANSIENT_SYNC_CODES = new Set([
  SYNC_ERROR_CODE.AUTH_REQUIRED,
  SYNC_ERROR_CODE.RATE_LIMITED,
  SYNC_ERROR_CODE.SYNC_STORE_FAILED,
  SYNC_ERROR_CODE.INTERNAL_ERROR,
]);

/** Cloud skipped[] reasons — mark done locally, not failures. */
export const SKIP_REASONS = new Set([
  'duplicate_client_event_id',
  'sale_number_exists',
  'stale_pos_updated_at',
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

/**
 * Resolve whether a rejected event should be retried.
 * Prefer explicit `retryable` from cloud; fall back to code table.
 */
export function resolveRetryable(code, retryableFlag) {
  if (retryableFlag === true) return true;
  if (retryableFlag === false) return false;
  const normalized = String(code || SYNC_ERROR_CODE.UNKNOWN).toUpperCase();
  if (TRANSIENT_SYNC_CODES.has(normalized)) return true;
  if (PERMANENT_SYNC_CODES.has(normalized)) return false;
  return false;
}

/** Exponential backoff: 30s → 1m → 2m → … capped at 30m. */
export function computeNextRetryAt(attempts = 0, now = Date.now()) {
  const n = Math.max(0, Number(attempts) || 0);
  const delayMs = Math.min(30_000 * 2 ** n, 30 * 60_000);
  return new Date(now + delayMs).toISOString();
}

export function normalizeErrorCode(code) {
  if (!code) return SYNC_ERROR_CODE.UNKNOWN;
  const upper = String(code).trim().toUpperCase();
  return upper || SYNC_ERROR_CODE.UNKNOWN;
}

/**
 * Human-facing fix hint when cloud omits `hint`.
 */
export function defaultHintForCode(code) {
  switch (normalizeErrorCode(code)) {
    case SYNC_ERROR_CODE.AUTH_REQUIRED:
      return 'Refresh cloud token or re-login, then retry with the same clientEventId.';
    case SYNC_ERROR_CODE.RATE_LIMITED:
      return 'Wait for the backoff window, then retry the same clientEventId.';
    case SYNC_ERROR_CODE.SYNC_STORE_FAILED:
    case SYNC_ERROR_CODE.INTERNAL_ERROR:
      return 'Transient cloud error — retry with the same clientEventId.';
    case SYNC_ERROR_CODE.INSUFFICIENT_STOCK:
    case SYNC_ERROR_CODE.INSUFFICIENT_BRANCH_STOCK:
      return 'Pull inventory (delta/bootstrap), reconcile stock, then retry.';
    case SYNC_ERROR_CODE.PRODUCT_NOT_FOUND:
    case SYNC_ERROR_CODE.PRODUCT_INACTIVE:
      return 'Run bootstrap/delta so the product exists on this branch, then retry.';
    case SYNC_ERROR_CODE.REFUND_MISSING_INVOICE:
      return 'Include saleNumber/invoiceId of the original sale on the refund payload.';
    case SYNC_ERROR_CODE.BRANCH_REQUIRED:
    case SYNC_ERROR_CODE.BRANCH_ACCESS_DENIED:
    case SYNC_ERROR_CODE.BRANCH_NOT_FOUND:
      return 'Check branchId provisioning and JWT branch access.';
    case SYNC_ERROR_CODE.SALE_VALIDATION_FAILED:
    case SYNC_ERROR_CODE.REFUND_VALIDATION_FAILED:
    case SYNC_ERROR_CODE.PRICE_VALIDATION_FAILED:
    case SYNC_ERROR_CODE.CASHIER_LOG_VALIDATION_FAILED:
    case SYNC_ERROR_CODE.VALIDATION_FAILED:
      return 'Fix the fields listed in fieldPaths, keep the same clientEventId, then retry.';
    default:
      return 'Inspect code/fieldPaths/details, fix the payload, then retry.';
  }
}
