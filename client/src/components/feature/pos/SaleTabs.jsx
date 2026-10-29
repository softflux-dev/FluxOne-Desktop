import { Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSaleTabs } from '@/hooks/useSaleTabs'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

/**
 * Sale tabs strip + solid purple add button (top of the cart panel).
 */
export default function SaleTabs() {
  const { t } = useTranslation()
  const {
    tabs,
    activeTabId,
    addSaleTab,
    selectSaleTab,
    closeSaleTab,
    isCreating,
  } = useSaleTabs()

  const handleAdd = async () => {
    const result = await addSaleTab()
    if (!result.success) toast.error(result.error)
  }

  const handleClose = async (id) => {
    const result = await closeSaleTab(id)
    if (!result.success) toast.error(result.error)
  }

  return (
    // Light strip — min-w-0 + overflow-x so Tab 5+ scrolls inside the cart panel
    <div className="sale-tabs-bar min-w-0 rounded-[10px] border border-[#e9e9e9] bg-[#fafafa] p-[3px] dark:border-border dark:bg-muted/40">
      <div className="sale-tabs flex min-w-0 items-center gap-1.5 overflow-x-auto">
        {tabs.map((tab, index) => {
          const active = tab.id === activeTabId
          const n = tab.seq || index + 1
          return (
            <div
              key={tab.id}
              className={cn(
                // Slanted right edge like the Figma tab shape
                'inline-flex h-[29px] shrink-0 items-center gap-1 rounded-s-[8px] ps-3 pe-7',
                '[clip-path:polygon(0_0,calc(100%-22px)_0,100%_100%,0_100%)] rtl:[clip-path:polygon(22px_0,100%_0,100%_100%,0_100%)]',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-[#ececec] text-black/60 hover:text-foreground dark:bg-muted dark:text-muted-foreground',
              )}
            >
              <button
                type="button"
                onClick={() => selectSaleTab(tab.id)}
                className="cursor-pointer text-[15px] leading-[14px] font-semibold whitespace-nowrap"
              >
                {t('pos.saleTabLabel', { n })}
              </button>
              {tabs.length > 1 ? (
                <button
                  type="button"
                  title={t('pos.closeTab')}
                  onClick={() => handleClose(tab.id)}
                  className={cn(
                    'cursor-pointer rounded-full p-0.5',
                    active
                      ? 'hover:bg-white/20'
                      : 'hover:bg-black/5 dark:hover:bg-white/10',
                  )}
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </div>
          )
        })}

        <button
          type="button"
          id="btn-new-sale-tab"
          onClick={handleAdd}
          disabled={isCreating}
          title={t('pos.openAnotherSale')}
          aria-label={t('pos.openAnotherSale')}
          className={cn(
            'sale-tab-add inline-flex h-[29px] w-[42px] shrink-0 cursor-pointer items-center justify-center rounded-[8px]',
            'bg-primary text-primary-foreground',
            'transition-opacity hover:opacity-90 disabled:opacity-50',
          )}
        >
          <Plus className="size-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}
