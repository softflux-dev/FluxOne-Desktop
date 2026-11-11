import { Outlet } from 'react-router-dom'
import { TopNav } from '@/layouts/Navbar/TopNav'
import SessionLockModal from '@/components/shared/SessionLockModal'
import { isDesktopDevToolsDisabled } from '@/lib/desktop'
import { cn } from '@/lib/utils'

// Cashier shell - topnav + main content.
// SessionLockModal is mounted once so Lock works on POS and Invoice pages.
export default function CashierLayout() {
  // Deterrence only when FLUXONE_DISABLE_DEVTOOLS=YES — inputs stay selectable via CSS
  const kioskSelect = isDesktopDevToolsDisabled()

  return (
    <div
      className={cn(
        'flex h-dvh flex-col overflow-hidden bg-[var(--app-bg)]',
        kioskSelect && 'select-none',
      )}
    >
      <TopNav />
      {/* Page content may grow past the viewport, main scrolls when needed */}
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <Outlet />
      </main>
      {/* Reusable lock overlay (POS + invoices + any cashier route) */}
      <SessionLockModal />
    </div>
  )
}
