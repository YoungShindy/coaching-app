import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, TrendingUp, TrendingDown, Info } from 'lucide-react'
import { subDays } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useCountUpText } from '../../hooks/useCountUp'
import { cn, toLocalISO } from '../../lib/utils'
import { Spinner } from '../ui/Spinner'
import { EmptyState } from '../ui/EmptyState'
import { groupLabel, loadExercises, type PoolExercise } from '../../lib/exercises'
import {
  buildSeries, byGroup, compare, fmtKg, fmtPct, overall,
  type Change, type ExerciseSession, type GroupChange, type Metric, type SetLog,
} from '../../lib/strength'

type Period = '4w' | '12w' | 'all'
const PERIODS: { key: Period; label: string; days: number | null; text: string }[] = [
  { key: '4w', label: '4 Wochen', days: 28, text: 'in den letzten 4 Wochen' },
  { key: '12w', label: '3 Monate', days: 84, text: 'in den letzten 3 Monaten' },
  { key: 'all', label: 'Gesamt', days: null, text: 'seit Beginn' },
]

interface Row { uebungsname: string; saetze_log: SetLog[] | null; saetze: number | null; wdh: number | null; gewicht_kg: number | null; training_id: string }

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${34 - ((v - min) / span) * 30}`).join(' ')
  const last = pts.split(' ').at(-1)!.split(',')
  return (
    <svg viewBox="0 0 100 38" preserveAspectRatio="none" className="w-full h-9" aria-hidden="true">
      <polyline points={pts} fill="none" stroke="rgb(var(--c-brand))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill="rgb(var(--c-brand))" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function PctBadge({ pct }: { pct: number }) {
  const up = pct >= 0
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span className={cn('inline-flex items-center gap-1 text-sm font-extrabold tabular-nums', up ? 'text-success' : 'text-warning')}>
      <Icon size={14} aria-hidden="true" /> {fmtPct(pct)}
    </span>
  )
}

export function Fortschritt() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState<ExerciseSession[]>([])
  const [weights, setWeights] = useState<{ datum: string; gewicht: number }[]>([])
  const [pool, setPool] = useState<PoolExercise[]>([])
  const [period, setPeriod] = useState<Period>('12w')
  const [metric, setMetric] = useState<Metric>('max')
  const [perBw, setPerBw] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [help, setHelp] = useState(false)

  useEffect(() => {
    if (!user) return
    let alive = true
    async function load() {
      const [tr, ex, gw, p] = await Promise.all([
        supabase.from('training').select('id,datum').eq('user_id', user!.id),
        supabase.from('uebungen').select('uebungsname,saetze_log,saetze,wdh,gewicht_kg,training_id').eq('user_id', user!.id),
        supabase.from('gewicht').select('datum,gewicht').eq('user_id', user!.id).order('datum', { ascending: true }),
        loadExercises().catch(() => [] as PoolExercise[]),
      ])
      if (!alive) return
      const dates = new Map<string, string>((tr.data ?? []).map((t: { id: string; datum: string }) => [t.id, t.datum]))
      const list: ExerciseSession[] = []
      for (const r of (ex.data ?? []) as Row[]) {
        const datum = dates.get(r.training_id)
        if (!datum) continue
        const sets: SetLog[] = Array.isArray(r.saetze_log) && r.saetze_log.length
          ? r.saetze_log
          : r.saetze ? Array.from({ length: r.saetze }, () => ({ wdh: r.wdh, kg: r.gewicht_kg })) : []
        if (sets.length) list.push({ name: r.uebungsname, datum, sets })
      }
      setSessions(list)
      setWeights((gw.data ?? []) as { datum: string; gewicht: number }[])
      setPool(p)
      setLoading(false)
    }
    load()
    return () => { alive = false }
  }, [user])

  const cfg = PERIODS.find(p => p.key === period)!
  const since = cfg.days ? toLocalISO(subDays(new Date(), cfg.days)) : null
  const relative = perBw && metric === 'max'

  const { groups, total, trackedExercises } = useMemo(() => {
    const series = buildSeries(sessions, weights, metric, pool)
    const changes = series.map(s => compare(s, since, relative)).filter((c): c is Change => !!c)
    const groups = byGroup(changes)
    return { groups, total: overall(groups), trackedExercises: series.length }
  }, [sessions, weights, pool, metric, since, relative])

  const heroRef = useCountUpText<HTMLSpanElement>(total ?? 0, fmtPct, { duration: 1100, delay: 200 })
  const maxAbs = Math.max(5, ...groups.map(g => Math.abs(g.pct)))

  const fmtVal = (c: Change, v: number) => {
    if (c.series.unit === 'wdh') return `${Math.round(v)} Wdh.`
    if (relative) return `${v.toFixed(2).replace('.', ',')} × KG`
    if (metric === 'volumen') return `${Math.round(v).toLocaleString('de-DE')} kg`
    return fmtKg(v)
  }
  const fmtDelta = (c: Change) => {
    const sign = c.delta > 0 ? '+' : ''
    if (c.series.unit === 'wdh') return `${sign}${Math.round(c.delta)} Wdh.`
    if (relative) return `${sign}${c.delta.toFixed(2).replace('.', ',')} × KG`
    if (metric === 'volumen') return `${sign}${Math.round(c.delta).toLocaleString('de-DE')} kg`
    return `${sign}${fmtKg(c.delta)}`
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner size={28} /></div>

  return (
    <div className="space-y-5">
      {/* Einstellungen */}
      <div className="space-y-3 enter">
        <div className="flex gap-2 flex-wrap" role="group" aria-label="Zeitraum">
          {PERIODS.map(p => (
            <button
              key={p.key} aria-pressed={period === p.key} onClick={() => setPeriod(p.key)}
              className={cn('px-4 py-2 rounded-full text-sm font-semibold border transition-all active:scale-95',
                period === p.key ? 'bg-primary border-brand text-white' : 'border-border text-text-secondary hover:border-brand/40')}
            >{p.label}</button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap items-center" role="group" aria-label="Vergleichswert">
          {([['max', 'Maximalgewicht'], ['volumen', 'Volumen']] as [Metric, string][]).map(([k, label]) => (
            <button
              key={k} aria-pressed={metric === k} onClick={() => setMetric(k)}
              className={cn('px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all active:scale-95',
                metric === k ? 'bg-brand/15 border-brand/50 text-brand' : 'border-border text-text-muted hover:border-brand/40')}
            >{label}</button>
          ))}
          <label className={cn('flex items-center gap-2 text-xs ml-1 select-none', metric === 'max' ? 'text-text-secondary cursor-pointer' : 'text-text-muted opacity-60')}>
            <input type="checkbox" checked={perBw && metric === 'max'} disabled={metric !== 'max'} onChange={e => setPerBw(e.target.checked)} />
            Im Verhältnis zum Körpergewicht
          </label>
          <button onClick={() => setHelp(h => !h)} aria-expanded={help} className="ml-auto text-xs text-brand flex items-center gap-1" >
            <Info size={13} aria-hidden="true" /> So wird verglichen
          </button>
        </div>
        {help && (
          <div className="card !p-4 text-sm text-text-secondary leading-relaxed enter">
            <p>
              <strong className="text-text-primary">Maximalgewicht:</strong> Jeder Satz wird in ein geschätztes Gewicht für eine Wiederholung umgerechnet (Gewicht × (1 + Wdh. ÷ 30)).
              So lassen sich 10 Wiederholungen mit 55 kg und 8 Wiederholungen mit 60 kg direkt vergleichen. Pro Trainingstag zählt dein bester Satz.
            </p>
            <p className="mt-2">
              <strong className="text-text-primary">Volumen:</strong> Summe aus Sätzen × Wiederholungen × Gewicht pro Trainingstag.
            </p>
            <p className="mt-2">
              <strong className="text-text-primary">Muskelgruppe:</strong> Durchschnitt der Prozent-Änderung aller Übungen dieser Gruppe. Es zählen nur Übungen mit mindestens zwei Einträgen im Zeitraum.
            </p>
          </div>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="card enter" style={{ '--d': 80 } as React.CSSProperties}>
          <EmptyState
            icon={TrendingUp} title="Noch nicht genug Daten"
            description={trackedExercises === 0
              ? 'Trage Trainings mit Gewicht und Wiederholungen ein. Sobald du dieselbe Übung an zwei Tagen gemacht hast, siehst du hier, wie viel stärker du geworden bist.'
              : `Für ${cfg.text} gibt es noch keine Übung mit zwei Einträgen. Wähle einen längeren Zeitraum oder trainiere dieselbe Übung noch einmal.`}
          />
        </div>
      ) : (
        <>
          <div className="card enter text-center" style={{ '--d': 70 } as React.CSSProperties}>
            <div className="text-xs font-bold tracking-wider text-text-secondary uppercase">Durchschnitt aller Muskelgruppen</div>
            <div className={cn('text-5xl font-extrabold tracking-tight mt-1 tabular-nums', (total ?? 0) >= 0 ? 'text-brand' : 'text-warning')}>
              <span ref={heroRef} />
            </div>
            <div className="text-sm text-text-secondary mt-1">
              {(total ?? 0) >= 0 ? 'stärker' : 'weniger'} {cfg.text} · {groups.reduce((a, g) => a + g.items.length, 0)} Übungen verglichen
            </div>
          </div>

          <div className="space-y-3">
            {groups.map((g: GroupChange, gi) => {
              const isOpen = open === g.group
              return (
                <div key={g.group} className="card !p-0 enter overflow-hidden" style={{ '--d': 130 + gi * 55 } as React.CSSProperties}>
                  <button
                    onClick={() => setOpen(isOpen ? null : g.group)} aria-expanded={isOpen}
                    className="w-full p-4 sm:p-5 flex items-center gap-4 text-left active:bg-bg-elevated/60 transition-colors"
                  >
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-bold text-text-primary">{groupLabel(g.group)}</span>
                        <PctBadge pct={g.pct} />
                      </div>
                      <div className="h-2 rounded-full bg-bg-elevated overflow-hidden" aria-hidden="true">
                        <div
                          className={cn('h-full rounded-full grow-x', g.pct >= 0 ? 'bg-brand' : 'bg-warning')}
                          style={{ width: `${Math.max(4, Math.min(100, (Math.abs(g.pct) / maxAbs) * 100))}%`, '--d': 220 + gi * 55 } as React.CSSProperties}
                        />
                      </div>
                      <div className="text-xs text-text-muted">{g.items.length} {g.items.length === 1 ? 'Übung' : 'Übungen'}</div>
                    </div>
                    <ChevronDown size={18} className={cn('text-text-muted transition-transform duration-300 shrink-0', isOpen && 'rotate-180')} aria-hidden="true" />
                  </button>

                  {isOpen && (
                    <ul className="border-t border-border divide-y divide-border">
                      {g.items.map((c, i) => {
                        const pts = c.series.points.filter(p => !since || p.datum >= since)
                        return (
                          <li key={c.series.key} className="p-4 sm:px-5 enter" style={{ '--d': i * 45 } as React.CSSProperties}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-text-primary truncate">{c.series.name}</div>
                                <div className="text-xs text-text-muted mt-0.5">{fmtVal(c, c.start)} → <span className="text-text-secondary font-semibold">{fmtVal(c, c.end)}</span></div>
                              </div>
                              <div className="text-right shrink-0">
                                <PctBadge pct={c.pct} />
                                <div className="text-xs text-text-muted mt-0.5">{fmtDelta(c)}</div>
                              </div>
                            </div>
                            <div className="mt-2"><Sparkline values={pts.map(p => (relative && p.bw ? p.value / p.bw : p.value))} /></div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
