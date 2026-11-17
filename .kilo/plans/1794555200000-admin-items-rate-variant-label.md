# Plan: Fix missing variant_label in Admin Items Rate product list

**Plan file:** `.kilo/plans/1794555200000-admin-items-rate-variant-label.md`
**Status:** Implementation-ready

---

## Goal
Make `variantLabel` available on every product row returned by `GET /api/admin/products` (the Items Rate / Admin Products list) so `ItemTable` can render `({variantLabel})` next to variant child products (e.g., "Kolson (Slanty)").

---

## Break point found

The data pipeline is:
`ItemsRatePage` → `useAdminProducts` → `fetchAdminProducts` (adminSlice) → `mapAdminProducts`/`mapAdminProduct` → `mapApiProduct` → `ItemTable`.

`mapApiProduct` (`client/src/lib/mapProduct.js:50`) already maps `variantLabel: product.variantLabel || null`, and `mapAdminProduct` (`client/src/lib/mapAdmin.js:81`) spreads `...base`, so the client side preserves whatever the backend sends.

The server `admin.model.js` has **two separate field lists**:

1. `PRODUCT_DETAIL_FIELDS` (line 6-16) — used by `findProduct(id)` (detail endpoint `GET /api/admin/products/:id`). This **includes** `p.variant_label AS variantLabel` (line 14).
2. `listProducts()` (line 170-221) — used by the **list** endpoint `GET /api/admin/products` that feeds the Items Rate page. Its inline SELECT (lines 197-201) **omits** `p.variant_label`.

So the backend row sent to the Items Rate table has no `variant_label` column → `product.variantLabel` is `undefined` → client maps it to `null`. That matches the user's console.log: every product shows `Variant: null`.

### Exact fix (single hunk)

`server/src/models/admin.model.js`, `listProducts()` SELECT block (lines 197-201):

Before:
```sql
      SELECT p.id, p.sku, p.barcode, p.name, p.image_url AS imageUrl,
             p.price, p.discount, p.stock,
             p.offer_id AS offerId, o.name AS offerName, o.percent AS offerPercent,
             p.category_id AS categoryId, p.subcategory_id AS subcategoryId,
             c.name AS categoryName, s.name AS subcategoryName
```

After (add `p.variant_label AS variantLabel`):
```sql
      SELECT p.id, p.sku, p.barcode, p.name, p.image_url AS imageUrl,
             p.price, p.discount, p.stock,
             p.offer_id AS offerId, o.name AS offerName, o.percent AS offerPercent,
             p.category_id AS categoryId, p.subcategory_id AS subcategoryId,
             p.variant_label AS variantLabel,
             c.name AS categoryName, s.name AS subcategoryName
```

This makes `listProducts` consistent with `PRODUCT_DETAIL_FIELDS` (which already has the column). No mapper change needed — `mapApiProduct` already reads `product.variantLabel`.

### Optional follow-up (out of scope)
`listProducts` search (`WHERE` clause, line 183) doesn't search `p.variant_label`, unlike `catalog.model.js:listProducts` (line 216). That's a separate enhancement — not blocking this fix.

---

## Validation steps
1. Restart the server (or reload if hot-reload enabled).
2. Open Items Rate page (Admin → Items Rate). Open a product group with variants (e.g., Kolson → Slanty, Snackers, Potato Sticks).
3. Console.log each product passed to `ItemTable` → `variantLabel` should now be `"Slanty"`, `"Snackers"`, etc. (not null).
4. ItemTable (already edited in prior turn) renders `{p.variantLabel}` as `({p.variantLabel})` next to the name; verify the UI shows "Kolson (Slanty)" etc.
5. Run ESLint on the client file if re-opened: `npx eslint "client/src/components/feature/admin/ItemTable.jsx"` (passes already).
6. No typecheck script in `client/package.json` (`.jsx`); server-side verify by running the list endpoint query directly against the DB if desired.

---

## Rollback
Revert the single column addition in `admin.model.js:197-201` if a regression appears. No new dependencies.

---

## Open questions
None. The fix is a single missing column in the `listProducts` SQL SELECT.
