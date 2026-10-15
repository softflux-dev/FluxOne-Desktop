import { useTranslation } from 'react-i18next'
import {
  policiesForSlip,
  truncateWords,
} from '@/lib/mapInvoice'

export default function SlipPreview({ profile }) {
  const { t } = useTranslation()
  const name = profile?.name?.trim() || ''
  const address = profile?.address?.trim() || ''
  const phone = profile?.phone?.trim() || ''
  const warning = profile?.warning?.trim() || ''
  const returnInstructions = profile?.returnInstructions?.trim() || ''

  // Slip jaisa truncate — admin ko pata chale print pe kitna dikhega
  const policies = policiesForSlip(returnInstructions)
  const warningPreview = warning ? truncateWords(warning) : ''
  const fallbackPolicy =
    !policies.length && returnInstructions
      ? truncateWords(returnInstructions)
      : ''

  const hasAny =
    name || address || phone || warningPreview || policies.length || fallbackPolicy

  return (
    <div className="mt-2 rounded-xl border border-border bg-muted/40 p-5">
      <p className="mb-3 text-xs font-medium text-muted-foreground">
        {t('invoiceDetailsAdmin.slipPreview')}
      </p>
      {!hasAny ? (
        <p className="text-sm text-muted-foreground">
          {t('invoiceDetailsAdmin.slipPreviewEmpty')}
        </p>
      ) : (
        <div className="mx-auto max-w-[280px] space-y-2 bg-white p-3 text-center text-sm text-foreground shadow-sm">
          {name ? (
            <p className="text-base font-bold">{name}</p>
          ) : null}
          {address ? (
            <p className="text-xs text-muted-foreground">{address}</p>
          ) : null}
          {phone ? (
            <p className="text-xs text-muted-foreground">
              {t('receipt.telLine', { phone })}
            </p>
          ) : null}

          <p className="pt-1 text-sm font-bold">{t('receipt.cashReceiptTitle')}</p>
          <p className="tracking-[0.3em] text-muted-foreground">******</p>

          <div className="border-y border-dashed border-border py-2 text-start text-xs">
            <div className="flex justify-between">
              <span>{t('receipt.paymentStatus')}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 font-semibold">
                {t('invoices.paymentPaid')}
              </span>
            </div>
          </div>

          {/* Policies — status ke baad (slip pe bhi yahi order) */}
          {warningPreview || policies.length > 0 || fallbackPolicy ? (
            <div className="space-y-1 border-t border-dashed border-border pt-2 text-start">
              <p className="text-[11px] font-bold uppercase">
                {t('receipt.companyPolicies')}
              </p>
              {warningPreview ? (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {warningPreview}
                </p>
              ) : null}
              {policies.map((policy, index) => (
                <div key={policy.name || index} className="space-y-0.5">
                  {policy.name ? (
                    <p className="text-[11px] font-semibold">{policy.name}</p>
                  ) : null}
                  {policy.description ? (
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      {policy.description}
                    </p>
                  ) : null}
                </div>
              ))}
              {fallbackPolicy ? (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {fallbackPolicy}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="border-t border-dashed border-border pt-2">
            <p className="text-sm font-bold uppercase">{t('receipt.thankYou')}</p>
            <p className="text-[11px] text-muted-foreground">
              {t('receipt.thankYouSub')}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
