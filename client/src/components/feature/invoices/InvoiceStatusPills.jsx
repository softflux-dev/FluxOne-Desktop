import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const TYPE_KEYS = {
  Sale: 'invoices.typeSale',
  Return: 'invoices.typeReturn',
  Exchange: 'invoices.typeExchange',
}

const PAYMENT_KEYS = {
  Paid: 'invoices.paymentPaid',
  Refund: 'invoices.paymentRefund',
  Return: 'invoices.paymentReturn',
  Adjust: 'invoices.paymentAdjust',
}

/** Sale/Paid use sky pills per figma Inovices2; Return/Exchange keep distinct tones */
export function TypePill({ type = 'Sale' }) {
  const { t } = useTranslation()
  return (
    <Badge
      variant="secondary"
      className={cn(
        'border-0 font-semibold',
        type === 'Return' &&
          'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400',
        type === 'Exchange' &&
          'bg-violet-50 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
        type === 'Sale' &&
          'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
      )}
    >
      {t(TYPE_KEYS[type] || TYPE_KEYS.Sale)}
    </Badge>
  )
}

export function PaymentStatusPill({ status = 'Paid' }) {
  const { t } = useTranslation()
  return (
    <Badge
      variant="secondary"
      className={cn(
        'border-0 font-semibold',
        (status === 'Refund' || status === 'Return') &&
          'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400',
        status === 'Adjust' &&
          'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-400',
        status === 'Paid' &&
          'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
      )}
    >
      {t(PAYMENT_KEYS[status] || PAYMENT_KEYS.Paid)}
    </Badge>
  )
}
