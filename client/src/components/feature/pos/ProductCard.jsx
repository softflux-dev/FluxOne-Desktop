import { useTranslation } from 'react-i18next'
import { stockTone } from '@/lib/cartMath'
import { formatMoney } from '@/lib/formatCurrency'
import { cn } from '@/lib/utils'
import { isVariantParent } from '@/lib/variantResolve'
import cartButtonIcon from '@/assets/pos/cart-button.svg'

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8Zm9vZHxlbnwwfHwwfHx8MA%3D%3D'

// Pill colors per stock tone; "in" matches Figma green
const PILL_TONE = {
  parent: 'bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  in: 'bg-[rgba(49,255,56,0.08)] text-[#34ce3a]',
  low: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  out: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400',
}

export default function ProductCard({ product: p, onSelect }) {
  const { t } = useTranslation()
  const isParent = isVariantParent(p)
  const tone = stockTone(p.stock)
  const outOfStock = !isParent && p.stock <= 0

  const pillLabel = isParent
    ? t('pos.variantsBadge')
    : tone === 'out'
      ? t('pos.noStock')
      : tone === 'low'
        ? t('pos.lowStock', { stock: p.stock })
        : t('pos.inStock')

  const availableText = isParent
    ? t('pos.chooseVariant')
    : tone === 'out'
      ? pillLabel
      : t('pos.availableStock', { stock: p.stock })

  return (
    <button
      type="button"
      disabled={outOfStock}
      onClick={() => onSelect(p)}
      className={cn(
        'flex cursor-pointer flex-col rounded-[15px] border-2 border-[#f3f3f3] bg-[rgba(243,243,243,0.6)] px-1.5 pt-2 pb-2 text-start transition-colors sm:px-2',
        'dark:border-border dark:bg-muted/40',
        'hover:border-primary/40',
        'disabled:cursor-not-allowed disabled:opacity-50',
      )}
    >
      {/* Image */}
      <div className="aspect-[194/109] w-full overflow-hidden rounded-[10px] bg-muted">
        <img
          src={p.imageUrl || FALLBACK_IMAGE}
          alt={p.imageUrl ? p.name : t('pos.productImageAlt')}
          className="h-full w-full object-cover"
        />
      </div>

      {/* Name + stock pill */}
      <div className="mt-1.5 flex w-full items-start justify-between gap-2 pl-1.5 sm:pl-2">
        <strong
          title={p.name}
          className="min-w-0 truncate text-[14px] leading-5 font-extrabold text-foreground sm:text-[15px]"
        >
          {p.name}
        </strong>
        <span
          className={cn(
            'mt-0.5 inline-flex h-5 shrink-0 items-center rounded-md px-2 text-[10px] leading-none font-bold whitespace-nowrap sm:text-[11px]',
            PILL_TONE[isParent ? 'parent' : tone],
          )}
        >
          {pillLabel}
        </span>
      </div>

      {p.variantLabel ? (
        <span className="truncate pl-1.5 text-[11px] text-muted-foreground sm:pl-2">
          {p.variantLabel}
        </span>
      ) : null}

      {/* Available count (or variant hint) */}
      <span className="mt-0.5 pl-1.5 text-[11px] leading-4 text-muted-foreground sm:pl-2 sm:text-xs">
        {availableText}
      </span>

      {/* Price + cart affordance (whole card is the click target) */}
      <div className="mt-1.5 flex w-full items-center justify-between gap-2 pr-1 pl-1.5 sm:pr-1.5 sm:pl-2">
        {!isParent ? (
          <span className="truncate text-[13px] leading-5 font-bold text-primary sm:text-sm">
            {formatMoney(p.price)}
          </span>
        ) : (
          <span />
        )}
        <img
          src={cartButtonIcon}
          alt=""
          aria-hidden="true"
          className="h-5 w-auto shrink-0 sm:h-6"
        />
      </div>
    </button>
  )
}
