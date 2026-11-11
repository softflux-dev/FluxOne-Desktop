/**
 * Which invoice row/detail actions to show — reusable by list + detail.
 * Return invoices cannot be returned/exchanged again.
 */

/**
 * @param {object} invoice
 * @param {{ assumeReturnable?: boolean }} [opts]
 *   List rows often omit line items — assumeReturnable=true for Sale/Exchange.
 */
export function getInvoiceActions(invoice, opts = {}) {
  const type = String(invoice?.type || 'Sale')
  const isReturn = type === 'Return'
  const items = invoice?.items

  let returnable = opts.assumeReturnable !== false
  if (Array.isArray(items)) {
    returnable = items.some((i) => !i.returned && Number(i.qty) > 0)
  } else if (isReturn) {
    returnable = false
  }

  return {
    view: true,
    print: true,
    // No Return / Exchange on fully returned invoices or empty returnable lines
    return: !isReturn && returnable,
    exchange: !isReturn && returnable,
    // Previous exchange history — useful on Sale / Exchange, not Return slips
    prevExchange: !isReturn,
  }
}
