/**
 * API base path.
 * - Vite / Electron same-origin: `/api` (cookie SameSite=Lax works)
 * - Override with absolute URL only when you must hit another host
 */
export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(
  /\/+$/,
  '',
)
