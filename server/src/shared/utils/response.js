export function success(res, data = null, status = 200) {
  return res.status(status).json({ success: true, data });
}

/**
 * Uniform error envelope. Optional extras align with cloud sync contract
 * so clients can surface code/hint/fieldPaths instead of generic "sync failed".
 */
export function error(res, message, status = 400, code = null, extras = null) {
  const body = { success: false, data: null, error: message };
  if (code) body.code = code;
  if (extras && typeof extras === 'object') {
    if (extras.retryable !== undefined) body.retryable = Boolean(extras.retryable);
    if (extras.hint != null) body.hint = extras.hint;
    if (extras.fieldPaths != null) body.fieldPaths = extras.fieldPaths;
    if (extras.details != null) body.details = extras.details;
  }
  return res.status(status).json(body);
}
