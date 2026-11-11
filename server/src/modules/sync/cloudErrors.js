export const CLOUD_ERROR_TYPE = Object.freeze({
  NETWORK: 'network',
  AUTH: 'auth',
  VALIDATION: 'validation',
  SERVER: 'server',
  CONFIG: 'config',
});

export class CloudError extends Error {
  constructor(
    message,
    {
      type = CLOUD_ERROR_TYPE.SERVER,
      status = 0,
      code = null,
      body = null,
      retryable = undefined,
      hint = null,
      fieldPaths = null,
      details = null,
    } = {}
  ) {
    super(message);
    this.name = 'CloudError';
    this.type = type;
    this.status = status;
    this.code = code;
    this.body = body;
    this.retryable = retryable;
    this.hint = hint;
    this.fieldPaths = fieldPaths;
    this.details = details;
    this.isCloudError = true;
  }
}

export function isCloudError(error) {
  return Boolean(error?.isCloudError);
}

export function cloudErrorTypeFromStatus(status) {
  if (status === 401 || status === 403) {
    return CLOUD_ERROR_TYPE.AUTH;
  }
  if (status === 422) {
    return CLOUD_ERROR_TYPE.VALIDATION;
  }
  if (status >= 500) {
    return CLOUD_ERROR_TYPE.SERVER;
  }
  return CLOUD_ERROR_TYPE.VALIDATION;
}

/**
 * Pull request-level sync error extras from cloud envelope
 * { success:false, error, code, retryable, hint, fieldPaths, details }.
 */
export function extractCloudErrorExtras(json = {}) {
  return {
    code: json?.code ?? json?.errorCode ?? null,
    retryable: json?.retryable,
    hint: json?.hint ?? null,
    fieldPaths: json?.fieldPaths ?? json?.field_paths ?? null,
    details: json?.details ?? null,
  };
}

/** Format a diagnosable message for logs / UI (not just "sync failed"). */
export function formatCloudErrorMessage(error) {
  if (!error) return 'Sync failed';
  const parts = [error.message || 'Sync failed'];
  if (error.code) parts.push(`code=${error.code}`);
  if (error.hint) parts.push(`hint=${error.hint}`);
  if (Array.isArray(error.fieldPaths) && error.fieldPaths.length) {
    parts.push(`fields=${error.fieldPaths.join(',')}`);
  }
  return parts.join(' | ');
}
