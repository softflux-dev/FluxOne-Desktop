# Fix Cart Display: Parent Name + Variant Label Separation

## Problem
When adding a variant from Variant Picker Dialog to cart, the Cart Panel displays the full concatenated name (e.g., "Kolson (Slanty, Snackers, Potato Sticks) — Potato Stick") instead of:
- **Line 1 (bold)**: Clean parent product name — "Kolson"
- **Line 2 (muted, smaller)**: Variant label — "Potato Stick"

## Root Cause
The server returns the full name in `item.name`. The client's `mapSaleItem()` passes this directly to the cart, and `CartPanel` renders `line.name` as a single line.

The variant product object already contains:
- `parentId` — links to parent product
- `variantLabel` — the specific variant value (e.g., "Potato Stick")
- `name` — full name with parenthetical variant list

But `mapSaleItem()` doesn't extract/separate these.

## Solution
1. **mapSale.js** — Update `mapSaleItem()` to extract clean parent name and variant label
2. **CartPanel.jsx** — Render parent name and variant label as two separate lines

## Implementation Plan

### 1. Update `mapSaleItem()` in `client/src/lib/mapSale.js`
Add logic to:
- Detect if item is a variant (has `parentId` or `variantLabel`)
- Extract clean parent name using `cleanParentName()` from `variantResolve`
- Extract variant label from `variantLabel` or derive from `variantOptions`
- Add two new fields to returned object: `parentName`, `variantLabel`

```javascript
import { cleanParentName, childDisplayName } from '@/lib/variantResolve'

export function mapSaleItem(item) {
  // ... existing code ...
  const parentName = item.parentId ? cleanParentName(item.name) : item.name
  const variantLabel = item.variantLabel || (item.parentId ? childDisplayName(item) : '')
  
  return {
    // ... existing fields ...
    parentName,
    variantLabel,
  }
}
```

### 2. Update `CartPanel.jsx` to render two lines
Replace single `line.name` render (line 179-180) with:
```jsx
<p className="truncate text-sm font-semibold sm:text-[15px]">
  {line.parentName}
</p>
{line.variantLabel && (
  <p className="truncate text-xs text-muted-foreground mt-0.5">
    {line.variantLabel}
  </p>
)}
<p className="text-xs text-primary">{line.sku}</p>
```

## Files to Modify
1. `client/src/lib/mapSale.js` — Add import and extraction logic
2. `client/src/components/feature/pos/CartPanel.jsx` — Update render logic

## Edge Cases
- Non-variant products: `parentName` = full name, `variantLabel` = empty
- Variant without `variantLabel`: derive from `variantOptions`
- Server response may not include `parentId`/`variantLabel` — fallback to name parsing

## Validation
- Add variant "Potato Stick" from parent "Kolson" to cart
- Verify cart shows "Kolson" (bold) on line 1, "Potato Stick" (muted) on line 2
- Verify non-variant products still show correctly (single line)
- Verify SKU, price, qty, image still work