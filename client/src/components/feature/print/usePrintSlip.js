import { toast } from 'sonner'
import { jsPDF } from 'jspdf'
import { toCanvas } from 'html-to-image'
import i18n from '@/i18n'
import { resolvePrintRoot } from '@/components/feature/print/printArea'

const SLIP_WIDTH_MM = 80
const SLIP_PAD_MM = 4
const SLIP_CAPTURE_WIDTH_PX = 300

export function usePrintSlip() {
  // Takes the screenshot of the receipt and returns a canvas
  const captureCanvas = async (printTarget) => {
    const slip = resolvePrintRoot(printTarget)
    if (!slip) {
      toast.error(i18n.t('receipt.receiptNotReady'))
      return null
    }

    const restoreOverflow = unclipForCapture(slip)

    try {
      // Wait for fonts so letters don't break or smash together
      if (document.fonts?.ready) await document.fonts.ready
      await new Promise((r) => requestAnimationFrame(() => r()))

      const options = {
        pixelRatio: 3,
        backgroundColor: '#ffffff',
        cacheBust: true,
        width: SLIP_CAPTURE_WIDTH_PX,
        style: {
          width: `${SLIP_CAPTURE_WIDTH_PX}px`,
          maxWidth: `${SLIP_CAPTURE_WIDTH_PX}px`,
          minWidth: `${SLIP_CAPTURE_WIDTH_PX}px`,
          margin: '0',
          boxSizing: 'border-box',
          letterSpacing: 'normal',
          wordSpacing: 'normal',
          fontKerning: 'none',
          fontVariantLigatures: 'none',
          textRendering: 'geometricPrecision',
        },
      }

      // First call warms up font/image embedding, second is the real capture
      await toCanvas(slip, options).catch(() => {})
      const canvas = await toCanvas(slip, options)

      if (!canvas?.width || !canvas?.height) {
        throw new Error('Failed to capture receipt')
      }
      return canvas
    } finally {
      restoreOverflow()
    }
  }

  // PRINT button -> saves PDF directly (no dialog)
  const savePdf = async (invoice, printTarget) => {
    if (!invoice) return
    const loadingId = toast.loading(i18n.t('receipt.preparingPdf'))

    try {
      const canvas = await captureCanvas(printTarget)
      if (!canvas) return

      const imgData = canvas.toDataURL('image/png')
      const contentWidth = SLIP_WIDTH_MM - SLIP_PAD_MM * 2
      const contentHeight = (canvas.height / canvas.width) * contentWidth
      const pageHeight = contentHeight + SLIP_PAD_MM * 2

      const doc = new jsPDF({
        unit: 'mm',
        format: [SLIP_WIDTH_MM, pageHeight],
        compress: true,
      })

      doc.addImage(imgData, 'PNG', SLIP_PAD_MM, SLIP_PAD_MM, contentWidth, contentHeight)
      doc.save(`${invoice.id}.pdf`)

      toast.success('PDF saved')
    } catch (err) {
      console.error('savePdf failed', err)
      toast.error(err?.message || 'Failed to create PDF')
    } finally {
      toast.dismiss(loadingId)
    }
  }

  // DOWNLOAD button -> saves PNG image directly
  const savePng = async (invoice, printTarget) => {
    if (!invoice) return
    const loadingId = toast.loading('Preparing image...')

    try {
      const canvas = await captureCanvas(printTarget)
      if (!canvas) return

      canvas.toBlob((blob) => {
        if (!blob) {
          toast.error('Failed to create image')
          return
        }
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${invoice.id}.png`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        toast.success('Image saved')
      }, 'image/png')
    } catch (err) {
      console.error('savePng failed', err)
      toast.error(err?.message || 'Failed to download')
    } finally {
      toast.dismiss(loadingId)
    }
  }

  return { savePdf, savePng }
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