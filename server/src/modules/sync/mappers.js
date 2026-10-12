import {
  isBcryptPasswordHash,
  resolveCloudPasswordHash,
} from '../../shared/utils/passwordHash.js';

export { isBcryptPasswordHash, resolveCloudPasswordHash };

const SKIP_CLOUD_ROLES = new Set(['inventory_manager', 'b2b_admin']);

const CLOUD_ROLE_TO_POS = Object.freeze({
  branch_manager: 'admin',
  cashier: 'cashier',
});

export function normalizeSnapshot(data = {}) {
  return {
    tenant: data.tenant ?? null,
    branch: data.branch ?? null,
    // Preserve "users key missing" vs "users: []" for deactivate-on-full-list.
    users: Array.isArray(data.users) ? data.users : [],
    usersProvided: Array.isArray(data.users),
    categories: data.categories ?? [],
    products: data.products ?? [],
    taxes: data.taxes ?? [],
    productTaxes: data.productTaxes ?? data.product_taxes ?? [],
    branchInventory: data.branchInventory ?? data.branch_inventory ?? [],
    counters: data.counters ?? data.posCounters ?? data.pos_counters ?? [],
    company: data.company ?? data.companySettings ?? data.settings ?? null,
    // Top-level policies[] (printOnSlip) — merged into company footer when present.
    policies: Array.isArray(data.policies) ? data.policies : null,
    // Preserve "offers key missing" vs "offers: []" so partial payloads cannot wipe promos.
    offers: Array.isArray(data.offers) ? data.offers : [],
    offersProvided: Array.isArray(data.offers),
  };
}

export function mapCloudUserToEmployee(user = {}) {
  const roleSlug = String(
    user.role?.slug ?? user.roleSlug ?? user.role_slug ?? user.role ?? ''
  ).toLowerCase();

  if (SKIP_CLOUD_ROLES.has(roleSlug)) {
    return null;
  }

  const posRole = CLOUD_ROLE_TO_POS[roleSlug];
  if (!posRole) {
    return null;
  }

  const passwordHash = resolveCloudPasswordHash(user);
  const name = user.name ?? user.fullName ?? user.full_name ?? null;
  // Contract: loginId → local email / user_id (POS login key)
  const email =
    user.loginId ??
    user.login_id ??
    user.email ??
    user.userId ??
    user.user_id ??
    null;
  if (!user.id || !email || !name) {
    return null;
  }

  return {
    id: user.id,
    userId: email,
    email,
    name,
    role: posRole,
    passwordHash,
    pictureUrl: user.pictureUrl ?? user.picture_url ?? null,
    isActive:
      user.isActive !== undefined
        ? user.isActive
          ? 1
          : 0
        : user.is_active !== undefined
          ? user.is_active
            ? 1
            : 0
          : 1,
  };
}

export function splitCloudCategories(categories = []) {
  const roots = [];
  const children = [];
  const childParentMap = new Map();
  const childCountByRoot = new Map();

  for (const category of categories) {
    const id = category.id;
    const parentId = category.parentId ?? category.parent_id ?? null;
    if (!id) continue;

    if (!parentId) {
      roots.push(category);
      continue;
    }

    children.push(category);
    childParentMap.set(id, parentId);
    childCountByRoot.set(parentId, (childCountByRoot.get(parentId) || 0) + 1);
  }

  return { roots, children, childParentMap, childCountByRoot };
}

export function mapCloudCategoryRow(category, childCountByRoot) {
  const id = category.id;
  const childCount = childCountByRoot.get(id) || 0;
  return {
    id,
    name: category.name,
    hasSubcategories: childCount > 0 ? 1 : 0,
    sortOrder: category.sortOrder ?? category.sort_order ?? 0,
    isActive:
      category.isActive !== undefined
        ? category.isActive
          ? 1
          : 0
        : category.is_active !== undefined
          ? category.is_active
            ? 1
            : 0
          : 1,
  };
}

export function mapCloudSubcategoryRow(category, childParentMap) {
  const id = category.id;
  const categoryId = category.parentId ?? category.parent_id ?? childParentMap.get(id);
  if (!categoryId) return null;

  return {
    id,
    categoryId,
    name: category.name,
    sortOrder: category.sortOrder ?? category.sort_order ?? 0,
    isActive:
      category.isActive !== undefined
        ? category.isActive
          ? 1
          : 0
        : category.is_active !== undefined
          ? category.is_active
            ? 1
            : 0
          : 1,
  };
}

export function buildInventoryMap(branchInventory = []) {
  const map = new Map();
  for (const row of branchInventory) {
    const productId = row.productId ?? row.product_id;
    if (!productId) continue;
    const quantity = Number(row.quantity ?? row.qty ?? 0);
    map.set(productId, Number.isFinite(quantity) ? quantity : 0);
  }
  return map;
}

export function mapCloudTaxRow(tax = {}) {
  if (!tax.id || !tax.name) return null;
  const rate = Number(tax.rate ?? tax.ratePercent ?? tax.rate_percent ?? 0);
  return {
    id: tax.id,
    name: tax.name,
    rate: Number.isFinite(rate) ? rate : 0,
    isActive:
      tax.isActive !== undefined
        ? tax.isActive
          ? 1
          : 0
        : tax.is_active !== undefined
          ? tax.is_active
            ? 1
            : 0
          : 1,
  };
}

export function resolveProductCategoryIds(product, childParentMap) {
  const rawCategoryId = product.categoryId ?? product.category_id ?? null;
  if (!rawCategoryId) {
    return { categoryId: null, subcategoryId: null };
  }

  const parentId = childParentMap.get(rawCategoryId);
  if (parentId) {
    return { categoryId: parentId, subcategoryId: rawCategoryId };
  }

  return {
    categoryId: rawCategoryId,
    subcategoryId: product.subcategoryId ?? product.subcategory_id ?? null,
  };
}

function resolveProductType(product = {}) {
  const raw = String(
    product.type ?? product.productType ?? product.product_type ?? 'single'
  ).toLowerCase();
  if (raw === 'bundle' || raw === 'variant') return raw;
  return 'single';
}

function stringifyJsonArray(value) {
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? JSON.stringify(parsed) : '[]';
    } catch {
      return '[]';
    }
  }
  return '[]';
}

/** Upsert products including parent/child fields — do not invent sellable stock on parent. */
export function mapCloudProductRow(
  product,
  {
    childParentMap,
    inventoryMap,
    fallbackCategoryId = null,
    categoryByProductId = null,
    offersMap = null,
  } = {}
) {
  if (!product.id || !product.name) return null;

  let { categoryId, subcategoryId } = resolveProductCategoryIds(product, childParentMap);

  // Variant children often omit categoryId — inherit from parent row in same snapshot
  const parentId = product.parentId ?? product.parent_id ?? null;
  if (!categoryId && parentId && categoryByProductId?.has(parentId)) {
    const inherited = categoryByProductId.get(parentId);
    categoryId = inherited.categoryId;
    subcategoryId = subcategoryId ?? inherited.subcategoryId;
  }

  // Last resort: keep catalog import alive when cloud omits category on variant parents
  if (!categoryId && fallbackCategoryId) {
    categoryId = fallbackCategoryId;
  }
  if (!categoryId) return null;

  const stockFromInventory = inventoryMap.get(product.id);
  const stock =
    stockFromInventory !== undefined
      ? stockFromInventory
      : Number(product.stock ?? product.quantity ?? 0);

  const productType = resolveProductType(product);
  const offerId = product.offerId ?? product.offer_id ?? null;
  // When offersMap is provided, only link if the offer exists in the snapshot.
  const resolvedOfferId =
    offerId && (offersMap == null || offersMap.has(offerId)) ? offerId : null;

  return {
    id: product.id,
    sku: product.itemCode ?? product.item_code ?? product.sku ?? product.id,
    barcode: product.barcode ?? null,
    name: product.name,
    categoryId,
    subcategoryId,
    price: Number(product.sellingPrice ?? product.selling_price ?? product.price ?? 0),
    discount: resolveProductDiscountPercent(product, offersMap),
    offerId: resolvedOfferId,
    stock: Number.isFinite(stock) ? stock : 0,
    isPopular:
      product.isPopular !== undefined
        ? product.isPopular
          ? 1
          : 0
        : product.is_popular !== undefined
          ? product.is_popular
            ? 1
            : 0
          : 0,
    imageUrl: product.imageUrl ?? product.image_url ?? null,
    isActive: resolveEntityIsActive(product),
    taxIds: collectProductTaxIds(product),
    productType,
    parentId,
    variantLabel: product.variantLabel ?? product.variant_label ?? null,
    variantOptions: stringifyJsonArray(
      product.variantOptions ?? product.variant_options ?? []
    ),
    bundleItems: stringifyJsonArray(product.bundleItems ?? product.bundle_items ?? []),
  };
}

function resolveEntityIsActive(entity) {
  if (entity.isActive !== undefined) return entity.isActive ? 1 : 0;
  if (entity.is_active !== undefined) return entity.is_active ? 1 : 0;
  if (entity.status !== undefined) return entity.status === 'active' ? 1 : 0;
  return 1;
}

function collectProductTaxIds(product) {
  const ids = new Set();
  const direct = product.taxIds ?? product.tax_ids ?? [];
  for (const taxId of direct) {
    if (taxId) ids.add(taxId);
  }
  const nested = product.taxes ?? [];
  for (const tax of nested) {
    const taxId = tax?.id ?? tax?.taxId ?? tax?.tax_id;
    if (taxId) ids.add(taxId);
  }
  return [...ids];
}

export function mapProductTaxLinks(productTaxes = [], products = []) {
  const links = [];

  for (const row of productTaxes) {
    const productId = row.productId ?? row.product_id;
    const taxRuleId = row.taxId ?? row.tax_id ?? row.taxRuleId ?? row.tax_rule_id;
    if (productId && taxRuleId) {
      links.push({ productId, taxRuleId });
    }
  }

  for (const product of products) {
    const productId = product.id;
    if (!productId) continue;
    for (const taxId of collectProductTaxIds(product)) {
      links.push({ productId, taxRuleId: taxId });
    }
  }

  const seen = new Set();
  return links.filter((link) => {
    const key = `${link.productId}:${link.taxRuleId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function mapCloudCounterRow(counter = {}) {
  if (!counter.id) return null;
  return {
    id: counter.id,
    code: counter.code ?? counter.id,
    name: counter.name ?? counter.code ?? 'Counter',
    isActive:
      counter.isActive !== undefined
        ? counter.isActive
          ? 1
          : 0
        : counter.is_active !== undefined
          ? counter.is_active
            ? 1
            : 0
          : 1,
  };
}

/** Cloud BM discounts → local offers (id, name, percent). */
export function mapCloudOfferRow(offer = {}) {
  if (!offer.id || !offer.name) return null;
  const percent = Number(offer.percent ?? offer.discountPercent ?? offer.discount_percent ?? 0);
  return {
    id: offer.id,
    name: String(offer.name).trim(),
    percent: Number.isFinite(percent) ? percent : 0,
    categoryId: offer.categoryId ?? offer.category_id ?? null,
    isActive:
      offer.isActive !== undefined
        ? offer.isActive
          ? 1
          : 0
        : offer.is_active !== undefined
          ? offer.is_active
            ? 1
            : 0
          : 1,
  };
}

export function buildOffersMap(offers = []) {
  const map = new Map();
  for (const offer of offers) {
    const row = mapCloudOfferRow(offer);
    if (!row) continue;
    map.set(row.id, row);
  }
  return map;
}

/**
 * Inventory: shelf discount = COALESCE(product.discount_percent, offer.percent, 0).
 * Prefer explicit product discount when present; else fall back to linked offer %.
 */
export function resolveProductDiscountPercent(product = {}, offersMap = null) {
  const raw =
    product.discountPercent ?? product.discount_percent ?? product.discount;
  if (raw !== undefined && raw !== null && raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  const offerId = product.offerId ?? product.offer_id ?? null;
  if (offerId && offersMap?.has(offerId)) {
    return Number(offersMap.get(offerId).percent) || 0;
  }
  return 0;
}

/** Format cloud slipPolicies[] into printable receipt footer text. */
export function formatSlipPolicies(policies) {
  if (!Array.isArray(policies)) return null;
  const lines = policies
    .filter((p) => p && (p.printOnSlip === true || p.print_on_slip === true))
    .map((p) => {
      const name = String(p.name || '').trim();
      const detail = String(p.detail || p.body || '').trim();
      if (name && detail) return `${name}: ${detail}`;
      return name || detail;
    })
    .filter(Boolean);
  return lines.join('\n');
}

/**
 * First present own-key on `obj` (null/undefined → '').
 * Returns `undefined` when none of the keys exist (caller should not overwrite).
 */
export function pickPresentText(obj, keys) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    const value = obj[key];
    if (value == null) return '';
    return String(value);
  }
  return undefined;
}

/**
 * Map cloud company (+ optional branch) → local store_profile.
 * UI "Branch" field is stored in contactEmail (see mapAdmin.js).
 *
 * Footer text (warning / return+policies): when company is in the payload and
 * those keys are present (even as null), map null → '' so sync can clear
 * stale printable policies after Admin turns them off.
 */
export function mapCompanyToStoreProfile(company = {}, branch = null) {
  const hasCompany = company && typeof company === 'object';
  const hasBranch = branch && typeof branch === 'object';
  if (!hasCompany && !hasBranch) return null;

  const companyName = hasCompany ? (company.name ?? null) : null;
  const branchName = hasBranch
    ? (branch.name ?? branch.branchName ?? branch.branch_name ?? null)
    : null;

  const companyPhone = hasCompany
    ? (company.phone ?? company.contactPhone ?? company.contact_phone ?? null)
    : null;
  const branchPhone = hasBranch
    ? (branch.phone ?? branch.contactPhone ?? branch.contact_phone ?? null)
    : null;

  const companyAddress = hasCompany ? (company.address ?? null) : null;
  const branchAddress = hasBranch ? (branch.address ?? null) : null;

  const companyEmail = hasCompany
    ? (company.email ?? company.contactEmail ?? company.contact_email ?? null)
    : null;

  // Prefer slipPolicies (printOnSlip only); fallback returnInstructions / returnPolicy.
  let warningMessage;
  let returnInstructions;
  if (hasCompany) {
    warningMessage = pickPresentText(company, [
      'warningMessage',
      'warning_message',
      'warning',
    ]);
    const fromPolicies = formatSlipPolicies(
      company.slipPolicies ?? company.slip_policies ?? company.policies
    );
    if (fromPolicies !== null) {
      returnInstructions = fromPolicies;
    } else {
      returnInstructions = pickPresentText(company, [
        'returnPolicy',
        'return_policy',
        'returnInstructions',
        'return_instructions',
      ]);
    }
    if (warningMessage === undefined) warningMessage = '';
    if (returnInstructions === undefined) returnInstructions = '';
  }

  return {
    name: companyName || branchName || null,
    // POS Invoice Details "Branch" ↔ contactEmail
    contactEmail: branchName || companyEmail || null,
    contactPhone: companyPhone || branchPhone || null,
    address: companyAddress || branchAddress || null,
    // undefined = branch-only delta → keep local footer (see applyStoreProfile)
    warningMessage,
    returnInstructions,
    shopOpenTime: hasCompany
      ? (company.openTime ?? company.open_time ?? company.shopOpenTime ?? null)
      : null,
    shopCloseTime: hasCompany
      ? (company.closeTime ?? company.close_time ?? company.shopCloseTime ?? null)
      : null,
    currency: hasCompany ? (company.currency ?? null) : null,
    applyFooterText: hasCompany,
  };
}

export function eventClientIds(items = []) {
  return items
    .map((item) => {
      if (typeof item === 'string') return item;
      return item.clientEventId ?? item.client_event_id ?? null;
    })
    .filter(Boolean);
}

function readClientEventId(item) {
  if (item == null) return null;
  if (typeof item === 'string') return item;
  return item.clientEventId ?? item.client_event_id ?? null;
}

/**
 * Normalize POST /sync/push response (HTTP 202 may still have failures).
 * Always inspect hasFailures / rejected[] / skipped[] — do not treat 202 as full OK.
 */
export function normalizePushResult(data = {}) {
  const accepted = Array.isArray(data.accepted)
    ? data.accepted
    : Array.isArray(data.results?.accepted)
      ? data.results.accepted
      : [];
  const rejected = Array.isArray(data.rejected)
    ? data.rejected
    : Array.isArray(data.results?.rejected)
      ? data.results.rejected
      : [];
  const skipped = Array.isArray(data.skipped)
    ? data.skipped
    : Array.isArray(data.results?.skipped)
      ? data.results.skipped
      : [];

  const acceptedCount =
    Number(data.acceptedCount) || eventClientIds(accepted).length;
  const rejectedCount =
    Number(data.rejectedCount) ||
    rejected.filter((row) => readClientEventId(row)).length;
  const skippedCount =
    Number(data.skippedCount) ||
    skipped.filter((row) => readClientEventId(row)).length;

  const hasFailures =
    data.hasFailures === true ||
    rejectedCount > 0 ||
    (Array.isArray(rejected) && rejected.length > 0);

  return {
    hasFailures,
    accepted,
    rejected,
    skipped,
    acceptedCount,
    rejectedCount,
    skippedCount,
    message: data.message ?? null,
    events: data.events ?? [],
    raw: data,
  };
}

/** Normalize a rejected[] entry into a structured rejection for outbox. */
export function normalizeRejectedEvent(item, { httpStatus = 202 } = {}) {
  if (item == null) return null;
  if (typeof item === 'string') {
    return {
      clientEventId: item,
      eventType: null,
      code: 'UNKNOWN',
      reason: 'Rejected by cloud',
      retryable: false,
      hint: null,
      fieldPaths: null,
      details: null,
      context: null,
      httpStatus,
    };
  }

  return {
    clientEventId: readClientEventId(item),
    eventType: item.eventType ?? item.event_type ?? null,
    code: item.code ?? 'UNKNOWN',
    reason: item.reason || item.message || item.error || 'Rejected by cloud',
    retryable: item.retryable,
    hint: item.hint ?? null,
    fieldPaths: item.fieldPaths ?? item.field_paths ?? null,
    details: item.details ?? null,
    context: item.context ?? null,
    httpStatus: item.httpStatus ?? item.http_status ?? httpStatus,
  };
}

/** Normalize skipped[] — NOT failures; mark synced/skipped locally. */
export function normalizeSkippedEvent(item) {
  if (item == null) return null;
  if (typeof item === 'string') {
    return { clientEventId: item, reason: 'skipped' };
  }
  return {
    clientEventId: readClientEventId(item),
    reason:
      item.reason ??
      item.code ??
      item.skipReason ??
      item.skip_reason ??
      'skipped',
  };
}

export function collectAcceptedEventIds(pushResult = {}) {
  const normalized =
    pushResult.accepted != null && pushResult.raw != null
      ? pushResult
      : normalizePushResult(pushResult.raw ?? pushResult);

  const ids = new Set(eventClientIds(normalized.accepted));
  for (const row of normalized.raw?.events ?? normalized.events ?? []) {
    const clientEventId = row?.clientEventId ?? row?.client_event_id;
    if (!clientEventId || row.error != null) continue;
    // Idempotent replay without error still counts as accepted.
    if (row.skipped || row.status === 'skipped') continue;
    ids.add(clientEventId);
  }
  return [...ids];
}

export function collectSkippedEventIds(pushResult = {}) {
  const normalized =
    pushResult.skipped != null && pushResult.raw != null
      ? pushResult
      : normalizePushResult(pushResult.raw ?? pushResult);

  const map = new Map();
  for (const item of normalized.skipped) {
    const row = normalizeSkippedEvent(item);
    if (!row?.clientEventId) continue;
    map.set(row.clientEventId, row.reason);
  }
  // events[] may also flag skips
  for (const row of normalized.raw?.events ?? normalized.events ?? []) {
    const clientEventId = row?.clientEventId ?? row?.client_event_id;
    if (!clientEventId) continue;
    if (row.skipped || row.status === 'skipped') {
      map.set(
        clientEventId,
        row.reason ?? row.skipReason ?? row.skip_reason ?? 'skipped'
      );
    }
  }
  return map;
}

/** Map clientEventId → cloud saleId from push response events[]. */
export function collectPushSaleIds(pushResult = {}) {
  const saleIds = new Map();
  const events =
    pushResult.raw?.events ?? pushResult.events ?? pushResult.raw?.events ?? [];
  for (const row of events) {
    const clientEventId = row?.clientEventId ?? row?.client_event_id;
    const saleId = row?.saleId ?? row?.sale_id ?? null;
    if (!clientEventId || !saleId || row.error != null) continue;
    saleIds.set(clientEventId, saleId);
  }
  return saleIds;
}
