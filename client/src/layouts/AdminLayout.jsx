import { Outlet } from 'react-router-dom'
import { AdminTopNav } from '@/layouts/Navbar/AdminTopNav'
import SessionLockModal from '@/components/shared/SessionLockModal'
import { isDesktopDevToolsDisabled } from '@/lib/desktop'
import { cn } from '@/lib/utils'

// Admin shell - topnav + scrollable main (natural height, no viewport squeeze).
export default function AdminLayout() {
  const kioskSelect = isDesktopDevToolsDisabled()

  return (
    <div
      className={cn(
        'flex h-dvh flex-col overflow-hidden bg-[var(--app-bg)]',
        kioskSelect && 'select-none',
      )}
    >
      <AdminTopNav />
      <main className="mx-auto w-full max-w-[1440px] flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <SessionLockModal />
    </div>
  )
}
