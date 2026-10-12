import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { usePos } from '@/context/PosContext'
import { useCategories } from '@/hooks/useCategories'
import { useProducts } from '@/hooks/useProducts'
import { cn } from '@/lib/utils'
import { POS_FIELD_CLASS } from '@/components/feature/pos/posStyles'

/**
 * Category + subcategory selects + Reset (Figma filters row).
 * Categories from GET /categories; subs from listProducts needsSubcategory payload.
 */
export default function CategoryBar() {
  const { t } = useTranslation()
  const {
    categoryId,
    subCategory,
    searchQuery,
    selectCategory,
    selectSubCategory,
    clearSubCategory,
  } = usePos()

  const { categories, isLoading: catsLoading } = useCategories()
  const searching = Boolean(searchQuery.trim())

  const { needsSubcategory, subcategories, category } = useProducts({
    categoryId,
    subCategory: '', // always ask without sub so server returns subcategory list when needed
    query: '',
    page: 1,
    skip: searching || !categoryId || categoryId === 'all' || categoryId === 'popular',
  })

  const cat =
    categories.find((c) => c.id === categoryId) ||
    (category ? { id: category.id, name: category.name, hasSubcategories: true } : null)

  const showSubs =
    !searching &&
    categoryId !== 'all' &&
    categoryId !== 'popular' &&
    (Boolean(cat?.hasSubcategories) || needsSubcategory)

  const subs = showSubs ? subcategories : []
  const canReset = categoryId !== 'all' || Boolean(subCategory) || searching

  return (
    <>
      <FilterSelect
        ariaLabel={t('pos.categoryAria')}
        value={categoryId}
        disabled={catsLoading && categories.length <= 1}
        onChange={(id) => selectCategory(id)}
      >
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.id === 'all' ? t('pos.allCategories') : c.name}
          </option>
        ))}
      </FilterSelect>

      <FilterSelect
        ariaLabel={t('pos.subCategoryAria')}
        value={subCategory}
        disabled={subs.length === 0}
        onChange={(id) => (id ? selectSubCategory(id) : clearSubCategory())}
      >
        <option value="">{t('pos.allSubCategories')}</option>
        {subs.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </FilterSelect>

      <button
        type="button"
        disabled={!canReset}
        onClick={() => selectCategory('all')}
        className={cn(
          POS_FIELD_CLASS,
          'w-full cursor-pointer px-[13px] text-start transition-colors sm:w-[142px]',
          'hover:border-primary/40 hover:text-foreground',
          'disabled:cursor-default disabled:hover:border-[#e8e7ee] disabled:hover:text-black/50',
        )}
      >
        {t('pos.resetFilters')}
      </button>
    </>
  )
}

// Native select styled as a Figma filter box with a grey chevron
function FilterSelect({ ariaLabel, value, onChange, disabled, children }) {
  return (
    <div className="relative w-full sm:w-[142px]">
      <select
        aria-label={ariaLabel}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          POS_FIELD_CLASS,
          'w-full cursor-pointer appearance-none truncate ps-[15px] pe-8 outline-none',
          'focus-visible:border-primary/60',
          'disabled:cursor-not-allowed disabled:opacity-60',
        )}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute end-3 top-1/2 size-3.5 -translate-y-1/2 text-[#7f7f7f]" />
    </div>
  )
}
