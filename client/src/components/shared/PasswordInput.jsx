import { forwardRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** Password field with show/hide eye toggle — use everywhere passwords are collected. */
export const PasswordInput = forwardRef(function PasswordInput(
  { className, disabled, ...props },
  ref,
) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <Input
        ref={ref}
        type={visible ? 'text' : 'password'}
        disabled={disabled}
        className={cn('pe-10', className)}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label={
          visible ? t('shared.hidePassword') : t('shared.showPassword')
        }
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
        className={cn(
          'absolute end-1 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center',
          'rounded-md text-muted-foreground outline-none transition-colors',
          'hover:bg-muted hover:text-foreground',
          'focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:pointer-events-none disabled:opacity-50',
        )}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
})
