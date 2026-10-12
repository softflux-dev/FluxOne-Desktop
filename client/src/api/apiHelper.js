import { API_BASE } from '@/api/api'
import { clearToken, getToken } from '@/api/tokenStorage'
import { PATHS } from '@/router/paths'
import i18n from '@/i18n'

export const getAuthHeaders = () => {
  const token = getToken()
  const headers = {
    'X-Network-Status':
      typeof navigator !== 'undefined' && navigator.onLine === false
        ? 'offline'
        : 'online',
  }
  // Real JWT only — HttpOnly cookie covers auth when memory/session is empty
  if (token && token !== '__cookie__') {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

export const parseError = (json) => {
  const base = json?.error || json?.message || i18n.t('errors.requestFailed')
  if (!json?.hint) return base
  return `${base} — ${json.hint}`
}

function attachSyncErrorExtras(err, json) {
  err.code = json?.code ?? null
  err.hint = json?.hint ?? null
  err.fieldPaths = json?.fieldPaths ?? json?.field_paths ?? null
  err.retryable = json?.retryable
  err.details = json?.details ?? null
  return err
}

// Normalize thrown errors for rejectWithValue / hooks.
export function toThunkError(error) {
  return {
    message: error?.message || i18n.t('errors.requestFailed'),
    status: error?.status ?? 0,
    code: error?.code ?? null,
    hint: error?.hint ?? null,
    fieldPaths: error?.fieldPaths ?? null,
    retryable: error?.retryable,
    details: error?.details ?? null,
    isNetworkError: Boolean(error?.isNetworkError),
  }
}

// Shared fetch helper — unwraps `{ success, data }` (same contract as old Axios). Options: `{ method, body | data, params, headers }`
export async function apiRequest(path, options = {}) {
  let requestPath = path
  if (options.params && typeof options.params === 'object') {
    const qs = new URLSearchParams()
    for (const [key, value] of Object.entries(options.params)) {
      if (value === undefined || value === null || value === '') continue
      qs.set(key, String(value))
    }
    const q = qs.toString()
    if (q) {
      requestPath = `${path}${path.includes('?') ? '&' : '?'}${q}`
    }
  }

  const url = requestPath.startsWith('http')
    ? requestPath
    : `${API_BASE}${requestPath}`

  const headers = { ...getAuthHeaders(), ...options.headers }
  const method = (options.method || 'GET').toUpperCase()
  const config = { method, credentials: 'include', headers }

  const payload = options.body !== undefined ? options.body : options.data
  if (payload !== undefined) {
    if (payload instanceof FormData) {
      config.body = payload
    } else {
      headers['Content-Type'] = 'application/json'
      config.body = JSON.stringify(payload)
    }
  }

  let res
  try {
    res = await fetch(url, config)
  } catch (networkErr) {
    const err = new Error(
      networkErr?.message || i18n.t('errors.networkError'),
    )
    err.code = 'OFFLINE'
    err.isNetworkError = true
    err.status = 0
    throw err
  }

  let json = null
  const text = await res.text()
  if (text) {
    try {
      json = JSON.parse(text)
    } catch {
      throw new Error(i18n.t('errors.invalidResponse'))
    }
  }

  if (!res.ok) {
    const err = attachSyncErrorExtras(new Error(parseError(json)), json)
    err.status = res.status
    err.isNetworkError = false
    if (res.status === 401) {
      clearToken()
      const pathName = window.location?.pathname || ''
      if (pathName !== PATHS.login && pathName !== PATHS.splash) {
        window.location.assign(PATHS.login)
      }
    }
    throw err
  }

  if (json && json.success === false) {
    const err = attachSyncErrorExtras(new Error(parseError(json)), json)
    err.status = res.status
    throw err
  }

  if (json && json.success === true && 'data' in json) {
    return json.data
  }
  return json
}
