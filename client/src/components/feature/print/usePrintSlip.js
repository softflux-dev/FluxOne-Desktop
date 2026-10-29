import { toast } from 'sonner'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import i18n from '@/i18n'
import { desktopPrint, isDesktopApp } from '@/lib/desktop'
import { prepareCloneForHtml2Canvas } from '@/lib/safeCssColor'
import { resolvePrintRoot } from '@/components/feature/print/printArea'

const SLIP_WIDTH_MM = 80
const SLIP_PAD_MM = 4
// Capture ke liye fixed px width — dialog stretch / flex gaps PDF mein toot'te the
const SLIP_CAPTURE_WIDTH_PX = 300

/**
 * Print / download helpers for invoice slips.
 * Print = HTML + CSS (same look as modal).
 * Download = screenshot of a unique print root into a receipt-sized PDF.
 */
export function usePrintSlip() {
  const printSlip = async (invoiceId) => {
    if (isDesktopApp()) {
      const result = await desktopPrint()
      if (result.success) {
        toast.success(i18n.t('receipt.printDialogOpened'))
      } else if (result.error) {
        toast.error(result.error)
        window.print()
      } else {
        window.print()
        toast.success(i18n.t('receipt.printDialogOpened'))
      }
    } else {
      window.print()
      toast.success(i18n.t('receipt.printDialogOpened'))
    }
    if (invoiceId) {
      // Phase 3: optionally log print event to notifications API
    }
  }

  /**
   * @param {object} invoice
   * @param {string|HTMLElement|{current:HTMLElement|null}} printTarget unique root (id / ref / node)
   */
  const downloadSlip = async (invoice, printTarget) => {
    if (!invoice) return

    const slip = resolvePrintRoot(printTarget)
    if (!slip) {
      toast.error(i18n.t('receipt.receiptNotReady'))
      return
    }

    const restoreOverflow = unclipForCapture(slip)
    const loadingId = toast.loading(i18n.t('receipt.preparingPdf'))

    try {
      // Wait two frames so dialog layout / fonts settle before capture
      await new Promise((resolve) => requestAnimationFrame(() => resolve()))
      await new Promise((resolve) => requestAnimationFrame(() => resolve()))

      const canvas = await html2canvas(slip, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        scrollX: 0,
        scrollY: 0,
        width: SLIP_CAPTURE_WIDTH_PX,
        windowWidth: SLIP_CAPTURE_WIDTH_PX,
        onclone: (clonedDoc, cloned) => {
          prepareCloneForHtml2Canvas(slip, clonedDoc, cloned)
          // PDF-safe: width lock + spaces / letter-spacing restore
          hardenReceiptCloneForPdf(cloned)
        },
      })

      // Blank PDF = zero-size capture (wrong root, clipped, or unmounted)
      if (!canvas?.width || !canvas?.height) {
        throw new Error(i18n.t('receipt.couldNotDownload'))
      }

      const img = canvas.toDataURL('image/png')
      const contentWidth = SLIP_WIDTH_MM - SLIP_PAD_MM * 2
      const contentHeight = (canvas.height / canvas.width) * contentWidth
      const pageHeight = contentHeight + SLIP_PAD_MM * 2

      const doc = new jsPDF({
        unit: 'mm',
        format: [SLIP_WIDTH_MM, Math.max(120, pageHeight)],
        compress: true,
      })

      doc.addImage(img, 'PNG', SLIP_PAD_MM, SLIP_PAD_MM, contentWidth, contentHeight)

      const filename = `${invoice.id}.pdf`
      doc.save(filename)
      toast.success(i18n.t('receipt.downloaded', { filename }))
    } catch (err) {
      console.error('downloadSlip failed', err)
      toast.error(err?.message || i18n.t('receipt.couldNotDownload'))
    } finally {
      restoreOverflow()
      toast.dismiss(loadingId)
    }
  }

  return { printSlip, downloadSlip }
}

/** html2canvas clone pe stretch / smashed words rokne ke liye */
function hardenReceiptCloneForPdf(root) {
  if (!root) return

  root.style.setProperty('width', `${SLIP_CAPTURE_WIDTH_PX}px`, 'important')
  root.style.setProperty('max-width', `${SLIP_CAPTURE_WIDTH_PX}px`, 'important')
  root.style.setProperty('min-width', `${SLIP_CAPTURE_WIDTH_PX}px`, 'important')
  root.style.setProperty('margin', '0', 'important')
  root.style.setProperty('box-sizing', 'border-box', 'important')
  root.style.setProperty('letter-spacing', 'normal', 'important')
  root.style.setProperty('word-spacing', 'normal', 'important')
  root.style.setProperty('white-space', 'normal', 'important')

  root.querySelectorAll('*').forEach((node) => {
    node.style.setProperty('letter-spacing', 'normal', 'important')
    node.style.setProperty('word-spacing', 'normal', 'important')
    // Flex gap PDF mein toot'ta hai — table rows pe pehle se switch hai
    if (node.style.display === 'flex' || node.style.display === 'inline-flex') {
      node.style.setProperty('gap', '4px', 'important')
      node.style.setProperty('max-width', '100%', 'important')
    }
  })
}

/** Parents use overflow/max-height, which would crop the screenshot. */
function unclipForCapture(el) {
  const changed = []
  let node = el.parentElement

  while (node && node !== document.body) {
    changed.push({
      node,
      overflow: node.style.overflow,
      overflowY: node.style.overflowY,
      maxHeight: node.style.maxHeight,
    })
    node.style.overflow = 'visible'
    node.style.overflowY = 'visible'
    node.style.maxHeight = 'none'
    node = node.parentElement
  }

  return () => {
    for (const item of changed) {
      item.node.style.overflow = item.overflow
      item.node.style.overflowY = item.overflowY
      item.node.style.maxHeight = item.maxHeight
    }
  }
}
