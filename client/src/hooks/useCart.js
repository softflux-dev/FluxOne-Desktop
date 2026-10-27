import { useCallback, useMemo } from 'react'
import { useAppDispatch, useAppSelector } from '@/rtk/hooks'
import {
  addSaleItem,
  removeSaleItem,
  updateSaleItem,
  selectSalesMutating,
} from '@/rtk/features/sales/salesSlice'
import { selectAuthCashDrawerOpen } from '@/rtk/features/auth/authSlice'
import { toResultError } from '@/api/result'
import { stockLowMessage, stockOutMessage } from '@/lib/cartMath'
import { LOW_STOCK_THRESHOLD } from '@/lib/constants'
import { useSaleTabs } from '@/hooks/useSaleTabs'
import { useAuth } from '@/context/AuthContext'
import i18n from '@/i18n'

/**
 * Active-tab cart mutations — add / qty / remove via server.
 */
export function useCart() {
  const dispatch = useAppDispatch()
  const cashDrawerOpenStore = useAppSelector(selectAuthCashDrawerOpen)
  const mutating = useAppSelector(selectSalesMutating)
  const { cashDrawerOpen: cashDrawerOpenAuth } = useAuth()
  const cashDrawerOpen = cashDrawerOpenStore || cashDrawerOpenAuth
  const { activeTab, activeTabId } = useSaleTabs()

  const cart = useMemo(() => activeTab?.cart || [], [activeTab?.cart])

  const addItem = useCallback(
    async ({ productId, sku, qty = 1, product } = {}) => {
      if (!cashDrawerOpen) {
        return { success: false, error: i18n.t('cart.openDrawerBeforeSelling') }
      }
      if (!activeTabId) {
        return { success: false, error: i18n.t('cart.noActiveSaleTab') }
      }

      const stock = product != null ? Number(product.stock) : null
      if (stock != null && stock <= 0) {
        return {
          success: false,
          error: stockOutMessage(0),
          code: 'INSUFFICIENT_STOCK',
        }
      }

      const id = productId || product?.id
      const code = sku || product?.sku
      if (!id && !code) {
        return { success: false, error: i18n.t('cart.productIdOrSkuRequired') }
      }

      const existing = id
        ? cart.find((l) => l.productId === id && !l.returned && !l.kept)
        : null
      const addQty = Number(qty) || 1
      const nextQty = (existing?.qty || 0) + addQty

      // Still block client-side when we know stock (server also enforces)
      if (stock != null && nextQty > stock) {
        return {
          success: false,
          error: stockOutMessage(stock),
          code: 'INSUFFICIENT_STOCK',
        }
      }

      try {
        const body = { qty: addQty }
        if (id) body.productId = id
        else body.sku = code
        const data = await dispatch(
          addSaleItem({ tabId: activeTabId, ...body }),
        ).unwrap()

        const warning =
          data?.warning ||
          (stock != null && stock < LOW_STOCK_THRESHOLD
            ? stockLowMessage(stock)
            : null)

        return { success: true, data, warning }
      } catch (err) {
        return toResultError(err)
      }
    },
    [cashDrawerOpen, activeTabId, cart, dispatch],
  )

  const setLineQty = useCallback(
    async (lineId, qty) => {
      if (!activeTabId) {
        return { success: false, error: i18n.t('cart.noActiveSaleTab') }
      }
      const n = Number(qty)
      if (!Number.isFinite(n) || n < 0) {
        return { success: false, error: i18n.t('cart.invalidQty') }
      }
      if (n <= 0) {
        try {
          await dispatch(
            removeSaleItem({ tabId: activeTabId, lineId }),
          ).unwrap()
          return { success: true }
        } catch (err) {
          return toResultError(err)
        }
      }
      try {
        const data = await dispatch(
          updateSaleItem({
            tabId: activeTabId,
            lineId,
            qty: Math.floor(n),
          }),
        ).unwrap()
        return { success: true, data }
      } catch (err) {
        return toResultError(err)
      }
    },
    [activeTabId, dispatch],
  )

  const removeLine = useCallback(
    async (lineId) => {
      if (!activeTabId) {
        return { success: false, error: i18n.t('cart.noActiveSaleTab') }
      }
      try {
        await dispatch(removeSaleItem({ tabId: activeTabId, lineId })).unwrap()
        return { success: true }
      } catch (err) {
        return toResultError(err)
      }
    },
    [activeTabId, dispatch],
  )

  return {
    cart,
    activeTab,
    activeTabId,
    addItem,
    setLineQty,
    removeLine,
    isMutating: mutating,
  }
}

export default useCart