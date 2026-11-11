import { isUuid } from './syncErrorCodes.js';

function resolveCounterCode(counter, invoice) {
  return counter?.code ?? counter?.counterCode ?? invoice?.counterCode ?? null;
}

/**
 * Sale PUSH lines (canonical). Separate from sales PULL which uses items[].
 */
function mapSaleLines(items = [], { isExchange = false } = {}) {
  return items.map((line) => ({
    invoiceItemId: line.id ?? line.invoiceItemId ?? null,
    productId: line.productId,
    sku: line.sku,
    name: line.name,
    quantity: Number(line.qty ?? line.quantity) || 0,
    unitPrice: line.unitPrice,
    discount: line.discount ?? 0,
    tax: line.tax ?? line.lineTax ?? 0,
    lineTotal: line.lineTotal,
    scale: line.scale ?? line.unitScale ?? 'unit',
    isExchange: isExchange || Boolean(line.isExchange),
  }));
}

/**
 * Only UUID/GUID staff ids are sent as staffUserId (cloud drops non-GUID silently).
 * Local login keys stay on employeeId / cashierName for logs.
 */
function resolveStaffUserId(employee, invoice) {
  const candidates = [
    employee?.id,
    employee?.userId,
    invoice?.cashierId,
    invoice?.employeeId,
    invoice?.staffUserId,
  ];
  for (const value of candidates) {
    if (isUuid(value)) return value;
  }
  return undefined;
}

function resolveEmployeeId(employee, invoice) {
  return (
    employee?.id ??
    invoice?.employeeId ??
    invoice?.cashierId ??
    null
  );
}

/**
 * Canonical SalePushPayload for POST /sync/push eventType=sale.
 * Prefer cloud names: lines, discountAmount, taxAmount, finalAmount, paidAmount, returnAmount, staffUserId.
 */
export function mapInvoiceToSaleEvent(invoice, items, employee, counter = null, extra = {}) {
  const {
    taxes = [],
    exchange = false,
    exchangedCredit,
    replacementTotal,
    metadata = {},
    status,
    ...rest
  } = extra;

  const staffUserId = resolveStaffUserId(employee, invoice);
  const employeeId = resolveEmployeeId(employee, invoice);
  const lines = mapSaleLines(items, { isExchange: exchange });

  const payload = {
    saleNumber: invoice.id,
    invoiceId: invoice.id,
    type: invoice.type,
    lines,
    // Keep items[] alias for older cloud builds during rollout.
    items: lines,
    discountAmount: invoice.discount ?? 0,
    taxAmount: invoice.tax ?? 0,
    finalAmount: invoice.total,
    paidAmount: invoice.tendered,
    returnAmount: invoice.changeDue,
    // Legacy aliases still accepted by cloud.
    discount: invoice.discount ?? 0,
    tax: invoice.tax ?? 0,
    total: invoice.total,
    tendered: invoice.tendered,
    changeDue: invoice.changeDue,
    netDue: invoice.netDue ?? 0,
    paymentMethod: invoice.paymentMethod ?? 'cash',
    cashierName: employee?.name ?? null,
    employeeId,
    counterId: counter?.id ?? invoice.counterId ?? null,
    counterCode: resolveCounterCode(counter, invoice),
    soldAt: invoice.createdAt ?? new Date().toISOString(),
    taxes,
    exchange: Boolean(exchange),
    isExchange: Boolean(exchange),
    exchangedCredit,
    replacementTotal,
    status: status ?? (exchange ? 'completed' : 'completed'),
    ...metadata,
    ...rest,
  };

  if (staffUserId) {
    payload.staffUserId = staffUserId;
    payload.cashierId = staffUserId;
  }

  return payload;
}

/**
 * Canonical refund push payload.
 * saleNumber/invoiceId REQUIRED. status must be refunded|partial_refund
 * unless reason contains exchange / exchange_given.
 */
export function mapRefundEvent({
  invoice,
  returnedItems,
  refundAmount,
  employee,
  counter = null,
  extra = {},
}) {
  const refundedAt = invoice.createdAt ?? new Date().toISOString();
  const reason = extra.reason ?? null;
  const isExchangeReason =
    typeof reason === 'string' &&
    (reason.toLowerCase().includes('exchange') ||
      reason.toLowerCase().includes('exchange_given'));

  const staffUserId = resolveStaffUserId(employee, invoice);
  const employeeId = resolveEmployeeId(employee, invoice);
  const lines = mapSaleLines(returnedItems);

  const payload = {
    saleNumber: invoice.id,
    invoiceId: invoice.id,
    originalInvoiceId: invoice.originalInvoiceId ?? invoice.id,
    originalSaleNumber: invoice.originalInvoiceId ?? invoice.id,
    lines,
    items: lines,
    refundAmount,
    finalAmount: refundAmount,
    discountAmount: 0,
    taxAmount: 0,
    cashierName: employee?.name ?? null,
    employeeId,
    counterId: counter?.id ?? invoice.counterId ?? null,
    counterCode: resolveCounterCode(counter, invoice),
    paymentMethod: invoice.paymentMethod ?? 'cash',
    refundedAt,
    soldAt: refundedAt,
    status: isExchangeReason ? undefined : extra.status ?? 'refunded',
    reason,
    ...extra,
  };

  // Ensure exchange reasons are not forced into refunded status incorrectly.
  if (isExchangeReason && payload.status == null) {
    delete payload.status;
  }

  if (staffUserId) {
    payload.staffUserId = staffUserId;
    payload.cashierId = staffUserId;
  }

  return payload;
}

/**
 * Map local activity → cloud cashier_log payload.
 * Cloud BM Logs UI expects actorName / actorRole so it can render
 * "{Person} performed {action} at {time}" without joining POS employee ids.
 * actorUserId must be GUID; non-GUID is omitted (cloud drops silently).
 */
export function mapActivityToCashierLog({
  action,
  employeeId,
  actorUserId = null,
  actorName = null,
  actorRole = null,
  entityType,
  entityId,
  details,
  createdAt,
  branchId = null,
  deviceId = null,
}) {
  let metadata = details;
  if (typeof details === 'string') {
    try {
      metadata = JSON.parse(details);
    } catch {
      metadata = { raw: details };
    }
  }

  const payload = {
    action,
    employeeId: employeeId ?? null,
    actorName: actorName ?? null,
    actorRole: actorRole ?? null,
    entityType: entityType ?? null,
    entityId: entityId ?? null,
    metadata: metadata ?? {},
    timestamp: createdAt ?? new Date().toISOString(),
  };

  if (isUuid(actorUserId)) {
    payload.actorUserId = actorUserId;
  } else if (isUuid(employeeId)) {
    payload.actorUserId = employeeId;
  }

  if (branchId) payload.branchId = branchId;
  if (deviceId) payload.deviceId = deviceId;
  return payload;
}

/** POS Items Rate → cloud catalog selling price (Policy A, branch-scoped product). */
export function mapProductPriceUpdateEvent({
  productId,
  branchId,
  sellingPrice,
  discountPercent = 0,
  updatedAt,
  updatedByUserId = null,
  deviceId = null,
  source = 'pos_items_rate',
}) {
  const payload = {
    productId,
    branchId,
    sellingPrice: Number(sellingPrice),
    price: Number(sellingPrice),
    discountPercent: Number(discountPercent) || 0,
    source,
    updatedAt: updatedAt ?? new Date().toISOString(),
  };
  if (isUuid(updatedByUserId)) {
    payload.updatedByUserId = updatedByUserId;
  }
  if (deviceId) payload.deviceId = deviceId;
  return payload;
}
