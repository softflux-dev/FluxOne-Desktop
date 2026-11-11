/** Stable print roots — never share one #print-area across dialogs. */
export const PRINT_AREA_ID = {
  receipt: 'print-area-receipt',
  return: 'print-area-return',
}

export const PRINT_AREA_CLASS = 'print-area'

/**
 * Resolve the DOM node to capture / print.
 * Accepts: HTMLElement, React ref, or id string.
 */
export function resolvePrintRoot(target) {
  if (!target) return null
  if (typeof target === 'string') {
    return document.getElementById(target)
  }
  if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement) {
    return target
  }
  if (target?.current instanceof HTMLElement) {
    return target.current
  }
  return null
}
