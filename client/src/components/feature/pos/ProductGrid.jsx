import { useDeferredValue, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePos } from '@/context/PosContext'
import { useCart } from '@/hooks/useCart'
import { useProducts } from '@/hooks/useProducts'
import VariantPickerDialog from '@/components/feature/pos/VariantPickerDialog'
import ProductCard from '@/components/feature/pos/ProductCard'
import { childDisplayName, isVariantParent } from '@/lib/variantResolve'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// Prefer reusable VariantPickerDialog — do not inline option UI here
export default function ProductGrid() {
  const { t } = useTranslation()
  const {
    categoryId,
    subCategory,
    searchQuery,
    page,
    pageSize,
  } = usePos()
  const deferredQuery = useDeferredValue(searchQuery)
  const deferredCategory = useDeferredValue(categoryId)
  const deferredSub = useDeferredValue(subCategory)
  const filtersPending =
    deferredQuery !== searchQuery ||
    deferredCategory !== categoryId ||
    deferredSub !== subCategory
  const { addItem } = useCart()
  const [pickerParent, setPickerParent] = useState(null)

  const {
    products,
    needsSubcategory,
    isLoading,
    isError,
    error,
  } = useProducts({
    categoryId: deferredCategory,
    subCategory: deferredSub,
    query: deferredQuery,
    page,
    pageSize,
  })

  const searching = Boolean(deferredQuery.trim())
  const needsSub = !searching && needsSubcategory && !deferredSub

  const handleAddSellable = async (p) => {
    const r = await addItem({ productId: p.id, product: p })
    if (!r.success) {
      toast.error(r.error)
      return
    }
    if (r.warning) toast.warning(r.warning)
    else toast.success(t('pos.addedToast', { name: childDisplayName(p) || p.name }))
  }

  const handleCardClick = (p) => {
    if (isVariantParent(p)) {
      setPickerParent(p)
      return
    }
    handleAddSellable(p)
  }

  return (
    <div>
      <div
        className={cn(
          'grid content-start gap-x-2.5 gap-y-4 transition-opacity duration-200',
          // 2 → 3 on laptop; 4 cols (4×2 for pageSize 8) on wide shop displays
          'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4',
          filtersPending && 'opacity-60',
        )}
      >
        {needsSub ? (
          <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
            {t('pos.chooseSubcategory')}
            <br />
            <span className="text-muted-foreground/80">
              {t('pos.chooseSubcategoryExample')}
            </span>
          </p>
        ) : isLoading ? (
          <>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="min-h-[179px] animate-pulse rounded-[15px] bg-muted/70"
              />
            ))}
          </>
        ) : isError ? (
          <p className="col-span-full py-10 text-center text-sm text-destructive">
            {error?.error || t('pos.failedLoadProducts')}
          </p>
        ) : products.length === 0 ? (
          <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
            {t('pos.noItemsMatch')}
          </p>
        ) : (
          products.map((p) => (
            <ProductCard key={p.id} product={p} onSelect={handleCardClick} />
          ))
        )}
      </div>

      <VariantPickerDialog
        open={Boolean(pickerParent)}
        onOpenChange={(open) => {
          if (!open) setPickerParent(null)
        }}
        parent={pickerParent}
        onConfirm={handleAddSellable}
      />
    </div>
  )
}
