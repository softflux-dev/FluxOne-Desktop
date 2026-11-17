# Plan: Fix Invoice List Sorting + Return Slip Variant Display

**Plan file:** `.kilo/plans/1794553200000-invoice-sort-and-return-slip-variant.md`
**Status:** Implementation-ready (plan only; no source edits made in this turn)

---

## Goal
1. Ensure the Invoice History list shows newest transactions first (sort by `created_at` DESC).
2. Show the variant label next to each returned item in the Return Slip modal (e.g., "Kolson" / "(Slanty)").

---

## Bug 1 — Invoice History sorting (verification finding)

### Root cause analysis
- `server/src/models/invoice.model.js` `listInvoices()` (line 210) already applies `ORDER BY i.created_at DESC, i.id DESC` (line 252).
- `invoices.created_at` is `TEXT NOT NULL DEFAULT (datetime('now'))` (schema `FluxOne_Desktop.sql` line 257, plus migration `003_sales.sql` line 15) — always populated, no NULLs.
- Controller `invoice.controller.js:list` (line 16) uses `invoiceModel.listInvoices(q).map(publicInvoiceRow)` — no reordering.
- Client `useInvoices` (`client/src/hooks/useInvoices.js`) only `slice()`s the server-returned list for pagination; `InvoiceTable.jsx` renders `invoices` as-is (no client-side sort).

### Conclusion
Bug 1 is **already implemented correctly in this repo** — the list is newest-first by `created_at` DESC. The user's report likely reflects a stale deployed build. 

### Action for Bug 1
No source change required. Redeploy this repo's `server/src/models/invoice.model.js` (and client) if the live system still shows unsorted. If the user can reproduce on a build matching this repo, re-open Bug 1 with reproduction steps.

### Risk
None — no code change.

---

## Bug 2 — Return Slip shows repeated parent name, no variant label

### Root cause
Data already flows correctly:
- `return.controller.js:42` builds `selected` from `invoiceModel.listItems(invoiceId)`, which selects `variant_label AS variantLabel` (`invoice.model.js:54-55`).
- `mapInvoiceItem` (`client/src/lib/mapInvoice.js:114-130`) maps `variantLabel: item.variantLabel || null`.
- `mapReturnSlip` (`client/src/lib/mapInvoice.js:228-248`) maps `returnedItems` via `mapInvoiceItem` → `returnSlip.lines[]` carries `variantLabel`.
- **The JSX only renders `{i.name}`** (`InvoiceActionDialogs.jsx:360-365`), dropping `i.variantLabel`.

Compare working implementations:
- `client/src/pages/cashier/invoices/InvoiceDetailPage.jsx:165-169` renders `name` + `({variantLabel})`.
- `client/src/components/feature/print/ReceiptSlip.jsx:205-213` same pattern.

### Affected file
`client/src/components/feature/invoices/InvoiceActionDialogs.jsx` — `ReturnSlipDialog` items table (lines ~360-366).

### Exact code change (Bug 2)

Current (InvoiceActionDialogs.jsx:360-366):
```jsx
              <tbody>
                {returnSlip.lines.map((i, idx) => (
                  <tr key={i.id || idx} className="border-b border-neutral-200">
                    <td className="py-1">{i.name}</td>
                    <td className="py-1">{i.sku}</td>
                    <td className="py-1 text-end">{i.qty}</td>
                  </tr>
                ))}
              </tbody>
```

Replacement:
```jsx
              <tbody>
                {returnSlip.lines.map((i, idx) => (
                  <tr key={i.id || idx} className="border-b border-neutral-200">
                    <td className="py-1">
                      {i.variantLabel ? (
                        <>
                          <span className="block">{i.name}</span>
                          <span className="text-[10px] text-neutral-500">
                            ({i.variantLabel})
                          </span>
                        </>
                      ) : (
                        i.name
                      )}
                    </td>
                    <td className="py-1">{i.sku}</td>
                    <td className="py-1 text-end">{i.qty}</td>
                  </tr>
                ))}
              </tbody>
```

This mirrors `InvoiceDetailPage.jsx:165-169` and `ReceiptSlip.jsx:205-213`. `lines[].variantLabel` is already populated by `mapReturnSlip`, so no server or mapper change is needed.

---

## Validation steps
1. Process a return of a variant item (e.g., Kolson (Slanty)). Open Return Slip modal. Confirm the "Returned Item" cell shows "Kolson" on line 1 and "(Slanty)" on line 2 (non-variant items show just the name).
2. Confirm Invoice History list (`/invoices`) shows newest sale at top — already the case via `ORDER BY created_at DESC`; verify by making two sales a minute apart and checking order.
3. Run ESLint on the modified file: `npx eslint "client/src/components/feature/invoices/InvoiceActionDialogs.jsx"` (client package, `lint` script).
4. No typecheck script exists in `client/package.json` (`.jsx` file); rely on lint + manual UI verification.

---

## Rollback
Revert the single JSX hunk in `InvoiceActionDialogs.jsx` if a regression appears. No new dependencies.

---

## Open questions
- Bug 1: If the user's live build (matching this repo) still shows unsorted invoices, re-open with exact reproduction; the server query and schema already enforce DESC ordering.
- None for Bug 2.
