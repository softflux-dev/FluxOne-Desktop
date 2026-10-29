// Round to 2 decimal places (matches server money() when needed).
export function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

// Whole PKR for till cash — no paisa (avoids 0.01 change leftovers).
export function roundMoneyInt(n) {
  return Math.round(Number(n) || 0)
}

/**
 * Amount the customer must pay in whole rupees.
 * Ceil after 2dp round so we never under-collect vs the bill.
 */
export function ceilMoneyInt(n) {
  const precise = roundMoney(n)
  if (precise <= 0) return 0
  return Math.ceil(precise - 1e-9)
}

// Format PKR as whole rupees (Rs. 15) — cashier cash has no decimal coins in UX.
export function formatMoney(n) {
  const value = roundMoneyInt(n)
  return `Rs. ${value.toLocaleString('en-PK')}`
}

/** Exact-amount / tender field value — integer string, never "126.5". */
export function formatMoneyInput(n) {
  return String(roundMoneyInt(n))
}

// Parse money typed with grouping commas (e.g. "5,000" → 5000).
// Returns NaN when empty or invalid.
export function parseMoneyInput(raw) {
  if (raw == null) return NaN
  const cleaned = String(raw).replace(/,/g, '').trim()
  if (cleaned === '') return NaN
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : NaN
}
