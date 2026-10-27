import { useNavigate } from 'react-router-dom'
import {
  ChevronDown,
  Lock,
  LogOut,
  Moon,
  ScrollText,
  Sun,
  User,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { PATHS } from '@/router/paths'
import { cn } from '@/lib/utils'

// Profile chip + dropdown — Profile / Dark mode / Logs (admin) or Lock (cashier) / Logout.
// Setup gate — Profile + Logs/Lock disabled; Logout always allowed.
export function UserMenu({ setupGate = false }) {
  const { t } = useTranslation()
  const { user, logout, logoutAll, lockSession, cashDrawerOpen } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  if (!user) return null

  const isAdmin = user.role === 'admin'

  // Logout: if the till is open, cashier must close it first.
  // During Sync / Open Session, there is no till — sign out directly.
  const finishSignOut = async (result, failedKey) => {
    if (!result.success) {
      // Server still has an open drawer (client flag was stale).
      if (result.status === 409) {
        navigate(PATHS.closeCashDrawer)
        return
      }
      toast.error(result.error || t(failedKey))
      return
    }
    navigate(PATHS.login, { replace: true })
  }

  const handleLogout = async () => {
    if (!setupGate && cashDrawerOpen) {
      navigate(PATHS.closeCashDrawer)
      return
    }
    const result = await logout()
    await finishSignOut(result, 'userMenu.logoutFailed')
  }

  const handleLogoutAll = async () => {
    if (!setupGate && cashDrawerOpen) {
      navigate(PATHS.closeCashDrawer)
      return
    }
    const result = await logoutAll()
    await finishSignOut(result, 'userMenu.logoutAllFailed')
  }

  const handleLock = async () => {
    if (setupGate) return
    const result = await lockSession()
    if (result && !result.success) {
      toast.error(result.error || t('userMenu.lockFailed'))
    }
  }

  const handleProfile = () => {
    if (setupGate) return
    navigate(isAdmin ? PATHS.admin.profile : PATHS.profile)
  }

  const handleLogs = () => {
    if (setupGate || !isAdmin) return
    navigate(PATHS.admin.logs)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1 outline-none',
          'hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <Avatar size="default" className="bg-primary text-primary-foreground">
          <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
            {user.initials}
          </AvatarFallback>
        </Avatar>
        <div className="hidden text-start sm:block">
          <p className="text-sm leading-tight font-semibold text-foreground">
            {user.name}
          </p>
          <p className="text-xs capitalize text-muted-foreground">{user.role}</p>
        </div>
        <ChevronDown className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-64 p-0">
        <div className="flex items-center gap-3 px-4 py-3.5">
          <Avatar className="size-11 shrink-0 bg-primary text-primary-foreground">
            <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">
              {user.initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {user.name}
            </p>
            <p className="text-xs capitalize text-muted-foreground">{user.role}</p>
            <p className="truncate text-xs font-medium text-primary">
              {user.email || t('shared.emDash')}
            </p>
          </div>
        </div>

        <DropdownMenuSeparator className="m-0" />

        <div className="flex flex-col gap-0.5 p-2">
          <DropdownMenuItem
            disabled={setupGate}
            className="cursor-pointer gap-2.5 px-3 py-2.5 data-disabled:cursor-not-allowed"
            onClick={handleProfile}
          >
            <User className="size-4" />
            {t('userMenu.profile')}
          </DropdownMenuItem>

          <DropdownMenuItem
            className="cursor-pointer gap-2.5 px-3 py-2.5"
            onClick={toggleTheme}
          >
            {theme === 'dark' ? (
              <Sun className="size-4" />
            ) : (
              <Moon className="size-4" />
            )}
            {theme === 'dark' ? t('userMenu.lightMode') : t('userMenu.darkMode')}
          </DropdownMenuItem>

          {isAdmin ? (
            <DropdownMenuItem
              disabled={setupGate}
              className="cursor-pointer gap-2.5 px-3 py-2.5 data-disabled:cursor-not-allowed"
              onClick={handleLogs}
            >
              <ScrollText className="size-4" />
              {t('userMenu.logs')}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              disabled={setupGate}
              className="cursor-pointer gap-2.5 px-3 py-2.5 data-disabled:cursor-not-allowed"
              onClick={handleLock}
            >
              <Lock className="size-4" />
              {t('userMenu.lock')}
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            variant="destructive"
            className="cursor-pointer gap-2.5 px-3 py-2.5"
            onClick={handleLogout}
          >
            <LogOut className="size-4" />
            {t('userMenu.logout')}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            className="cursor-pointer gap-2.5 px-3 py-2.5"
            onClick={handleLogoutAll}
          >
            <LogOut className="size-4" />
            {t('userMenu.logoutAllTills')}
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
