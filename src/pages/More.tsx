import { Link, useNavigate } from 'react-router-dom'
import { Check, ChevronRight, LogOut } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { ROUTE_STATUS, statusLabel, useTodayStatus } from '../hooks/useTodayStatus'
import { cn } from '../lib/utils'
import { clientNav, coachNav, clientTabs, coachTabs, moreItems } from '../lib/navigation'

export function More() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const isCoach = profile?.role === 'coach'
  const items = isCoach ? moreItems(coachNav, coachTabs) : moreItems(clientNav, clientTabs)
  const { status, loaded } = useTodayStatus()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-brand/15 flex items-center justify-center text-brand text-xl font-bold shrink-0">
          {profile?.name?.charAt(0)?.toUpperCase() ?? '?'}
        </div>
        <div className="min-w-0">
          <h1 className="section-title text-2xl truncate">{profile?.name ?? 'Mehr'}</h1>
          <p className="text-sm text-text-secondary truncate">{profile?.email}</p>
        </div>
      </div>

      <nav className="card !p-2" aria-label="Weitere Seiten">
        <ul>
          {items.map(({ to, icon: Icon, label }) => {
            const key = !isCoach && loaded ? ROUTE_STATUS[to] : undefined
            const item = key ? status[key] : undefined
            const done = item?.level === 'done'
            const partial = item?.level === 'partial'
            const tracked = !!item && item.total > 0
            return (
              <li key={to}>
                <Link
                  to={to}
                  aria-label={key && item ? `${label}, ${statusLabel(key, item)}` : undefined}
                  className="flex items-center gap-4 px-3 py-3.5 rounded-2xl hover:bg-bg-elevated transition-colors"
                >
                  <span className={cn('w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 transition-colors duration-500', done || partial ? 'bg-success/15 text-success' : 'bg-brand/10 text-brand')}>
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <span className="flex-1 text-sm font-semibold text-text-primary">{label}</span>
                  {tracked && (
                    <span
                      key={item!.level}
                      className={cn(
                        'pop-in inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold',
                        done ? 'bg-success/15 text-success' : partial ? 'bg-success/10 text-success' : 'bg-bg-elevated text-text-muted',
                      )}
                    >
                      {done && <Check size={12} strokeWidth={3} aria-hidden="true" />}
                      {done ? 'Heute erledigt' : partial ? `${item!.done} von ${item!.total}` : 'Heute offen'}
                    </span>
                  )}
                  <ChevronRight size={18} className="text-text-muted" aria-hidden="true" />
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="card !p-2">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-4 px-3 py-3.5 rounded-2xl hover:bg-danger/10 transition-colors text-left"
        >
          <span className="w-10 h-10 rounded-2xl bg-danger/10 text-danger flex items-center justify-center shrink-0">
            <LogOut size={20} aria-hidden="true" />
          </span>
          <span className="flex-1 text-sm font-semibold text-danger">Abmelden</span>
        </button>
      </div>

      <div className="flex gap-4 px-2">
        <Link to="/legal" className="text-xs text-text-muted hover:text-text-secondary underline underline-offset-2">Impressum</Link>
        <Link to="/legal" className="text-xs text-text-muted hover:text-text-secondary underline underline-offset-2">Datenschutz</Link>
      </div>
    </div>
  )
}
