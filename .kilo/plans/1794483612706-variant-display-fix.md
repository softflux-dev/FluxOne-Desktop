# Variant Display Fix Plan

## Problem Summary
Variant products (e.g., "Kolson" with variant "Slanty") only show the parent name in both Cart and Invoice/Receipt. The variant label is lost during data mapping.

## Root Cause Analysis

### Cart Flow
1. User selects variant child in `VariantPickerDialog` → `handleAddSellable(childProduct)` 
2. `useCart.addItem({ productId: child.id, product: child })` sends child product to server
3. Server `sale.controller.addItem` creates cart line with `name: product.name` (child's name, often same as parent)
4. Server returns cart line via `findItem()` using `ITEM_WITH_IMAGE` query — **does not include `variant_label`**
5. Client `mapSaleItem()` maps only `name` — **drops `variantLabel`**
6. `CartPanel` displays only `line.name`

### Invoice/Receipt Flow
1. Checkout creates `invoice_items` with `name: line.name` (cart line name, no variant label)
2. `getInvoiceBundle()` fetches `invoice_items` — **no `variant_label` column exists**
3. `mapCheckoutReceipt()` maps items with only `name`
4. `ReceiptSlip` displays only `item.name`

## Required Changes

### 1. Server: Include variant_label in Cart Line Query
**File:** `server/src/models/sale.model.js`
**Location:** `ITEM_WITH_IMAGE` constant (lines 195-205)
**Change:** Add `p.variant_label AS variantLabel` to the SELECT clause

### 2. Client: Map variantLabel in Cart Line
**File:** `client/src/lib/mapSale.js`
**Location:** `mapSaleItem()` function (lines 20-40)
**Change:** Add `variantLabel: item.variantLabel || null` to returned object

### 3. Client: Display variantLabel in CartPanel
**File:** `client/src/components/feature/pos/CartPanel.jsx`
**Location:** Lines 178-193 (item name display)
**Change:** Show `line.name` in bold, `line.variantLabel` below in smaller muted font

### 4. Server: Include variant_label in Invoice Bundle Query
**File:** `server/src/models/sale.model.js`
**Location:** `getInvoiceBundle()` function (lines 517-526)
**Change:** JOIN with products table to fetch `variant_label` for each invoice item

### 5. Client: Map variantLabel in Invoice Item
**File:** `client/src/lib/mapInvoice.js`
**Location:** `mapInvoiceItem()` function (lines 114-129)
**Change:** Add `variantLabel: item.variantLabel || null` to returned object

### 6. Client: Map variantLabel in Checkout Receipt
**File:** `client/src/lib/mapSale.js`
**Location:** `mapCheckoutReceipt()` function (lines 140-148)
**Change:** Include `variantLabel` in mapped items array

### 7. Client: Display variantLabel in ReceiptSlip
**File:** `client/src/components/feature/print/ReceiptSlip.jsx`
**Location:** Lines 202-209 (item row rendering)
**Change:** Show `item.name` + `item.variantLabel` (e.g., "Kolson — Slanty" or two-line display)

## Data Structure Changes

### Cart Line (mapSaleItem output)
```javascript
{
  lineId: string,
  productId: string,
  name: string,           // "Kolson"
  variantLabel: string,   // "Slanty" (NEW)
  sku: string,
  imageUrl: string|null,
  emoji: string,
  qty: number,
  unitPrice: number,
  discount: number,
  discountAmt: number,
  actualPrice: number,
  returned: boolean,
  kept: boolean
}
```

### Invoice Item (mapInvoiceItem output)
```javascript
{
  id: string,
  lineId: string,
  productId: string,
  sku: string,
  name: string,           // "Kolson"
  variantLabel: string,   // "Slanty" (NEW)
  qty: number,
  unitPrice: number,
  discount: number,
  tax: number,
  lineTotal: number,
  returned: boolean
}
```

## Display Format

### Cart
```
┌─────────────────────────────────┐
│ 📦  Kolson          ×1  ₹50.00  │
│      Slanty                    │  ← variantLabel in smaller muted text
└─────────────────────────────────┘
```

### Receipt
```
Kolson — Slanty          1    ₹50.00
```
OR two-line:
```
Kolson
Slanty                   1    ₹50.00
```

## Implementation Order
1. Server: sale.model.js ITEM_WITH_IMAGE query
2. Client: mapSale.js mapSaleItem()
3. Client: CartPanel.jsx rendering
4. Server: sale.model.js getInvoiceBundle() query
5. Client: mapInvoice.js mapInvoiceItem()
6. Client: mapSale.js mapCheckoutReceipt()
7. Client: ReceiptSlip.jsx rendering

## Testing Scenarios
1. Add single variant to cart → verify variant label shows in cart
2. Add multiple variants of same parent → verify each shows distinct variant label
3. Checkout with multiple variants → verify receipt shows each variant distinctly
4. Reprint invoice → verify variant labels persist
5. Exchange/return flow → verify variant labels shown correctly

## Files to Modify
1. `server/src/models/sale.model.js` (2 locations)
2. `client/src/lib/mapSale.js` (2 functions)
3. `client/src/lib/mapInvoice.js` (1 function)
4. `client/src/components/feature/pos/CartPanel.jsx`
5. `client/src/components/feature/print/ReceiptSlip.jsx`