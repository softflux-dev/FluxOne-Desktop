/**
 * Returns ? open-exchange guard + stock helpers for return flow.
 * (Header / history / cash movements use invoice.model + sale.model.)
 */
import { connectDb } from '../config/database.js';

export function findOpenExchangeTab(invoiceId) {
  const db = connectDb();
  return (
    db
      .prepare(
        `
      SELECT id FROM sale_tabs
      WHERE exchange_invoice_id = ? AND status = 'open'
      LIMIT 1
    `
      )
      .get(invoiceId) || null
  );
}

export function getStock(productId) {
  const db = connectDb();
  return (
    db.prepare(`SELECT id, stock FROM products WHERE id = ?`).get(productId) || null
  );
}
