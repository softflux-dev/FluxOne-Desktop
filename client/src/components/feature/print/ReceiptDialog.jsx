import { useTranslation } from 'react-i18next'
import { usePos } from '@/context/PosContext'
import ReceiptSlip from '@/components/feature/print/ReceiptSlip'
import { usePrintSlip } from '@/components/feature/print/usePrintSlip'
import { PRINT_AREA_ID } from '@/components/feature/print/printArea'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export default function ReceiptDialog() {
  const { t } = useTranslation()
  const { receiptInvoice, closeReceipt } = usePos()
  const { savePdf, savePng } = usePrintSlip()
  const open = Boolean(receiptInvoice)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeReceipt()
      }}
    >
      <DialogContent
        className="flex max-h-[min(90dvh,720px)] flex-col gap-3 overflow-hidden border-border bg-card text-card-foreground sm:max-w-md"
        showCloseButton
      >
        <DialogHeader className="shrink-0 pe-8">
          <DialogTitle className="text-foreground">
            {t('receipt.dialogTitle', { id: receiptInvoice?.id || '' })}
          </DialogTitle>
        </DialogHeader>

        <div className="receipt-scroll min-h-0 flex-1 overscroll-contain">
          <ReceiptSlip
            invoice={receiptInvoice}
            store={receiptInvoice?.store}
          />
        </div>

        <DialogFooter className="shrink-0 gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {/* PRINT -> PDF */}
            <Button
              type="button"
              variant="outline"
              onClick={() => savePdf(receiptInvoice, PRINT_AREA_ID.receipt)}
            >
              Print (PDF)
            </Button>

            {/* DOWNLOAD -> PNG */}
            <Button
              type="button"
              variant="outline"
              onClick={() => savePng(receiptInvoice, PRINT_AREA_ID.receipt)}
            >
              Download (PNG)
            </Button>
          </div>

          <Button type="button" onClick={closeReceipt}>
            {t('receipt.newSale')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}