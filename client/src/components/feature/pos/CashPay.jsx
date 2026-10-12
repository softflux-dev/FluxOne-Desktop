import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCheckout } from '@/hooks/useCheckout'
import { useCart } from '@/hooks/useCart'
import { useSaleTabs } from '@/hooks/useSaleTabs'
import { useMinPending } from '@/hooks/useMinPending'
import { formatMoney, parseMoneyInput, roundMoney } from '@/lib/formatCurrency'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { POS_DIVIDER_CLASS } from '@/components/feature/pos/posStyles'

/**
 * .pos-right — Pay with cash (flex: 0 0 auto under totals).
 */
export default function CashPay() {
  const { t } = useTranslation()
  const { activeTab, activeTabId } = useSaleTabs()
  const { cart } = useCart()
  const { totals, payTotal, isExchange, checkout, isCheckingOut } = useCheckout()
  const { pending: minBusy, run } = useMinPending(500)
  const [tendered, setTendered] = useState('')
  const [tenderedTabId, setTenderedTabId] = useState(activeTabId)

  // Reset tender only when switching to a different sale tab (not on refetch flicker).
  useEffect(() => {
    if (!activeTabId || activeTabId === tenderedTabId) return
    setTenderedTabId(activeTabId)
    setTendered('')
  }, [activeTabId, tenderedTabId])

  const exchange = Boolean(isExchange || activeTab?.exchangeMode)
  const netDue = roundMoney(exchange ? payTotal : totals.total)
  const customerPays = netDue > 0
  const storeRefunds = exchange && netDue < 0
  const dueCollect = customerPays ? netDue : 0
  const refundAmount = storeRefunds ? Math.abs(netDue) : 0

  const tenderedNum = parseMoneyInput(tendered)
  const tenderedRounded = Number.isNaN(tenderedNum) ? NaN : roundMoney(tenderedNum)
  const change = customerPays
    ? Math.max(0, (Number.isNaN(tenderedRounded) ? 0 : tenderedRounded) - dueCollect)
    : refundAmount
  const lineCount = cart.filter((l) => !l.returned && l.qty > 0).length
  const busy = isCheckingOut || minBusy
  const tenderOk =
    !customerPays ||
    (!Number.isNaN(tenderedRounded) && tenderedRounded >= dueCollect)
  const canComplete = lineCount > 0 && tenderOk && !busy

  const fillExact = () => {
    setTendered(dueCollect > 0 ? String(dueCollect) : '')
  }

  const handleComplete = async () => {
    if (!lineCount) {
      toast.error(t('cashPay.cartEmpty'))
      return
    }
    if (!tenderOk) {
      toast.error(t('cashPay.enterAtLeast', { amount: formatMoney(dueCollect) }))
      return
    }

    const wasExchange = exchange
    await run(async () => {
      const result = await checkout({
        tendered: customerPays
          ? Number.isNaN(tenderedRounded)
            ? 0
            : tenderedRounded
          : 0,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setTendered('')
      toast.success(
        wasExchange
          ? t('cashPay.exchangeCompleted', { id: result.data.id })
          : t('cashPay.paymentCompleted', { id: result.data.id }),
      )
    })
  }

  return (
    <div className="text-[15px] leading-[18px] font-medium text-black dark:text-foreground">
      {/* Pay with cash + total (two-line label, value on the second line) */}
      <div className={cn('flex items-end justify-between gap-3 border-b pb-4', POS_DIVIDER_CLASS)}>
        <h3 className="m-0 text-[15px] leading-[18px] font-semibold">
          {t('cashPay.title')}
          <br />
          {exchange
            ? storeRefunds
              ? t('cashPay.refundDue')
              : netDue === 0
                ? t('cashPay.evenExchange')
                : t('cashPay.netToCollect')
            : t('cashPay.totalPrice')}
        </h3>
        <span>
          {formatMoney(storeRefunds ? refundAmount : exchange ? dueCollect : netDue)}
        </span>
      </div>

      {customerPays || !exchange ? (
        <div className="mt-[22px] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="tendered" className="text-[15px] font-semibold">
              {t('cashPay.paymentGiven')}
            </Label>
            {dueCollect > 0 ? (
              <button
                type="button"
                onClick={fillExact}
                className="cursor-pointer text-xs font-semibold text-primary hover:underline"
              >
                {t('cashPay.exactAmount')}
              </button>
            ) : null}
          </div>
          <Input
            id="tendered"
            type="text"
            inputMode="decimal"
            value={tendered}
            onChange={(e) => setTendered(e.target.value)}
            className="h-[30px] rounded-[8px] border-[0.5px] border-[#d9d9d9] bg-white px-3 text-[12px] placeholder:text-[#d9d9d9] md:text-[12px] dark:bg-input/30"
            placeholder={
              dueCollect > 0
                ? String(dueCollect)
                : t('cashPay.tenderPlaceholderExample')
            }
          />
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          {t('cashPay.noPaymentNeeded')}
        </p>
      )}

      <div className="mt-[18px] flex items-center justify-between">
        <span className="text-black/50 dark:text-muted-foreground">
          {storeRefunds
            ? t('cashPay.refundToCustomer')
            : t('cashPay.paymentToReturn')}
        </span>
        <span>{formatMoney(change)}</span>
      </div>

      <Button
        type="button"
        disabled={!canComplete}
        onClick={handleComplete}
        className="mt-[18px] h-[38px] w-full cursor-pointer rounded-[10px] bg-primary text-[16px] font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {busy
          ? t('cashPay.processing')
          : exchange
            ? t('cashPay.completeExchange')
            : t('cashPay.completeSale')}
      </Button>
    </div>
  )
}
