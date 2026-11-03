import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BrandLogo } from '@/components/shared/BrandLogo'
import { useSetupStatus } from '@/hooks/useSetupStatus'
import { PATHS } from '@/router/paths'

export default function SplashPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { loading, error, bootstrapDone } = useSetupStatus()
  const [minTimeElapsed, setMinTimeElapsed] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setMinTimeElapsed(true), 2600)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!minTimeElapsed || loading) return
    if (error || !bootstrapDone) {
      navigate(PATHS.setup, { replace: true })
      return
    }
    navigate(PATHS.login, { replace: true })
  }, [minTimeElapsed, loading, error, bootstrapDone, navigate])

  return (
    <section className="splash-screen flex min-h-dvh items-center justify-center overflow-hidden">
      <div className="splash-logo-wrap text-center">
        <BrandLogo size="xl" withGlow className="mx-auto animate-[logoPulse_1.8s_ease-in-out_infinite]" />
        <p className="splash-tagline mt-5 text-sm tracking-[0.12em] text-white/90 uppercase opacity-0">
          {t('splash.product')}
        </p>
        <p className="mt-3 text-xs text-white/50">{t('splash.name')}</p>
      </div>
    </section>
  )
}
