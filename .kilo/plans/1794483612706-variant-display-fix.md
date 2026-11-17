# Variant Display Fix - Complete Plan (Cart + Invoice History + Invoice Print)

## Problem Summary
Variant products (e.g., "Kolson" with variant "Slanty") only show the parent name in:
1. **Cart** - Fixed in previous task
2. **Invoice History (list page)** - Shows "Kolson, Kolson, Kolson" instead of "Kolson (Slanty), Kolson (Snackers)"
3. **Invoice Detail page** - Shows only parent name
4. **Invoice Print/Receipt** - Fixed in previous task for checkout receipt, but reprint from history doesn't work

**Root Cause**: The `variant_label` is not persisted from cart → checkout → invoice_items table → invoice API → UI.

## Data Flow Trace

### Current Flow (Broken)
```
Cart (sale_tab_items + products JOIN) 
  → checkout() in sale.controller.js 
  → bill.lineDetails (has variantLabel from JOIN) 
  → insertSaleInvoiceItem() - MISSING variantLabel 
  → invoice_items table (no variant_label column) 
  → listInvoices() / getBundle() - MISSING variantLabel 
  → Invoice list/detail/print UI - Shows only name
```

### Required Flow (Fixed)
```
Cart (sale_tab_items + products JOIN) 
  → checkout() 
  → bill.lineDetails (has variantLabel) 
  → insertSaleInvoiceItem(variantLabel) 
  → invoice_items table (WITH variant_label column) 
  → listInvoices() includes variant_label in GROUP_CONCAT 
  → listItems() includes variant_label 
  → publicItem() passes variantLabel 
  → Invoice list/detail/print UI - Shows "Kolson (Slanty)"
```

## Required Changes

### 1. Database Migration
**File**: `server/src/database/migrations/XXX_add_variant_label_to_invoice_items.sql` (new file)

Add `variant_label` column to `invoice_items` table:
```sql
ALTER TABLE invoice_items ADD COLUMN variant_label TEXT;
```

**Optional**: Also add to `sale_tab_items` for consistency:
```sql
ALTER TABLE sale_tab_items ADD COLUMN variant_label TEXT;
```

### 2. Server: Checkout Flow - Save variant_label
**File**: `server/src/controllers/sale.controller.js`
**Location**: `checkout()` function, lines 270-281

Update `insertSaleInvoiceItem` call to include `variantLabel`:
```javascript
saleModel.insertSaleInvoiceItem({
  id: itemId,
  invoiceId,
  productId: line.productId,
  sku: line.sku,
  name: line.name,
  variantLabel: line.variantLabel || null,  // NEW
  qty: line.qty,
  unitPrice: line.unitPrice,
  discount: line.discount || 0,
  tax: line.lineTax,
  lineTotal: line.lineTotal,
});
```

### 3. Server: Invoice Model - Insert variant_label
**File**: `server/src/models/sale.model.js`
**Location**: `insertSaleInvoiceItem()` function, lines 443-456

Add `variant_label` to INSERT:
```javascript
export function insertSaleInvoiceItem(row) {
  const db = connectDb();
  db.prepare(
    `
    INSERT INTO invoice_items (
      id, invoice_id, product_id, sku, name, variant_label, qty,
      unit_price, discount, tax, line_total, is_returned
    ) VALUES (
      @id, @invoiceId, @productId, @sku, @name, @variantLabel, @qty,
      @unitPrice, @discount, @tax, @lineTotal, 0
    )
  `
  ).run(row);
}
```

### 4. Server: Invoice Model - Fetch variant_label
**File**: `server/src/models/invoice.model.js`

**A. `listItems()` function** (lines 49-67) - Add variant_label to SELECT:
```sql
SELECT id, invoice_id AS invoiceId, product_id AS productId, sku, name, 
       variant_label AS variantLabel, qty,
       unit_price AS unitPrice, discount, tax, line_total AS lineTotal,
       is_returned AS isReturned, original_item_id AS originalItemId
FROM invoice_items
WHERE invoice_id = ?
ORDER BY rowid ASC
```

**B. `listInvoices()` function** (lines 209-253) - Update GROUP_CONCAT to include variant_label:
```sql
(
  SELECT GROUP_CONCAT(
    CASE 
      WHEN ii.variant_label IS NOT NULL AND ii.variant_label != '' 
      THEN ii.name || ' (' || ii.variant_label || ')'
      ELSE ii.name
    END, ', '
  )
  FROM invoice_items ii
  WHERE ii.invoice_id = i.id AND ii.is_returned = 0
) AS items
```

### 5. Server: Invoice Utility - Pass variantLabel
**File**: `server/src/shared/utils/invoice.util.js`
**Location**: `publicItem()` function (lines 2-15)

Add variantLabel to returned object:
```javascript
export function publicItem(row) {
  return {
    id: row.id,
    productId: row.productId,
    sku: row.sku,
    name: row.name,
    variantLabel: row.variantLabel || null,  // NEW
    qty: row.qty,
    unitPrice: row.unitPrice,
    discount: row.discount,
    tax: row.tax,
    lineTotal: row.lineTotal,
    isReturned: Boolean(row.isReturned),
  };
}
```

### 6. Client: Invoice List UI - Already handles string format
**File**: `client/src/components/feature/invoices/InvoiceTable.jsx`
**Location**: Lines 84-91

The component already handles both string (from list) and array (from detail) formats. The server's GROUP_CONCAT will now produce "Kolson (Slanty), Kolson (Snackers)" which displays correctly.

### 7. Client: Invoice Detail UI - Add variantLabel display
**File**: `client/src/pages/cashier/invoices/InvoiceDetailPage.jsx`
**Location**: Lines 162-177

Update item display to show variantLabel:
```jsx
<td className="py-2">
  {i.variantLabel ? (
    <>
      <span className="font-medium">{i.name}</span>
      <br />
      <span className="text-xs text-muted-foreground">({i.variantLabel})</span>
    </>
  ) : (
    i.name
  )}
  {i.returned ? (
    <span className="text-muted-foreground">
      {t('invoices.returnedSuffix')}
    </span>
  ) : null}
</td>
```

### 8. Client: ReceiptSlip - Already fixed in previous task
**File**: `client/src/components/feature/print/ReceiptSlip.jsx`
**Location**: Lines 202-210

Already displays variantLabel on second line. Verify it works with reprint (which uses same component via `print` API).

### 9. Client: Mapper - Already fixed in previous task
**Files**: 
- `client/src/lib/mapInvoice.js` - `mapInvoiceItem()` includes variantLabel
- `client/src/lib/mapSale.js` - `mapCheckoutReceipt()` includes variantLabel

These were already updated in the previous task.

## Migration Strategy

1. Create new migration file for `invoice_items.variant_label`
2. Run migration on server startup
3. Deploy code changes
4. Existing invoices without variant_label will show just the name (backward compatible)

## Testing Scenarios

1. **New sale with variants**: Add multiple variants of same parent → checkout → verify invoice list shows "Kolson (Slanty), Kolson (Snackers)"
2. **Invoice detail page**: Click invoice → verify each line shows variant label
3. **Print/Reprint**: Click print on existing invoice → verify receipt shows variant labels
4. **Old invoices**: Verify invoices created before fix still display (without variant labels)
5. **Exchange/Return**: Verify variant labels show in exchange/return flows

## Files to Modify

### Server (7 files)
1. `server/src/database/migrations/XXX_add_variant_label_to_invoice_items.sql` (NEW)
2. `server/src/controllers/sale.controller.js` (checkout function)
3. `server/src/models/sale.model.js` (insertSaleInvoiceItem)
4. `server/src/models/invoice.model.js` (listItems, listInvoices)
5. `server/src/shared/utils/invoice.util.js` (publicItem)

### Client (2 files)
6. `client/src/pages/cashier/invoices/InvoiceDetailPage.jsx` (item display)
7. `client/src/components/feature/invoices/InvoiceTable.jsx` (verify - should work automatically)

### Already Done (Previous Task)
- `client/src/lib/mapInvoice.js` - mapInvoiceItem()
- `client/src/lib/mapSale.js` - mapCheckoutReceipt(), mapSaleItem()
- `client/src/components/feature/pos/CartPanel.jsx`
- `client/src/components/feature/print/ReceiptSlip.jsx`
- `server/src/models/sale.model.js` - ITEM_WITH_IMAGE query, getInvoiceBundle()