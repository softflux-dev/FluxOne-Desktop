import { v4 as uuid } from 'uuid';
import { success, error } from '../shared/utils/response.js';
import { money } from '../shared/utils/money.util.js';
import { publicTab, requireDrawer } from '../shared/utils/sale.util.js';
import { lineFingerprint } from '../shared/utils/fingerprint.js';
import { snapshotLine } from '../shared/utils/exchange.util.js';
import * as invoiceModel from '../models/invoice.model.js';
import * as exchangeModel from '../models/exchange.model.js';
import * as saleModel from '../models/sale.model.js';

// Start exchange from an invoice — loads a tab in mode=exchange
export function start(req, res) {
  try {
    const drawer = requireDrawer(
      req.auth.employeeId,
      'Open cash drawer before starting an exchange'
    );
    const invoiceId = req.params.id;
    const invoice = invoiceModel.findById(invoiceId);
    if (!invoice) return error(res, 'Invoice not found', 404);

    const allItems = invoiceModel.listItems(invoiceId);
    const remaining = allItems.filter((i) => !i.isReturned);
    if (!remaining.length) {
      return error(res, 'Cannot exchange a fully returned invoice', 400);
    }

    const wanted = [...new Set(req.body.itemIds)];
    if (!wanted.length) {
      return error(res, 'Select at least one item to exchange', 400);
    }
    const byId = new Map(allItems.map((i) => [i.id, i]));
    const selected = [];
    for (const id of wanted) {
      const line = byId.get(id);
      if (!line) return error(res, `Invoice line not found: ${id}`, 400);
      if (line.isReturned) return error(res, `Line already returned: ${id}`, 400);
      selected.push(line);
    }

    const exchangedCredit = money(selected.reduce((s, line) => s + Number(line.lineTotal), 0));
    const exchangedFingerprint = lineFingerprint(selected);
    const exchangedItemIds = JSON.stringify(selected.map((i) => i.id));
    const given = selected.map(snapshotLine);

    const result = saleModel.runTx(() => {
      let tab = saleModel.findOpenExchangeTab(req.auth.employeeId, drawer.id, invoiceId);
      if (tab) {
        // Update given set only — keep replacement cart lines intact
        saleModel.updateExchangeTab({
          id: tab.id,
          employeeId: req.auth.employeeId,
          exchangedCredit,
          exchangedFingerprint,
          exchangedItemIds,
        });
        tab = saleModel.findOpenTab(tab.id, req.auth.employeeId);
      } else {
        tab = saleModel.createExchangeTab({
          id: uuid(),
          cashDrawerId: drawer.id,
          employeeId: req.auth.employeeId,
          authSessionId: req.auth.sessionId,
          exchangeInvoiceId: invoiceId,
          exchangedCredit,
          exchangedFingerprint,
          exchangedItemIds,
        });
      }

      const cartItems = saleModel.listItems(tab.id);
      return {
        tab: publicTab(tab, cartItems, { given }),
        invoiceId,
        exchangedCredit,
        exchangedFingerprint,
        given,
      };
    });

    return success(res, result, 201);
  } catch (err) {
    return error(res, err.message || 'Failed to start exchange', err.statusCode || 500, err.code || null);
  }
}

// Previous exchange items popup
export function listByInvoice(req, res) {
  try {
    const invoice = invoiceModel.findById(req.params.id);
    if (!invoice) return error(res, 'Invoice not found', 404);
    const events = exchangeModel.listByInvoice(req.params.id);
    return success(res, { invoiceId: invoice.id, events });
  } catch (err) {
    return error(res, err.message || 'Failed to list exchanges', err.statusCode || 500, err.code || null);
  }
}

// Checkout lives in modules/pos/checkoutExchange.js — sale.controller delegates there
