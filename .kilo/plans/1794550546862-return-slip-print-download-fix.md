# Plan: Fix Return Slip Print / Download buttons (Desktop POS)

**Plan file:** `.kilo/plans/1794550546862-return-slip-print-download-fix.md`
**Status:** Implementation-ready

---

## Goal
Make the "Print Slip" and "Download PDF" buttons in the Return Slip modal functional by reusing the existing `usePrintSlip` hook, consistent with the Invoice Receipt modal.

## Root Cause
In `client/src/components/feature/invoices/InvoiceActionDialogs.jsx`, `ReturnSlipDialog`:
1. Line 312: `const { printSlip, downloadSlip } = usePrintSlip()` — but `usePrintSlip` (`client/src/components/feature/print/usePrintSlip.js:123`) returns `{ savePdf, savePng }`. So `printSlip` and `downloadSlip` are both `undefined`.
2. Line 382: Print button `onClick={() => printSlip(returnSlip?.invoice?.id)}` calls an undefined function and passes only the invoice id string instead of `(invoice, printTargetId)`.
3. Lines 389-391: Download button `onClick={() => downloadSlip(returnSlip?.invoice, PRINT_AREA_ID.return)}` calls an undefined function.

Clicking either button throws a TypeError (effectively "does nothing"), matching the reported bug.

## What is already correct
- The slip wrapper div already has `id={PRINT_AREA_ID.return}` which resolves to `print-area-return` (InvoiceActionDialogs.jsx:338, printArea.js:4) — unique id requirement satisfied.
- `PRINT_AREA_ID` and `PRINT_AREA_CLASS` are already imported (lines 22-25).
- `usePrintSlip` is already imported (line 21).
- The hook's `savePdf(invoice, printTarget)` captures via html-to-image `toCanvas` + jsPDF and saves `${invoice.id}.pdf`; `savePng(invoice, printTarget)` captures the canvas and downloads `${invoice.id}.png`.

## Affected Files
- `client/src/components/feature/invoices/InvoiceActionDialogs.jsx` — only file needing changes (`ReturnSlipDialog`).

## Exact Code Changes

### Change 1: Fix hook destructuring (line 312)
Before:
```js
const { printSlip, downloadSlip } = usePrintSlip()
```
After:
```js
const { savePdf, savePng } = usePrintSlip()
```

### Change 2: Print Slip button onClick (line 382)
Before:
```jsx
onClick={() => printSlip(returnSlip?.invoice?.id)}
```
After:
```jsx
onClick={() => savePdf(returnSlip?.invoice, PRINT_AREA_ID.return)}
```

### Change 3: Download button onClick (lines 389-391)
Before:
```jsx
onClick={() =>
  downloadSlip(returnSlip?.invoice, PRINT_AREA_ID.return)
}
```
After:
```jsx
onClick={() => savePng(returnSlip?.invoice, PRINT_AREA_ID.return)}
```

## Design Decision
Mirror `ReceiptDialog` (`client/src/components/feature/print/ReceiptDialog.jsx:48-63`) exactly:
- "Print Slip" → `savePdf` (generates PDF via html2canvas/jsPDF and saves).
- "Download" → `savePng` (captures canvas and downloads a PNG image).

Note: the i18n label key is `returnSlip.downloadPdf` ("Download PDF") but the reused hook's download artifact is a PNG, identical to the Invoice Receipt modal's "Download (PNG)" behavior. Making download produce a separate PDF would be redundant with `savePdf` and is out of scope; if a second PDF download is truly required, that is a separate enhancement to `usePrintSlip`.

## Validation Steps
1. Open Desktop POS → process a return → Return Slip modal opens.
2. Click "Print Slip" → expect a `${invoice.id}.pdf` download (no console error).
3. Click "Download PDF" → expect a `${invoice.id}.png` download (no console error).
4. Confirm no TypeError / console errors on either click.
5. Run project lint/typecheck (per repo scripts) on the modified file.

## Rollback
Revert the three hunks in `InvoiceActionDialogs.jsx` if regression occurs; no new dependencies introduced.

## Open Questions
None blocking. The label/function naming mismatch (`downloadPdf` label vs PNG download) is pre-existing and intentionally left consistent with the Invoice Receipt modal per the reuse requirement.