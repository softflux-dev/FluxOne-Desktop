import { useTranslation } from 'react-i18next'
import { useCheckout } from '@/hooks/useCheckout'
import { useSaleTabs } from '@/hooks/useSaleTabs'
import { formatMoney } from '@/lib/formatCurrency'

/** .totals-grid — shrink-0 under cart list (never overlaps) */
export default function BillTotals() {
  const { t } = useTranslation()
  const { activeTab } = useSaleTabs()
  const { totals, exchangeCredit, payTotal, isExchange } = useCheckout()
  const exchange = isExchange || Boolean(activeTab?.exchangeMode)
  const netDue = roundNet(payTotal)
  const refundDue = exchange && netDue < 0

  const taxRows =
    Array.isArray(totals.taxes) && totals.taxes.length > 0
      ? totals.taxes.map((tax, i) => ({
          label: t('bill.taxN', { n: i + 1 }),
          value: Number(tax.amount) || 0,
        }))
      : [
          { label: t('bill.tax1'), value: totals.tax1 },
          { label: t('bill.tax2'), value: totals.tax2 },
        ]

  const rows = [
    { label: t('bill.actualPrice'), value: totals.actual },
    { label: t('bill.afterDiscount'), value: totals.after },
    ...taxRows,
  ]

  return (
    <div className="totals-grid space-y-3 text-[15px] leading-[18px] font-medium">
      {rows.map((r) => (
        <TotalRow key={r.label} label={r.label} value={formatMoney(r.value)} />
      ))}
      {exchange ? (
        <>
          <TotalRow label={t('bill.replacementTotal')} value={formatMoney(totals.total)} />
          <TotalRow label={t('bill.exchangeCredit')} value={formatMoney(exchangeCredit)} />
        </>
      ) : null}
      <div className="flex items-center justify-between gap-3 pt-2">
        <span className="font-semibold text-black dark:text-foreground">
          {exchange
            ? refundDue
              ? t('bill.refundDue')
              : t('bill.netToCollect')
            : t('bill.total')}
        </span>
        <strong className="font-bold text-primary">
          {formatMoney(exchange ? Math.abs(netDue) : totals.total)}
        </strong>
      </div>
    </div>
  )
}

// Muted label/value row (Actual price, After discount, taxes)
function TotalRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 text-black/50 dark:text-muted-foreground">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}

function roundNet(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}
