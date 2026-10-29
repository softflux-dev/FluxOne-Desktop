/**
 * Pure helpers for variant parent → child resolution.
 * Prefer reusable calls from VariantPickerDialog / search — no React here.
 */

function optionTypeName(opt) {
  return String(opt?.typeName || opt?.type_name || '').trim()
}

function optionValueName(opt) {
  return String(opt?.valueName || opt?.value_name || '').trim()
}

function childOptions(child) {
  const raw = child?.variantOptions ?? child?.variant_options
  return Array.isArray(raw) ? raw : []
}

/** Unique option axes from children, sorted by sortOrder then typeName. */
export function collectOptionAxes(children = []) {
  const byType = new Map()
  for (const child of children) {
    const options = childOptions(child)
    for (const opt of options) {
      const typeName = optionTypeName(opt)
      const valueName = optionValueName(opt)
      if (!typeName || !valueName) continue
      const sortOrder = Number(opt?.sortOrder ?? opt?.sort_order ?? 0)
      if (!byType.has(typeName)) {
        byType.set(typeName, { typeName, sortOrder, values: new Map() })
      }
      const axis = byType.get(typeName)
      axis.sortOrder = Math.min(axis.sortOrder, sortOrder)
      if (!axis.values.has(valueName)) {
        axis.values.set(valueName, { valueName, sortOrder })
      }
    }
  }
  return [...byType.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.typeName.localeCompare(b.typeName))
    .map((axis) => ({
      typeName: axis.typeName,
      values: [...axis.values.values()].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.valueName.localeCompare(b.valueName),
      ),
    }))
}

/** True when every required axis has a selection. */
export function selectionComplete(selection = {}, axes = []) {
  if (!axes.length) return true
  return axes.every((axis) => Boolean(selection[axis.typeName]))
}

/**
 * Resolve one child whose options match every required axis selection.
 * Empty axes + single child → that child (malformed/missing option payload).
 */
export function resolveChildBySelection(children = [], selection = {}, axes = []) {
  const list = Array.isArray(children) ? children : []
  if (!list.length) return null

  // No axes on children — allow the only SKU through
  if (!axes.length) {
    return list.length === 1 ? list[0] : null
  }

  if (!selectionComplete(selection, axes)) return null

  return (
    list.find((child) => {
      const options = childOptions(child)
      return axes.every((axis) => {
        const wanted = selection[axis.typeName]
        return options.some(
          (opt) =>
            optionTypeName(opt) === axis.typeName &&
            optionValueName(opt) === wanted,
        )
      })
    }) || null
  )
}

// Parent products open VariantPickerDialog instead of adding directly
export function isVariantParent(product) {
  return Boolean(product?.isVariantParent || product?.productType === 'variant')
}

export function childDisplayName(child) {
  if (!child) return ''
  const label = child.variantLabel ? ` — ${child.variantLabel}` : ''
  return `${child.name || ''}${label}`.trim()
}
