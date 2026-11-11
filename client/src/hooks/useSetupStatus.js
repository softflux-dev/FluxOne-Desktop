import { useEffect, useState } from 'react'
import { ENDPOINTS } from '@/api/endpoints'
import { apiRequest } from '@/api/apiHelper'

/**
 * Shared setup/status fetch for splash, login, and setup wizard.
 * Callers decide navigation; this only loads /setup/status once on mount.
 */
export function useSetupStatus() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await apiRequest(ENDPOINTS.setup.status)
        if (cancelled) return
        setStatus(data)
        setError(null)
      } catch (err) {
        if (cancelled) return
        setStatus(null)
        setError(err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return {
    status,
    loading,
    error,
    bootstrapDone: Boolean(status?.bootstrapDone),
  }
}
