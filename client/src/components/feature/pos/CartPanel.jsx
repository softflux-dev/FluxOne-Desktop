import { useEffect, useState } from 'react'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCart } from '@/hooks/useCart'
import { formatMoney } from '@/lib/formatCurrency'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import cartEmptyIcon from '@/assets/pos/cart-empty.svg'

function CartQtyControl({ lineId, qty, disabled, onCommit }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(String(qty))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setDraft(String(qty))
  }, [qty])

  const commit = async (raw) => {
    const trimmed = String(raw ?? '').trim()
    if (trimmed === '') {
      setDraft(String(qty))
      return
    }
    const n = Number(trimmed)
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      setDraft(String(qty))
      toast.error(t('cart.invalidQty'))
      return
    }
    if (n === qty) {
      setDraft(String(qty))
      return
    }
    setBusy(true)
    try {
      await onCommit(lineId, n)
    } finally {
      setBusy(false)
    }
  }

  const bump = async (next) => {
    if (busy || disabled) return
    setBusy(true)
    try {
      await onCommit(lineId, next)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-card">
      <button
        type="button"
        className="cursor-pointer p-1.5 hover:bg-muted disabled:opacity-50 sm:p-2"
        disabled={busy || disabled}
        onClick={() => bump(qty - 1)}
        aria-label={t('cart.decreaseQty')}
      >
        <Minus className="size-3.5" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        disabled={busy || disabled}
        value={draft}
        onChange={(e) => {
          // Digits only while typing; empty allowed mid-edit
          const v = e.target.value.replace(/[^\d]/g, '')
          setDraft(v)
        }}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur()
          }
          if (e.key === 'Escape') {
            setDraft(String(qty))
            e.currentTarget.blur()
          }
        }}
        onFocus={(e) => e.currentTarget.select()}
        aria-label={t('cart.editQty')}
        className="h-8 w-10 min-w-0 border-0 bg-transparent p-0 text-center text-sm font-semibold outline-none focus-visible:ring-0 disabled:opacity-50"
      />
      <button
        type="button"
        className="cursor-pointer p-1.5 hover:bg-muted disabled:opacity-50 sm:p-2"
        disabled={busy || disabled}
        onClick={() => bump(qty + 1)}
        aria-label={t('cart.increaseQty')}
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  )
}

export default function CartPanel({ listHeightPx = 260 }) {
  const { t } = useTranslation()
  const { activeTab, cart, setLineQty, removeLine } = useCart()
  const exchange = Boolean(activeTab?.exchangeMode)
  const title = exchange
    ? t('cart.exchangeCartTitle')
    : activeTab?.seq
      ? t('cart.cartN', { n: activeTab.seq })
      : t('cart.saleCartTitle', {
          label: activeTab?.label || t('cart.fallbackSaleLabel'),
        })

  const handleQty = async (lineId, qty) => {
    const result = await setLineQty(lineId, qty)
    if (result && !result.success) {
      toast.error(result.error)
    }
    return result
  }

  const handleRemove = async (lineId) => {
    const result = await removeLine(lineId)
    if (!result.success) toast.error(result.error)
  }

  return (
    <div className="flex flex-col">
      <div className="mb-[13px]">
        <h2 className="m-0 text-[22px] leading-[28px] font-semibold tracking-[-0.75px] text-black sm:text-[25px] sm:leading-[30px] dark:text-foreground">
          {title}
        </h2>
        <p className="mt-0.5 text-[13px] font-medium text-black/50 sm:text-[15px] dark:text-muted-foreground">
          {t('cart.subtitle')}
        </p>
      </div>

      <div
        className="overflow-y-auto rounded-[10px] border border-[#d9d9d9]/50 bg-[#fafafa] p-2.5 dark:border-border dark:bg-muted/30"
        style={{ height: listHeightPx }}
      >
        {cart.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-3 text-center">
            <img
              src={cartEmptyIcon}
              alt=""
              aria-hidden="true"
              width={43}
              height={43}
              className="mb-2.5"
            />
            <p className="max-w-[186px] text-[12px] text-black/30 dark:text-muted-foreground">
              {exchange ? t('cart.emptyExchange') : t('cart.emptySale')}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {cart.map((line) => (
              <li
                key={line.lineId}
                className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-2.5"
              >
                <div className="size-11 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {line.imageUrl ? (
                    <img
                      src={line.imageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-lg">
                      {line.emoji || '🛒'}
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold sm:text-[15px]">
                    {line.name}
                  </p>
                  <p className="text-xs text-primary">{line.sku}</p>
                  {line.kept ? (
                    <Badge variant="secondary" className="mt-1 text-[10px]">
                      {t('cart.kept')}
                    </Badge>
                  ) : null}
                  <p className="mt-0.5 text-sm font-medium">
                    {formatMoney(line.unitPrice * line.qty)}
                    <span className="ms-1 text-xs font-normal text-muted-foreground">
                      {t('cart.exTax')}
                    </span>
                  </p>
                </div>

                <div className="flex flex-col items-end gap-1">
                  {!line.kept ? (
                    <CartQtyControl
                      lineId={line.lineId}
                      qty={line.qty}
                      onCommit={handleQty}
                    />
                  ) : (
                    <span className="min-w-6 text-center text-sm font-semibold">
                      ×{line.qty}
                    </span>
                  )}
                  {!line.kept ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="text-destructive"
                      onClick={() => handleRemove(line.lineId)}
                      title={t('cart.removeLine')}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}