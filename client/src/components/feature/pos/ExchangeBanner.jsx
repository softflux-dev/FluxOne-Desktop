import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { usePos } from '@/context/PosContext'
import { useSaleTabs } from '@/hooks/useSaleTabs'
import { useInvoiceActions } from '@/hooks/useInvoiceActions'
import { formatMoney } from '@/lib/formatCurrency'
import { Button } from '@/components/ui/button'

/**
 * Exchange banner — given (original) lines only; cart stays replacements.
 * Uses theme tokens so dark mode stays readable (amber accent, not light-only).
 */
export default function ExchangeBanner() {
  const { t } = useTranslation()
  const { openExchangePicker } = usePos()
  const { activeTab, cancelExchange, isDeleting, isCreating } = useSaleTabs()
  const { loadInvoice, startExchange, isStartingExchange } = useInvoiceActions()
  const [busyLineId, setBusyLineId] = useState(null)

  const mode = activeTab?.exchangeMode
  if (!mode) return null

  const given = mode.given || []
  const exchangeCredit =
    Number(mode.exchangedCredit ?? activeTab?.exchangedCredit) || 0
  const busy = isDeleting || isCreating || isStartingExchange || Boolean(busyLineId)

  const handleCancel = async () => {
    const result = await cancelExchange()
    if (!result.success) toast.error(result.error)
    else toast.success(t('exchangeBanner.exchangeCancelled'))
  }

  const handleEdit = async () => {
    const result = await loadInvoice(mode.invoiceId)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    openExchangePicker({
      ...result.data,
      preselectedIds: mode.exchangedItemIds || given.map((g) => g.id),
    })
  }

  const handleRemoveGiven = async (lineId) => {
    const nextIds = (mode.exchangedItemIds || given.map((g) => g.id)).filter(
      (id) => id !== lineId,
    )
    if (!nextIds.length) {
      await handleCancel()
      return
    }
    setBusyLineId(lineId)
    try {
      const result = await startExchange(mode.invoiceId, nextIds)
      if (!result.success) toast.error(result.error)
    } finally {
      setBusyLineId(null)
    }
  }

  return (
    <div className="border-b border-amber-200/80 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-50">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div>
            <strong className="font-semibold text-foreground dark:text-amber-50">
              {t('exchangeBanner.mode')}
            </strong>
            <span className="mx-2 text-amber-700/80 dark:text-amber-200/70">·</span>
            <span className="text-foreground dark:text-amber-100/90">
              {t('exchangeBanner.invoiceCredit', {
                invoiceId: mode.invoiceId,
                credit: formatMoney(exchangeCredit),
              })}
            </span>
          </div>
          {given.length > 0 ? (
            <ul className="space-y-1 text-xs text-amber-900/90 dark:text-amber-100/80">
              {given.map((line) => (
                <li
                  key={line.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200/60 bg-amber-100/70 px-2 py-1 dark:border-amber-800/60 dark:bg-amber-900/40"
                >
                  <span className="font-medium text-foreground dark:text-amber-50">
                    {line.name}
                  </span>
                  <span className="text-amber-800/80 dark:text-amber-200/70">
                    {t('exchangeBanner.givenLineMeta', {
                      sku: line.sku,
                      qty: line.qty,
                      amount: formatMoney(
                        line.lineTotal || line.unitPrice * line.qty,
                      ),
                    })}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleRemoveGiven(line.id)}
                    className="ms-auto cursor-pointer text-xs font-semibold text-destructive hover:underline disabled:opacity-50"
                  >
                    {busyLineId === line.id
                      ? t('exchangeBanner.removing')
                      : t('exchangeBanner.remove')}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={handleEdit}
          >
            {t('exchangeBanner.edit')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={handleCancel}
          >
            {t('exchangeBanner.cancelExchange')}
          </Button>
        </div>
      </div>
    </div>
  )
}
