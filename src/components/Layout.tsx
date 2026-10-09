import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom'
import { LogOut, Plus, X, Zap } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { TodayStatusProvider, ROUTE_STATUS, statusLabel, useTodayStatus, type StatusItem } from '../hooks/useTodayStatus'
import { GameProvider } from '../hooks/useGame'
import { Celebrations } from './character/Celebrations'
import { StatusBadge } from './ui/StatusBadge'
import { cn } from '../lib/utils'
import {
  clientNav, coachNav, clientTabs, coachTabs, moreItems, quickActions, type NavItem,
} from '../lib/navigation'

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <TodayStatusProvider>
      <GameProvider>
        <LayoutInner>{children}</LayoutInner>
        <Celebrations />
      </GameProvider>
    </TodayStatusProvider>
  )
}

function LayoutInner({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth()
  const { status } = useTodayStatus()
  const navigate = useNavigate()
  const location = useLocation()
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickClosing, setQuickClosing] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const closeTimer = useRef<number | undefined>(undefined)

  const isCoach = profile?.role === 'coach'
  const nav = isCoach ? coachNav : clientNav
  const tabs = isCoach ? coachTabs : clientTabs
  const moreRoutes = moreItems(nav, tabs).map(i => i.to)

  // Zähler am Mehr-Reiter: wie viele der dort liegenden Tagesaufgaben sind heute erledigt?
  const moreTracked = isCoach ? [] : moreRoutes.map(r => ROUTE_STATUS[r]).filter(Boolean).map(k => status[k]).filter(i => i.total > 0)
  const moreDone = moreTracked.filter(i => i.level === 'done').length

  // Sheet gleitet beim Schließen nach unten weg, erst danach wird es entfernt
  const closeQuick = useCallback(() => {
    setQuickClosing(true)
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => { setQuickOpen(false); setQuickClosing(false) }, 240)
  }, [])
  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  // Bei Seitenwechsel: Sheet sofort zu, neue Seite beginnt oben
  useEffect(() => {
    window.clearTimeout(closeTimer.current)
    setQuickOpen(false)
    setQuickClosing(false)
    mainRef.current?.scrollTo({ top: 0 })
  }, [location.pathname])
  useEffect(() => {
    if (!quickOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeQuick() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [quickOpen, closeQuick])

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  // „Mehr“ ist aktiv, solange man auf /more oder einer dort verlinkten Seite ist
  const isMoreActive = (to: string) =>
    to === '/more' && (location.pathname === '/more' || moreRoutes.some(r => location.pathname.startsWith(r)))

  const TabLink = ({ to, icon: Icon, label }: NavItem) => {
    const active = to === '/more' ? isMoreActive(to) : location.pathname.startsWith(to)
    const key = ROUTE_STATUS[to]
    const item: StatusItem | undefined = key && !isCoach ? status[key] : undefined
    const isMore = to === '/more'
    const allDone = isMore && moreTracked.length > 0 && moreDone === moreTracked.length
    const touched = item ? item.level !== 'none' : isMore ? moreDone > 0 : false
    const tone = allDone || touched ? 'text-success' : active ? 'text-brand' : 'text-text-muted hover:text-text-primary'
    const hint = item && key ? `, ${statusLabel(key, item)}` : isMore && moreTracked.length ? `, ${moreDone} von ${moreTracked.length} Tagesaufgaben erledigt` : ''
    return (
      <Link
        to={to}
        aria-current={active ? 'page' : undefined}
        aria-label={`${label}${hint}`}
        className={cn(
          'flex flex-col items-center justify-center gap-1 py-2 rounded-2xl text-[11px] max-[339px]:text-[10px] font-semibold transition-all duration-200 active:scale-95',
          active && 'bg-brand/10',
          tone,
        )}
      >
        <span className="relative inline-flex">
          <Icon size={22} strokeWidth={active || touched ? 2.4 : 2} aria-hidden="true" />
          {item && <StatusBadge item={item} className="absolute -top-1 -right-2" />}
          {isMore && moreTracked.length > 0 && (
            allDone
              ? <StatusBadge item={{ level: 'done', done: moreDone, total: moreTracked.length }} className="absolute -top-1.5 -right-3" />
              : (
                <span
                  key={moreDone} aria-hidden="true"
                  className={cn(
                    'pop-in absolute -top-2 -right-4 min-w-[22px] h-4 px-1 rounded-full text-[10px] leading-4 font-bold text-center ring-2 ring-bg-card',
                    moreDone > 0 ? 'bg-brand text-bg' : 'bg-bg-elevated text-text-muted',
                  )}
                >{moreDone}/{moreTracked.length}</span>
              )
          )}
        </span>
        <span>{label}</span>
      </Link>
    )
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center ring-1 ring-inset ring-brand/30">
          <Zap size={18} className="text-white" />
        </div>
        <div>
          <div className="text-sm font-bold text-text-primary">HLX Together</div>
          <div className="text-xs text-text-muted">{isCoach ? 'Coach' : 'Athlet'}</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 pb-4 space-y-1 overflow-y-auto" aria-label="Hauptnavigation">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => cn('nav-link', isActive && 'active', !isCoach && ROUTE_STATUS[to] && status[ROUTE_STATUS[to]].level !== 'none' && '!text-success')}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
            {!isCoach && ROUTE_STATUS[to] && status[ROUTE_STATUS[to]].level !== 'none' && (
              <StatusBadge item={status[ROUTE_STATUS[to]]} size={18} className="ml-auto !ring-0" />
            )}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-9 h-9 rounded-full bg-brand/15 flex items-center justify-center text-brand text-sm font-bold shrink-0">
            {profile?.name?.charAt(0)?.toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-text-primary truncate">{profile?.name ?? profile?.email}</div>
            <div className="text-xs text-text-muted truncate">{profile?.email}</div>
          </div>
          <button
            onClick={handleSignOut}
            className="p-2 rounded-xl hover:bg-bg-elevated text-text-muted hover:text-danger transition-colors"
            title="Abmelden"
            aria-label="Abmelden"
          >
            <LogOut size={16} />
          </button>
        </div>
        {/* Legal footer */}
        <div className="flex gap-3 px-2 pb-1 mt-1">
          <Link to="/legal" className="hit text-[11px] text-text-muted hover:text-text-secondary transition-colors">Impressum</Link>
          <Link to="/legal" className="hit text-[11px] text-text-muted hover:text-text-secondary transition-colors">Datenschutz</Link>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      {/* Desktop Sidebar */}
      <aside className="enter hidden lg:flex flex-col w-64 shrink-0 border-r border-border bg-bg-card" style={{ '--d': 60 } as React.CSSProperties}>
        <SidebarContent />
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main ref={mainRef} className="flex-1 overflow-y-auto p-4 pt-6 pb-32 lg:p-8 lg:pb-8">
          {/* key: jede Seite baut sich beim Wechsel neu auf (siehe .page in index.css) */}
          <div key={location.pathname} className="page max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile: Schnellzugriff-Sheet */}
      {quickOpen && !isCoach && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Schnellzugriff">
          <div className={cn('absolute inset-0 bg-black/60', quickClosing ? 'fade-out' : 'fade-in')} onClick={closeQuick} />
          <div className={cn('absolute inset-x-0 bottom-0 bg-bg-card border-t border-border rounded-t-4xl p-5 pb-8', quickClosing ? 'sheet-out' : 'sheet-in')}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-text-primary">Schnell eintragen</h2>
              <button
                onClick={closeQuick}
                className="p-2 rounded-full bg-bg-elevated text-text-secondary hover:text-text-primary"
                aria-label="Schließen"
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {quickActions.map(({ to, icon: Icon, label, hint }, i) => {
                const key = ROUTE_STATUS[to]
                const item = key ? status[key] : undefined
                const done = item?.level === 'done'
                return (
                <Link
                  key={to}
                  to={to}
                  autoFocus={i === 0}
                  style={{ '--d': 120 + i * 55 } as React.CSSProperties}
                  className="enter flex flex-col gap-3 p-4 rounded-3xl bg-bg-elevated border border-border hover:border-brand/50 transition-all active:scale-[0.97]"
                >
                  <span className={cn('relative w-10 h-10 rounded-2xl flex items-center justify-center', done ? 'bg-success/15 text-success' : 'bg-brand/10 text-brand')}>
                    <Icon size={20} aria-hidden="true" />
                    {item && <StatusBadge item={item} className="absolute -top-1 -right-1" />}
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-text-primary">{label}</span>
                    <span className={cn('block text-xs', done ? 'text-success' : 'text-text-secondary')}>
                      {done ? 'Heute erledigt' : item?.level === 'partial' ? statusLabel(key, item) : hint}
                    </span>
                  </span>
                </Link>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Mobile: Tab-Bar */}
      <nav
        aria-label="Hauptnavigation"
        style={{ '--d': 200 } as React.CSSProperties}
        className="enter lg:hidden fixed bottom-0 inset-x-0 z-30 bg-bg-card border-t border-border rounded-t-4xl shadow-nav px-3 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        <div className={cn('grid items-end', isCoach ? 'grid-cols-3' : 'grid-cols-5')}>
          {tabs.left.map(t => <TabLink key={t.to} {...t} />)}
          {!isCoach && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => { window.clearTimeout(closeTimer.current); setQuickClosing(false); setQuickOpen(true) }}
                aria-label="Schnellzugriff öffnen"
                aria-expanded={quickOpen}
                className="-mt-8 w-14 h-14 rounded-full bg-primary text-white flex items-center justify-center ring-4 ring-bg-card border border-brand/40 shadow-glow transition-transform duration-200 active:scale-90"
              >
                <Plus size={26} strokeWidth={2.5} aria-hidden="true" />
              </button>
            </div>
          )}
          {tabs.right.map(t => <TabLink key={t.to} {...t} />)}
        </div>
      </nav>
    </div>
  )
}
