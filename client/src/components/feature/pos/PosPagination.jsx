import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { POS_DIVIDER_CLASS } from '@/components/feature/pos/posStyles'

/**
 * Catalog footer: "Row Per Page: [8]  1-8 of N" left, Prev / Next right.
 * Page size is fixed (CATALOG_PAGE_SIZE), so the size box is display-only.
 */
export default function PosPagination({
  page,
  pageCount,
  pageSize,
  rangeLabel,
  onPageChange,
  disabled = false,
  className,
}) {
  const { t } = useTranslation()
  const pages = Math.max(1, pageCount)
  const current = Math.min(Math.max(1, page), pages)

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-t-[0.5px] pt-3 text-xs font-medium text-[#7a7a7a] sm:text-sm',
        POS_DIVIDER_CLASS,
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span>{t('pos.rowsPerPage')}</span>
        <span className="inline-flex h-6 min-w-8 items-center justify-center rounded-[4px] border border-[#c3c3c3] px-1.5 text-xs text-[#555]">
          {pageSize}
        </span>
        <span>{rangeLabel}</span>
      </div>

      <div className="flex items-center gap-2">
        <PageStep
          label={t('shared.paginationPrev')}
          disabled={disabled || current <= 1}
          onClick={() => onPageChange(current - 1)}
          icon={<ChevronLeft className="size-3.5 sm:size-4 rtl:rotate-180" strokeWidth={2.5} />}
        />
        <PageStep
          label={t('shared.paginationNext')}
          disabled={disabled || current >= pages}
          onClick={() => onPageChange(current + 1)}
          icon={<ChevronRight className="size-3.5 sm:size-4 rtl:rotate-180" strokeWidth={2.5} />}
          iconEnd
        />
      </div>
    </div>
  )
}

// Outlined Prev/Next — sized for cashier monitors
function PageStep({ label, icon, iconEnd = false, disabled, onClick }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 min-w-[52px] cursor-pointer items-center justify-center gap-1 rounded-md border border-[#c3c3c3]/70 px-2 text-xs text-[#555]',
        'transition-colors hover:border-primary/50 hover:text-primary',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[#c3c3c3]/70 disabled:hover:text-[#555]',
      )}
    >
      {iconEnd ? null : icon}
      {label}
      {iconEnd ? icon : null}
    </button>
  )
}
