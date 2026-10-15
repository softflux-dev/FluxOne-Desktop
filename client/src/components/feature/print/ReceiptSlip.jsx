import { format } from 'date-fns'
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { STORE_PROFILE } from '@/data/products'
import { formatMoney } from '@/lib/formatCurrency'
import {
  isPolicyTitleList,
  normalizeStoreForSlip,
  policiesForSlip,
  truncateWords,
} from '@/lib/mapInvoice'

const TYPE_KEYS = {
  Sale: 'invoices.typeSale',
  Return: 'invoices.typeReturn',
  Exchange: 'invoices.typeExchange',
}

const PAYMENT_KEYS = {
  Paid: 'invoices.paymentPaid',
  Refund: 'invoices.paymentRefund',
  Return: 'invoices.paymentReturn',
  Adjust: 'invoices.paymentAdjust',
}

function translateMethod(method, t) {
  if (!method) return ''
  const lower = String(method).toLowerCase()
  if (lower === 'cash') return t('receipt.paymentCashMethod')
  return method
}

function lineAmount(item) {
  if (item.lineTotal != null && Number.isFinite(Number(item.lineTotal))) {
    return Number(item.lineTotal)
  }
  return Number(item.unitPrice || 0) * Number(item.qty || 0)
}

// Simple thermal-style bars — invoice id se pattern, koi barcode lib nahi
function SlipBarcode({ value }) {
  const seed = String(value || 'FLUXONE')
  const bars = []
  for (let i = 0; i < seed.length * 4; i += 1) {
    const code = seed.charCodeAt(i % seed.length) + i
    bars.push({
      key: i,
      wide: code % 3 === 0,
      gap: code % 5 === 0,
    })
  }
  return (
    <div
      className="mx-auto flex h-10 max-w-[220px] items-end justify-center overflow-hidden"
      aria-hidden
      style={{ gap: 1 }}
    >
      {bars.map((bar) => (
        <span
          key={bar.key}
          className="shrink-0 bg-black"
          style={{
            width: bar.wide ? 2.5 : 1.25,
            height: bar.gap ? '70%' : '100%',
          }}
        />
      ))}
    </div>
  )
}

// Table rows html2canvas mein flex justify-between se behtar render hoti hain
function SlipRow({ label, value, bold = false }) {
  return (
    <tr>
      <td
        className={`py-0.5 pe-2 align-baseline text-start ${bold ? 'font-bold' : ''}`}
        style={{ width: '52%' }}
      >
        {label}
      </td>
      <td
        className={`py-0.5 align-baseline text-end tabular-nums ${bold ? 'font-bold' : ''}`}
        style={{ width: '48%' }}
      >
        {value}
      </td>
    </tr>
  )
}

/** Printable receipt body — shared by modal + window.print + PDF capture */
export default function ReceiptSlip({ invoice, store }) {
  const { t } = useTranslation()
  if (!invoice) return null

  const slipStore =
    normalizeStoreForSlip(store || invoice.store) || STORE_PROFILE

  const typeLabel = t(TYPE_KEYS[invoice.type] || TYPE_KEYS.Sale)
  const statusRaw = invoice.paymentStatus || invoice.status
  const statusLabel = PAYMENT_KEYS[statusRaw]
    ? t(PAYMENT_KEYS[statusRaw])
    : statusRaw

  const policies = policiesForSlip(slipStore.returnInstructions)
  const hideWarningAsTitles = isPolicyTitleList(slipStore.warning, policies)
  const warning = hideWarningAsTitles
    ? null
    : slipStore.warning
      ? truncateWords(slipStore.warning)
      : null
  // Agar structured policies na hon to plain return text (truncate) dikhao
  const fallbackPolicy =
    !policies.length && slipStore.returnInstructions
      ? truncateWords(slipStore.returnInstructions)
      : null

  const createdAt =
    invoice.createdAt instanceof Date
      ? invoice.createdAt
      : new Date(invoice.createdAt)
  const cashierName = invoice.cashier || t('receipt.cashierFallback')
  const phoneLine = slipStore.phone
    ? t('receipt.telLine', { phone: slipStore.phone })
    : ''

  const activeItems = (invoice.items || []).filter((i) => !i.returned)

  return (
    <div
      id="print-area"
      className="receipt-slip bg-white px-2 py-2 font-sans text-[12px] leading-snug text-black"
      style={{
        // Fixed width — PDF capture wide dialog pe stretch na ho
        width: 300,
        maxWidth: 300,
        margin: '0 auto',
        boxSizing: 'border-box',
        letterSpacing: 'normal',
        wordSpacing: 'normal',
      }}
    >
      {/* Header — store identity */}
      <div className="text-center">
        <h2 className="text-base font-bold text-black">{slipStore.name}</h2>
        {slipStore.address ? (
          <p className="mt-0.5 text-[11px] text-neutral-500">{slipStore.address}</p>
        ) : null}
        {phoneLine ? (
          <p className="text-[11px] text-neutral-500">{phoneLine}</p>
        ) : null}
      </div>

      <p className="mt-3 text-center text-sm font-bold text-black">
        {t('receipt.cashReceiptTitle')}
      </p>
      <p className="text-center text-neutral-600">******</p>

      {/* Meta */}
      <table
        className="mt-3 w-full border-collapse text-[12px]"
        style={{ tableLayout: 'fixed' }}
      >
        <tbody>
          <SlipRow label={t('receipt.metaTransaction')} value={invoice.id} />
          <SlipRow
            label={t('receipt.metaDate')}
            value={format(createdAt, 'd MMM yyyy, h:mm a')}
          />
          <SlipRow
            label={t('receipt.metaTime')}
            value={format(createdAt, 'HH:mm')}
          />
          <SlipRow label={t('receipt.metaCashier')} value={cashierName} />
        </tbody>
      </table>

      {/* Items — fixed column widths for PDF Qty align */}
      <table
        className="mt-3 w-full border-collapse text-[12px]"
        style={{ tableLayout: 'fixed' }}
      >
        <colgroup>
          <col style={{ width: '48%' }} />
          <col style={{ width: '18%' }} />
          <col style={{ width: '34%' }} />
        </colgroup>
        <thead>
          <tr className="border-y border-dashed border-neutral-400">
            <th className="py-1.5 text-start font-bold">{t('receipt.colItem')}</th>
            <th className="py-1.5 text-center font-bold">{t('receipt.colQty')}</th>
            <th className="py-1.5 text-end font-bold">{t('receipt.colAmount')}</th>
          </tr>
        </thead>
        <tbody>
          {activeItems.map((item) => (
            <tr key={item.lineId || item.sku || item.name}>
              <td className="py-1 pe-1 text-start break-words">{item.name}</td>
              <td className="py-1 text-center tabular-nums">{item.qty}</td>
              <td className="py-1 text-end tabular-nums">
                {formatMoney(lineAmount(item))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-dashed border-neutral-400" />

      {/* Money breakdown */}
      <table
        className="mt-2 w-full border-collapse text-[12px]"
        style={{ tableLayout: 'fixed' }}
      >
        <tbody>
          <SlipRow
            label={t('receipt.labelActual')}
            value={formatMoney(invoice.actual ?? invoice.subtotal)}
          />
          <SlipRow
            label={t('receipt.labelDiscount')}
            value={formatMoney(invoice.discount || 0)}
          />
          <SlipRow
            label={t('receipt.labelSubTotal')}
            value={formatMoney(invoice.subtotal)}
          />
          <SlipRow
            label={t('receipt.labelTax1')}
            value={formatMoney(invoice.tax1 || 0)}
          />
          <SlipRow
            label={t('receipt.labelTax2')}
            value={formatMoney(invoice.tax2 || 0)}
          />
        </tbody>
      </table>

      <table
        className="mt-2 w-full border-collapse text-[13px] font-bold"
        style={{ tableLayout: 'fixed', background: '#e5e5e5' }}
      >
        <tbody>
          <tr>
            <td className="px-2 py-1.5 text-start">{t('receipt.labelTotal')}</td>
            <td className="px-2 py-1.5 text-end tabular-nums">
              {formatMoney(invoice.total)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Payment */}
      <div className="mt-3">
        <p className="mb-1 font-bold">{t('receipt.payment')}</p>
        <table
          className="w-full border-collapse text-[12px]"
          style={{ tableLayout: 'fixed' }}
        >
          <tbody>
            {(invoice.payments || []).map((p, idx) => (
              <SlipRow
                key={`${p.method}-${idx}`}
                label={translateMethod(p.method, t)}
                value={formatMoney(p.amount)}
              />
            ))}
            {invoice.change ? (
              <SlipRow
                label={t('receipt.changeLabel')}
                value={formatMoney(invoice.change)}
              />
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="my-2 border-t border-dashed border-neutral-400" />

      {/* Payment Status */}
      <table
        className="w-full border-collapse text-[12px]"
        style={{ tableLayout: 'fixed' }}
      >
        <tbody>
          <tr>
            <td className="py-0.5 text-start font-medium align-middle">
              {t('receipt.paymentStatus')}
            </td>
            <td className="py-0.5 text-end align-middle">
              <span
                className="inline-flex items-center rounded-full bg-neutral-200 px-2.5 py-0.5 text-[11px] font-semibold text-black"
                style={{ gap: 4 }}
              >
                <span className="inline-flex size-3.5 items-center justify-center rounded-full bg-neutral-500 text-white">
                  <Check className="size-2.5" strokeWidth={3} aria-hidden />
                </span>
                {statusLabel}
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Policies — Payment Status ke baad, Thank You se pehle */}
      {warning || policies.length > 0 || fallbackPolicy ? (
        <section className="mt-3 space-y-1.5 border-t border-dashed border-neutral-400 pt-2 text-start">
          <p className="text-[11px] font-bold uppercase text-black">
            {t('receipt.companyPolicies')}
          </p>
          {warning ? (
            <p
              className="text-[11px] leading-relaxed text-neutral-700"
              style={{ letterSpacing: 'normal', wordSpacing: 'normal' }}
            >
              {warning}
            </p>
          ) : null}
          {policies.length > 0
            ? policies.map((policy, index) => (
                <div key={policy.name || index} className="space-y-0.5">
                  {policy.name ? (
                    <p
                      className="text-[11px] font-semibold text-black"
                      style={{ letterSpacing: 'normal', wordSpacing: 'normal' }}
                    >
                      {policy.name}
                    </p>
                  ) : null}
                  {policy.description ? (
                    <p
                      className="text-[11px] leading-relaxed text-neutral-700"
                      style={{ letterSpacing: 'normal', wordSpacing: 'normal' }}
                    >
                      {policy.description}
                    </p>
                  ) : null}
                </div>
              ))
            : null}
          {fallbackPolicy ? (
            <p
              className="text-[11px] leading-relaxed text-neutral-700"
              style={{ letterSpacing: 'normal', wordSpacing: 'normal' }}
            >
              {fallbackPolicy}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Thank you + barcode */}
      <div className="mt-4 text-center">
        <p className="text-sm font-bold uppercase">{t('receipt.thankYou')}</p>
        <p className="mt-0.5 text-[11px] text-neutral-600">
          {t('receipt.thankYouSub')}
        </p>
        <div className="mt-3">
          <SlipBarcode value={invoice.id} />
        </div>
        <p className="mt-1.5 text-[11px] text-neutral-700">
          {t('receipt.receiptNo', { id: invoice.id })}
        </p>
        {typeLabel ? (
          <p className="mt-1 text-[10px] text-neutral-400">
            {t('receipt.typeLine', { type: typeLabel })}
          </p>
        ) : null}
      </div>
    </div>
  )
}
