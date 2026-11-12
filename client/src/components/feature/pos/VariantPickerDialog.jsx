import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Search,
  ChevronDown,
  Check,
  X,
  Package,
  Layers,
  Sparkles,
  AlertCircle,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatMoney } from '@/lib/formatCurrency'
import { cleanParentName } from '@/lib/variantResolve'
import { stockTone } from '@/lib/cartMath'
import { cn } from '@/lib/utils'
import { useAppDispatch } from '@/rtk/hooks'
import { fetchProductChildren } from '@/rtk/features/catalog/catalogSlice'

const FALLBACK_IMG =
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=60'

const VARIANT_PAGE_SIZE = 5

// ---------- helpers (outside component so they are stable) ----------
const getOptions = (child) => child?.variantOptions ?? child?.variant_options ?? []
const getTypeName = (opt) => String(opt?.typeName || opt?.type_name || '').trim()
const getValueName = (opt) => String(opt?.valueName || opt?.value_name || '').trim()

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Remove the parent's name from a string so shared parent words
// (e.g. "Slanty") don't match every variant.
const stripParentName = (text, parentName) => {
  let result = String(text || '')
  const rawParent = String(parentName || '').trim()
  if (!rawParent) return result.trim()

  const candidates = new Set([rawParent])
  const cleaned = String(cleanParentName(rawParent) || '').trim()
  if (cleaned) candidates.add(cleaned)

  // longest first so the full name is removed before its parts
  for (const p of [...candidates].sort((a, b) => b.length - a.length)) {
    result = result.replace(new RegExp(escapeRegExp(p), 'ig'), ' ')
  }
  return result.replace(/\s+/g, ' ').trim()
}

const getVariantLabel = (child) => {
  if (child.variantLabel) return child.variantLabel
  const opts = getOptions(child)
  if (opts.length === 0) return cleanParentName(child.name)
  return opts
    .map((o) => o.valueName || o.value_name)
    .filter(Boolean)
    .join(' • ')
}

export default function VariantPickerDialog({
  open,
  onOpenChange,
  parent,
  variantChildren,
  onConfirm,
}) {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const [children, setChildren] = useState(() => variantChildren || [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [selectedValue, setSelectedValue] = useState('')
  const [viewMore, setViewMore] = useState(false)

  const hasProvidedChildren =
    Array.isArray(variantChildren) && variantChildren.length > 0

  // Keep latest props in refs so effects don't re-run (and reset the search)
  const variantChildrenRef = useRef(variantChildren)
  variantChildrenRef.current = variantChildren
  const tRef = useRef(t)
  tRef.current = t

  // 1) Reset UI state ONLY when the dialog opens / the product changes
  useEffect(() => {
    if (!open) return
    setSelectedIds(new Set())
    setSearchTerm('')
    setSelectedType('')
    setSelectedValue('')
    setViewMore(false)
    setError('')
  }, [open, parent?.id])

  // 2) Load / sync the data (does NOT touch search or filters)
  useEffect(() => {
    if (!open || !parent?.id) return
    let cancelled = false

    if (hasProvidedChildren) {
      setChildren(variantChildrenRef.current)
      return undefined
    }

    ;(async () => {
      setLoading(true)
      try {
        const data = await dispatch(fetchProductChildren(parent.id)).unwrap()
        if (cancelled) return
        setChildren(data?.children || [])
      } catch (err) {
        if (cancelled) return
        setError(
          err?.message || err?.error || tRef.current('pos.failedLoadVariants'),
        )
        setChildren([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, parent?.id, hasProvidedChildren, dispatch])

  const variantTypes = useMemo(() => {
    const types = new Set()
    for (const child of children) {
      for (const opt of getOptions(child)) {
        const tn = getTypeName(opt)
        if (tn) types.add(tn)
      }
    }
    return [...types].sort()
  }, [children])

  const variantValuesForSelectedType = useMemo(() => {
    if (!selectedType) return []
    const values = new Set()
    for (const child of children) {
      for (const opt of getOptions(child)) {
        const tn = getTypeName(opt)
        const vn = getValueName(opt)
        if (tn === selectedType && vn) values.add(vn)
      }
    }
    return [...values].sort()
  }, [children, selectedType])

  const normalizedSearch = searchTerm.trim().toLowerCase()
  const isSearching = normalizedSearch.length > 0
  const parentName = parent?.name || ''

  // Search: ONLY variants that actually match are kept
  const filteredChildren = useMemo(() => {
    const words = normalizedSearch.split(/\s+/).filter(Boolean)

    return children.filter((child) => {
      const opts = getOptions(child)

      // type -> value map for the dropdown filters
      const optMap = new Map()
      for (const opt of opts) {
        const tn = getTypeName(opt)
        const vn = getValueName(opt)
        if (tn) optMap.set(tn, vn)
      }

      const matchesType = !selectedType || optMap.has(selectedType)
      const matchesValue =
        !selectedValue || optMap.get(selectedType) === selectedValue
      if (!matchesType || !matchesValue) return false

      if (words.length === 0) return true

      // Searchable text = only what is UNIQUE to this variant.
      // Parent name is removed, and raw child.name / type names
      // (shared by every variant) are NOT included.
      const haystack = [
        stripParentName(child.name, parentName),
        stripParentName(getVariantLabel(child), parentName),
        child.sku,
        child.barcode,
        ...opts.map((o) => getValueName(o)),
      ]
        .map((v) => String(v ?? '').toLowerCase())
        .join(' ')

      // every typed word must be present
      return words.every((w) => haystack.includes(w))
    })
  }, [children, normalizedSearch, selectedType, selectedValue, parentName])

  // While searching, show ALL matches (no "view more" hiding results)
  const showAll = viewMore || isSearching
  const displayChildren = showAll
    ? filteredChildren
    : filteredChildren.slice(0, VARIANT_PAGE_SIZE)
  const remainingCount = filteredChildren.length - VARIANT_PAGE_SIZE
  const hasMore = remainingCount > 0 && !showAll

  const toggleSelectVariant = (child) => {
    if (Number(child.stock) <= 0) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(child.id)) {
        next.delete(child.id)
      } else {
        next.add(child.id)
      }
      return next
    })
  }

  const handleConfirm = () => {
    if (selectedIds.size === 0) return
    const selectedItems = children.filter((c) => selectedIds.has(c.id))
    selectedItems.forEach((item) => onConfirm?.(item))
    onOpenChange?.(false)
  }

  const getStockBadgeStyle = (stock) => {
    const tone = stockTone(stock)
    if (tone === 'out' || Number(stock) <= 0) {
      return 'bg-destructive/10 text-destructive border-destructive/20'
    }
    if (tone === 'low') {
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
    }
    return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
  }

  const hasSelection = selectedIds.size > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="md:max-w-lg flex flex-col max-h-[90vh] overflow-hidden p-2 gap-0 rounded-2xl border-border/80 bg-background/95 backdrop-blur-xl shadow-2xl">
        {/* Header */}
        <DialogHeader className="relative p-5 pb-4 border-b border-border/60 shrink-0 bg-gradient-to-b from-muted/40 to-background">
          <div className="flex items-start gap-3.5 pr-6">
            <div className="relative size-12 rounded-xl overflow-hidden border border-border/80 bg-muted shrink-0 shadow-xs">
              <img
                src={parent?.imageUrl || children[0]?.imageUrl || FALLBACK_IMG}
                alt={parent?.name || ''}
                className="size-full object-cover"
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <DialogTitle className="text-lg font-bold tracking-tight text-foreground truncate">
                  {cleanParentName(parent?.name || '') || t('pos.chooseVariant')}
                </DialogTitle>
                {children.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="rounded-full px-2 py-0 text-[11px] font-medium bg-primary/10 text-primary border-primary/20"
                  >
                    <Layers className="size-3 mr-1" />
                    {isSearching || selectedType
                      ? `${filteredChildren.length}/${children.length}`
                      : children.length}
                  </Badge>
                )}
              </div>
              <DialogDescription className="mt-1 text-xs text-muted-foreground line-clamp-1">
                {t('pos.chooseVariantHint')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-5 space-y-4">
          {loading ? (
            <div className="space-y-2.5 py-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-3.5 p-3.5 rounded-xl border border-border/50 bg-muted/20 animate-pulse"
                >
                  <div className="size-13 rounded-lg bg-muted shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-2/3 rounded bg-muted" />
                    <div className="h-3 w-1/3 rounded bg-muted" />
                  </div>
                  <div className="size-5 rounded-md bg-muted" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex items-center gap-2.5 p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive text-sm">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : children.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <Package className="size-8 mx-auto text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{t('pos.noVariants')}</p>
            </div>
          ) : (
            <>
              {/* Search & Filter Controls */}
              <div className="space-y-2.5">
                <div className="relative group">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none" />
                  <Input
                    placeholder={t('pos.variantSearchPlaceholder')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full h-10 pl-10 pr-9 rounded-xl bg-muted/40 border-border/70 focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/20 transition-all"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>

                {variantTypes.length > 0 && (
                  <div className="flex gap-2">
                    <div className="flex min-w-0">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                              'w-full justify-between px-3 text-xs h-9 rounded-xl border-border/75 transition-colors',
                              selectedType
                                ? 'bg-primary/5 border-primary/40 text-primary font-medium'
                                : 'bg-muted/30 hover:bg-muted/60',
                            )}
                          >
                            <span className="truncate">
                              {selectedType || t('pos.allTypes')}
                            </span>
                            <ChevronDown className="size-3.5 opacity-60 shrink-0 ml-2" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          className="w-full min-w-[160px] rounded-xl"
                          align="start"
                        >
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedType('')
                              setSelectedValue('')
                            }}
                            className={cn(
                              'rounded-lg',
                              !selectedType && 'bg-accent font-medium',
                            )}
                          >
                            {t('pos.allTypes')}
                          </DropdownMenuItem>
                          {variantTypes.map((type) => (
                            <DropdownMenuItem
                              key={type}
                              onClick={() => {
                                setSelectedType(type)
                                setSelectedValue('')
                              }}
                              className={cn(
                                'rounded-lg',
                                selectedType === type && 'bg-accent font-medium',
                              )}
                            >
                              {type}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {selectedType && variantValuesForSelectedType.length > 0 && (
                      <div className="flex-1 min-w-0">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className={cn(
                                'w-full justify-between px-3 text-xs h-9 rounded-xl border-border/75 transition-colors',
                                selectedValue
                                  ? 'bg-primary/5 border-primary/40 text-primary font-medium'
                                  : 'bg-muted/30 hover:bg-muted/60',
                              )}
                            >
                              <span className="truncate">
                                {selectedValue || t('pos.allValues')}
                              </span>
                              <ChevronDown className="size-3.5 opacity-60 shrink-0 ml-2" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            className="w-full min-w-[160px] rounded-xl"
                            align="start"
                          >
                            <DropdownMenuItem
                              onClick={() => setSelectedValue('')}
                              className={cn(
                                'rounded-lg',
                                !selectedValue && 'bg-accent font-medium',
                              )}
                            >
                              {t('pos.allValues')}
                            </DropdownMenuItem>
                            {variantValuesForSelectedType.map((value) => (
                              <DropdownMenuItem
                                key={value}
                                onClick={() => setSelectedValue(value)}
                                className={cn(
                                  'rounded-lg',
                                  selectedValue === value && 'bg-accent font-medium',
                                )}
                              >
                                {value}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Variant Cards */}
              <div className="space-y-2.5">
                {displayChildren.length === 0 ? (
                  <div className="py-8 text-center rounded-xl border border-dashed border-border/70 bg-muted/20">
                    <p className="text-sm text-muted-foreground">
                      {t('pos.noVariants')}
                    </p>
                  </div>
                ) : (
                  displayChildren.map((child) => {
                    const isSelected = selectedIds.has(child.id)
                    const isOutOfStock = Number(child.stock) <= 0

                    return (
                      <button
                        key={child.id}
                        type="button"
                        disabled={isOutOfStock}
                        onClick={() => toggleSelectVariant(child)}
                        className={cn(
                          'group relative w-full flex items-center gap-3.5 p-3 rounded-xl border text-left transition-all duration-200',
                          isOutOfStock
                            ? 'opacity-55 cursor-not-allowed border-border/50 bg-muted/20'
                            : isSelected
                              ? 'border-primary bg-primary/[0.06] ring-2 ring-primary/20 shadow-sm'
                              : 'border-border/70 bg-card hover:bg-muted/40 hover:border-primary/40 hover:shadow-xs active:scale-[0.995]',
                        )}
                      >
                        <div className="relative size-13 shrink-0 rounded-lg overflow-hidden bg-muted border border-border/60">
                          <img
                            src={child.imageUrl || FALLBACK_IMG}
                            alt={child.name}
                            className={cn(
                              'size-full object-cover transition-transform duration-300',
                              !isOutOfStock && 'group-hover:scale-105',
                            )}
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold text-sm text-foreground truncate leading-snug">
                              {getVariantLabel(child)}
                            </p>
                            <span className="font-bold text-sm text-foreground tabular-nums shrink-0">
                              {formatMoney(child.price)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2 mt-1.5">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-mono font-medium bg-muted text-muted-foreground border border-border/50 truncate">
                              {child.sku}
                            </span>

                            <span
                              className={cn(
                                'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border shrink-0',
                                getStockBadgeStyle(child.stock),
                              )}
                            >
                              {t('pos.availableStock', { stock: child.stock })}
                            </span>
                          </div>
                        </div>

                        <div
                          className={cn(
                            'size-5 rounded-md border flex items-center justify-center shrink-0 transition-all duration-200',
                            isSelected
                              ? 'bg-primary border-primary text-primary-foreground scale-105 shadow-xs'
                              : 'border-muted-foreground/30 group-hover:border-primary/60 bg-background',
                          )}
                        >
                          {isSelected && <Check className="size-3.5" strokeWidth={3} />}
                        </div>
                      </button>
                    )
                  })
                )}
              </div>

              {hasMore && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full h-9 rounded-xl border border-dashed border-border hover:border-primary/40 hover:bg-primary/5 text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
                  onClick={() => setViewMore(true)}
                >
                  {t('pos.viewMore')} (+{remainingCount} {t('pos.variantList')})
                </Button>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="pb-6 px-10 border-t border-border/60 bg-muted/30 backdrop-blur-md shrink-0 flex flex-row items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground truncate">
              {hasSelection
                ? `${selectedIds.size} variant(s) selected`
                : t('Select (0) ')}
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange?.(false)}
              className="rounded-xl h-10 px-4 border-border/80 hover:bg-muted"
            >
              {t('shared.cancel')}
            </Button>
            <Button
              type="button"
              disabled={!hasSelection}
              onClick={handleConfirm}
              className={cn(
                'rounded-xl h-10 px-5 font-semibold transition-all',
                hasSelection &&
                  'shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/25',
              )}
            >
              {hasSelection && <Sparkles className="size-3.5 mr-1.5 opacity-80" />}
              {hasSelection ? `Add ${selectedIds.size} to Cart` : t('Add to Cart')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}