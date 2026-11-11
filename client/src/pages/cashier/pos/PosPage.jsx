import { useDeferredValue } from 'react'
import { useTranslation } from 'react-i18next'
import SaleTabs from '@/components/feature/pos/SaleTabs'
import CatalogSearch from '@/components/feature/pos/CatalogSearch'
import CategoryBar from '@/components/feature/pos/CategoryBar'
import ProductGrid from '@/components/feature/pos/ProductGrid'
import CartPanel from '@/components/feature/pos/CartPanel'
import BillTotals from '@/components/feature/pos/BillTotals'
import CashPay from '@/components/feature/pos/CashPay'
import ExchangeBanner from '@/components/feature/pos/ExchangeBanner'
import ReceiptDialog from '@/components/feature/print/ReceiptDialog'
import InvoiceActionDialogs from '@/components/feature/invoices/InvoiceActionDialogs'
import { usePos } from '@/context/PosContext'
import { useProducts } from '@/hooks/useProducts'
import PosPagination from '@/components/feature/pos/PosPagination'
import { POS_DIVIDER_CLASS, POS_PANEL_CLASS } from '@/components/feature/pos/posStyles'
import { cn } from '@/lib/utils'

// Cart list height — shorter on laptops so Complete Sale stays on-screen
const CART_LIST_HEIGHT_PX = 240

export default function PosPage() {
  const { t } = useTranslation()
  const { exchangePicker, closeExchangePicker, categoryId, subCategory, searchQuery, page, pageSize, setPage } = usePos()

  const deferredQuery = useDeferredValue(searchQuery)
  const deferredCategory = useDeferredValue(categoryId)
  const deferredSub = useDeferredValue(subCategory)

  const { total, pageCount, needsSubcategory, isLoading } = useProducts({
    categoryId: deferredCategory,
    subCategory: deferredSub,
    query: deferredQuery,
    page,
    pageSize,
  })

  const searching = Boolean(deferredQuery.trim())
  const needsSub = !searching && needsSubcategory && !deferredSub
  const safePage = Math.min(page, pageCount)
  const from = total ? (safePage - 1) * pageSize + 1 : 0
  const to = Math.min(safePage * pageSize, total)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div>
        <ExchangeBanner />
      </div>

      <div
        className={[
          'grid flex-1 items-stretch gap-5 p-4 md:px-[30px] md:pt-[15px]',
          'grid-cols-1',
          // Cart flush right; narrower on laptop, Figma width on large POS
          'lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] lg:gap-x-6 lg:pe-0',
          'xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]',
          '2xl:grid-cols-[minmax(0,1fr)_minmax(0,475px)]',
        ].join(' ')}
      >
        {/* LEFT: filters row + catalog card */}
        <div className="flex min-h-0 min-w-0 flex-col gap-[11px]">
          <div className="flex flex-wrap gap-2.5">
            <div className="min-w-[220px] flex-[1_1_320px]">
              <CatalogSearch />
            </div>
            <CategoryBar />
          </div>

          <section
            className={cn(
              POS_PANEL_CLASS,
              'flex min-h-[520px] flex-1 flex-col overflow-hidden rounded-[15px] px-[16px] pt-[20px] pb-3 sm:px-[21px] sm:pt-[25px] lg:min-h-[600px]',
            )}
          >
            <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto">
              <ProductGrid />
            </div>
            <PosPagination
              page={safePage}
              pageCount={needsSub ? 1 : pageCount}
              pageSize={pageSize}
              rangeLabel={
                total
                  ? t('pos.showingRange', { from, to, total })
                  : t('pos.zeroItems')
              }
              onPageChange={setPage}
              disabled={needsSub || isLoading}
              className="-mx-4 mt-6 shrink-0 px-1.5"
            />
          </section>
        </div>

        {/* RIGHT: Ticket — min-w-0 so tab overflow scroll works; stretch with left */}
        <section
          className={cn(
            POS_PANEL_CLASS,
            'flex min-h-0 min-w-0 flex-col rounded-[15px] lg:min-h-[600px] lg:rounded-e-none lg:border-e-0',
          )}
        >
          <div className="min-w-0 shrink-0 p-1">
            <SaleTabs />
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col px-[18px] pt-2.5">
            <CartPanel listHeightPx={CART_LIST_HEIGHT_PX} />
            <div className={cn('mt-auto border-t py-4', POS_DIVIDER_CLASS)}>
              <BillTotals />
            </div>
          </div>
          <aside className={cn('shrink-0 border-t px-[18px] pt-4 pb-6', POS_DIVIDER_CLASS)}>
            <CashPay />
          </aside>
        </section>
      </div>

      <ReceiptDialog />
      <InvoiceActionDialogs
        exchangeTarget={exchangePicker}
        onCloseExchange={closeExchangePicker}
        onCloseReturn={() => { }}
        onCloseHistory={() => { }}
      />
    </div>
  )
}
