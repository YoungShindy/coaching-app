import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { addDays, startOfWeek, subDays } from 'date-fns'
import { Scale, Dumbbell, Moon, TrendingUp, TrendingDown, Target, Flame, FileText, X, Calendar as CalendarIcon, Check, ChevronRight, Users, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { useCountUp } from '../hooks/useCountUp'
import { formatDate, calcSleepHours, calcStreak, toLocalISO, todayISO } from '../lib/utils'
import type { CoachPlan, KalenderEvent, TrainingEntry } from '../types/database'
import { Anamnese } from './Anamnese'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart,
} from 'recharts'

interface DashStats {
  currentWeight: number | null
  weightChange: number | null
  targetWeight: number | null
  avgSleep: number | null
  sleepQuality: number | null
  totalTrainings: number
  totalCalories: number
  avgCalories: number | null
  calorieGoal: number | null
  weightHistory: { datum: string; gewicht: number }[]
  sleepHistory: { datum: string; stunden: number }[]
}

// Tagesansicht für Ring, Wochenbalken und „Heutiger Plan“ – aus vorhandenen Daten berechnet
interface TodayData {
  kcalEaten: number
  trainingsThisWeek: number
  trainingsGoal: number | null
  sleepHours: number | null
  sleepGoal: number | null
  weekMinutes: number[] // Mo–So, Trainingsminuten je Tag
  streak: number
  doneTrainings: TrainingEntry[]
  events: KalenderEvent[]
}

// Verzögerung (ms) für die gestaffelte Einblendung, siehe .enter in index.css
const d = (ms: number) => ({ '--d': ms }) as React.CSSProperties

const EMPTY_TODAY: TodayData = {
  kcalEaten: 0, trainingsThisWeek: 0, trainingsGoal: null, sleepHours: null, sleepGoal: null,
  weekMinutes: [0, 0, 0, 0, 0, 0, 0], streak: 0, doneTrainings: [], events: [],
}

function ActivityRings({ rings, label, value, unit, delay = 0 }: {
  rings: { color: string; progress: number }[]
  label: string
  value: string
  unit: string
  delay?: number
}) {
  const { colors } = useTheme()
  const size = 120
  const stroke = 9
  const gap = 4
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-40 h-40 shrink-0" role="img" aria-label={label}>
      {rings.map((ring, i) => {
        const r = size / 2 - stroke / 2 - 2 - i * (stroke + gap)
        const c = 2 * Math.PI * r
        const p = Math.max(0, Math.min(1, ring.progress))
        return (
          <g key={i} transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colors.track} strokeWidth={stroke} />
            {p > 0 && (
              <circle
                className="ring-draw"
                cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ring.color} strokeWidth={stroke}
                strokeLinecap="round" strokeDasharray={`${c * p} ${c}`}
                style={{ '--ring-c': c, '--ring-len': c * p, '--d': delay + i * 130, transition: 'stroke-dasharray 0.6s ease-out' } as React.CSSProperties}
              />
            )}
          </g>
        )
      })}
      <text x="60" y="62" textAnchor="middle" fontSize="15" fontWeight="800" fill="currentColor" className="text-text-primary">{value}</text>
      <text x="60" y="74" textAnchor="middle" fontSize="7" fontWeight="700" letterSpacing="0.6" fill="currentColor" className="text-text-secondary">{unit}</text>
    </svg>
  )
}

const WEEKDAYS = ['M', 'D', 'M', 'D', 'F', 'S', 'S']
const WEEKDAY_NAMES = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

function WeekBars({ minutes, todayIndex, delay = 0 }: { minutes: number[]; todayIndex: number; delay?: number }) {
  const max = Math.max(...minutes, 1)
  return (
    <div className="flex items-end justify-between gap-2 h-36" role="list" aria-label="Trainingsminuten pro Wochentag">
      {minutes.map((m, i) => {
        const isToday = i === todayIndex
        const future = i > todayIndex
        const h = m > 0 ? Math.max(10, Math.round((m / max) * 100)) : 0
        return (
          <div key={i} role="listitem" aria-label={`${WEEKDAY_NAMES[i]}: ${m} Minuten`} className="flex-1 flex flex-col items-center justify-end h-full gap-1.5">
            <div className="w-full flex-1 flex flex-col items-center justify-end">
              {isToday && m > 0 && <span className="text-[11px] font-bold text-brand mb-1">{m}</span>}
              <div
                className={`grow-y w-full max-w-[2.75rem] rounded-xl ${isToday ? 'bg-primary ring-1 ring-brand/50' : 'bg-bar'}`}
                style={{ height: m > 0 ? `${h}%` : '2px', opacity: future && m === 0 ? 0.5 : 1, '--d': delay + i * 55 } as React.CSSProperties}
              />
            </div>
            <span className={`text-xs font-bold ${isToday ? 'text-brand' : 'text-text-muted'}`}>{WEEKDAYS[i]}</span>
          </div>
        )
      })}
    </div>
  )
}

function PlanRow({ to, icon: Icon, tint, title, meta, done, delay = 0 }: {
  to: string; icon: React.ElementType; tint: string; title: string; meta: string; done?: boolean; delay?: number
}) {
  return (
    <Link to={to} style={d(delay)} className="enter card !p-4 flex items-center gap-4 hover:border-brand/40 transition-all active:scale-[0.985]">
      <span className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${tint}`}>
        <Icon size={22} aria-hidden="true" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-bold text-text-primary truncate">{title}</span>
        <span className="block text-sm text-text-secondary truncate">{meta}</span>
      </span>
      {done ? (
        <span className="w-9 h-9 rounded-full bg-brand/15 text-brand flex items-center justify-center shrink-0" aria-label="Erledigt">
          <Check size={18} strokeWidth={2.6} />
        </span>
      ) : (
        <ChevronRight size={20} className="text-text-muted shrink-0" aria-hidden="true" />
      )}
    </Link>
  )
}

function StatCard({ label, value, unit, icon: Icon, trend, color = 'primary' }: {
  label: string; value: string | number | null; unit?: string; icon: React.ElementType
  trend?: 'up' | 'down' | 'neutral'; color?: string
}) {
  const colorMap: Record<string, string> = {
    primary: 'text-brand bg-brand/10',
    success: 'text-success bg-success/10',
    warning: 'text-warning bg-warning/10',
    accent: 'text-accent bg-accent/10',
  }
  return (
    <div className="card group hover:border-border-light transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2.5 rounded-xl ${colorMap[color]}`}>
          <Icon size={18} />
        </div>
        {trend && trend !== 'neutral' && (
          <span className={trend === 'up' ? 'text-success' : 'text-danger'}>
            {trend === 'up' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-text-primary mb-0.5">
        {value !== null && value !== undefined ? value : '--'}
        {value !== null && value !== undefined && unit && (
          <span className="text-sm font-normal text-text-secondary ml-1">{unit}</span>
        )}
      </div>
      <div className="text-xs text-text-muted">{label}</div>
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="card !p-3 text-xs">
      <div className="text-text-muted mb-1">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="text-text-primary font-medium">
          {p.value} {p.unit || ''}
        </div>
      ))}
    </div>
  )
}

export function Dashboard() {
  const { user, profile } = useAuth()
  const [stats, setStats] = useState<DashStats>({
    currentWeight: null, weightChange: null, targetWeight: null,
    avgSleep: null, sleepQuality: null, totalTrainings: 0, totalCalories: 0,
    avgCalories: null, calorieGoal: null, weightHistory: [], sleepHistory: [],
  })
  const { colors } = useTheme()
  const [today, setToday] = useState<TodayData>(EMPTY_TODAY)
  const [loading, setLoading] = useState(true)
  const [masterplan, setMasterplan] = useState<CoachPlan | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [showAnamnese, setShowAnamnese] = useState(false)
  // Zahlen zählen weich hoch, sobald die Seite sichtbar wird
  const kcalShown = useCountUp(today.kcalEaten, { delay: 340 })
  const trainShown = useCountUp(today.trainingsThisWeek, { delay: 440 })
  const sleepShown = useCountUp(today.sleepHours ?? 0, { delay: 540 })
  const streakShown = useCountUp(today.streak, { delay: 320 })

  useEffect(() => {
    if (!user) return
    async function load() {
      const todayStr = todayISO()
      const since = toLocalISO(subDays(new Date(), 90))
      const [settingsRes, weightRes, trainingRes, schlafRes, planRes, foodRes, eventRes] = await Promise.all([
        supabase.from('client_settings').select('*').eq('user_id', user!.id).single(),
        supabase.from('gewicht').select('*').eq('user_id', user!.id).order('datum', { ascending: true }),
        supabase.from('training').select('*').eq('user_id', user!.id).order('datum', { ascending: false }),
        supabase.from('schlaf').select('*').eq('user_id', user!.id).order('datum', { ascending: true }),
        supabase.from('coach_plans').select('*').eq('client_id', user!.id).maybeSingle(),
        supabase.from('food_log').select('datum,kalorien').eq('user_id', user!.id).gte('datum', since).order('datum', { ascending: false }).limit(1000),
        supabase.from('kalender_events').select('*').or(`coach_id.eq.${user!.id},client_id.eq.${user!.id}`).eq('datum', todayStr).order('uhrzeit', { ascending: true }),
      ])

      const weights = weightRes.data ?? []
      const trainings = trainingRes.data ?? []
      const schlaf = schlafRes.data ?? []
      const settings = settingsRes.data
      // Show Anamnese for clients that haven't filled it in yet
      if (settings) {
        try {
          const note = settings.ernaehrungs_notizen ? JSON.parse(settings.ernaehrungs_notizen) : {}
          if (!note.anamnese_done) setShowAnamnese(true)
        } catch { setShowAnamnese(true) }
      }
      if (planRes.data) {
        setMasterplan(planRes.data)
        const seenAt = localStorage.getItem(`masterplan_seen_${user!.id}`)
        const planAt = planRes.data.angewendet_am ? new Date(planRes.data.angewendet_am).getTime() : 0
        const dismissed = seenAt ? new Date(seenAt).getTime() : 0
        setShowBanner(planAt > dismissed)
      }

      const currentWeight = weights.at(-1)?.gewicht ?? null
      const weightChange = weights.length >= 2 ? (weights.at(-1)!.gewicht - weights[0].gewicht) : null
      const targetWeight = settings?.zielgewicht ?? null

      const sleepWithHours = schlaf
        .filter(s => s.einschlafzeit && s.aufwachzeit)
        .map(s => ({
          datum: formatDate(s.datum, 'dd.MM'),
          stunden: calcSleepHours(s.einschlafzeit!, s.aufwachzeit!),
        }))
      const avgSleep = sleepWithHours.length > 0
        ? Math.round((sleepWithHours.reduce((a, b) => a + b.stunden, 0) / sleepWithHours.length) * 10) / 10
        : null

      const avgQuality = schlaf.filter(s => s.schlafqualitaet).length > 0
        ? Math.round(schlaf.filter(s => s.schlafqualitaet).reduce((a, b) => a + (b.schlafqualitaet ?? 0), 0) / schlaf.filter(s => s.schlafqualitaet).length * 10) / 10
        : null

      const totalKal = trainings.reduce((a, t) => a + (t.kalorien_verbrannt ?? 0), 0)

      // Ring, Wochenbalken, Streak und Tagesplan aus bereits vorhandenen Daten
      const food = (foodRes.data ?? []) as { datum: string; kalorien: number | null }[]
      const monday = startOfWeek(new Date(), { weekStartsOn: 1 })
      const weekDays = Array.from({ length: 7 }, (_, i) => toLocalISO(addDays(monday, i)))
      const weekMinutes = weekDays.map(d =>
        trainings.filter(t => t.datum === d).reduce((a, t) => a + (t.dauer_min ?? 0), 0))
      const lastSleep = schlaf.filter(x => x.einschlafzeit && x.aufwachzeit).at(-1)
      const sleepIsRecent = lastSleep && lastSleep.datum >= toLocalISO(subDays(new Date(), 1))
      const activeDates = new Set<string>([
        ...weights.map(w => w.datum), ...trainings.map(t => t.datum),
        ...schlaf.map(x => x.datum), ...food.map(f => f.datum),
      ])
      setToday({
        kcalEaten: Math.round(food.filter(f => f.datum === todayStr).reduce((a, f) => a + (f.kalorien ?? 0), 0)),
        trainingsThisWeek: trainings.filter(t => weekDays.includes(t.datum)).length,
        trainingsGoal: settings?.trainings_pro_woche ?? null,
        sleepHours: sleepIsRecent ? calcSleepHours(lastSleep.einschlafzeit!, lastSleep.aufwachzeit!) : null,
        sleepGoal: settings?.schlaf_ziel ?? null,
        weekMinutes,
        streak: calcStreak(activeDates),
        doneTrainings: trainings.filter(t => t.datum === todayStr),
        events: (eventRes.data ?? []) as KalenderEvent[],
      })

      setStats({
        currentWeight,
        weightChange,
        targetWeight,
        avgSleep,
        sleepQuality: avgQuality,
        totalTrainings: trainings.length,
        totalCalories: totalKal,
        avgCalories: null,
        calorieGoal: settings?.kalorie_tagesziel ?? null,
        weightHistory: weights.slice(-30).map(w => ({ datum: formatDate(w.datum, 'dd.MM'), gewicht: w.gewicht })),
        sleepHistory: sleepWithHours.slice(-14),
      })
      setLoading(false)
    }
    load()
  }, [user])

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Guten Morgen'
    if (h < 18) return 'Guten Tag'
    return 'Guten Abend'
  }

  if (showAnamnese && user && profile?.role === 'client') {
    return <Anamnese userId={user.id} onDone={() => setShowAnamnese(false)} />
  }

  const now = new Date()
  const todayIndex = (now.getDay() + 6) % 7
  const initial = profile?.name?.charAt(0)?.toUpperCase() ?? '?'
  const kcalGoal = stats.calorieGoal
  const trainGoal = today.trainingsGoal
  const sleepGoal = today.sleepGoal
  const planCount = today.doneTrainings.length + today.events.length
  const kcalText = Math.round(kcalShown).toLocaleString('de-DE')
  const sleepText = today.sleepHours === null ? '--'
    : sleepShown === today.sleepHours ? String(today.sleepHours).replace('.', ',')
    : String(Math.round(sleepShown * 10) / 10).replace('.', ',')
  const eventMeta = (e: KalenderEvent) =>
    [e.dauer_min ? `${e.dauer_min} min` : null, e.uhrzeit ? `${e.uhrzeit.slice(0, 5)} Uhr` : null].filter(Boolean).join(' · ') || 'Termin'

  return (
    <div className="space-y-6 lg:space-y-8" data-enter="manual">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="enter text-text-secondary" style={d(0)}>{greeting()},</p>
          <h1 className="enter text-3xl font-extrabold text-text-primary tracking-tight truncate" style={d(50)}>
            {profile?.name?.split(' ')[0] ?? 'Athlet'}
          </h1>
          <span className="enter inline-flex items-center gap-2 mt-3 px-3 py-1.5 rounded-full bg-bg-card border border-border text-sm font-semibold text-text-primary shadow-card" style={d(120)}>
            <CalendarIcon size={14} className="text-brand" aria-hidden="true" />
            {formatDate(now, 'EEEE, dd. MMM')}
          </span>
        </div>
        <Link to="/settings" style={d(90)} className="enter relative shrink-0 transition-transform active:scale-95" aria-label={`Profil und Einstellungen${today.streak > 0 ? `, ${today.streak} Tage Streak` : ''}`}>
          <span className="w-14 h-14 rounded-full bg-bg-card border-2 border-border-light flex items-center justify-center text-xl font-bold text-brand shadow-card">
            {initial}
          </span>
          {today.streak > 0 && (
            <span className="absolute -top-2 -right-2 inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-primary text-white text-xs font-bold ring-2 ring-bg border border-brand/40">
              <Flame size={11} aria-hidden="true" /> {Math.round(streakShown)}
            </span>
          )}
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Aktivität */}
        <div className="enter card" style={d(170)}>
          <h2 className="section-title mb-4">Aktivität</h2>
          <div className="flex items-center gap-5">
            <ActivityRings
              label={`Heute ${today.kcalEaten} Kilokalorien gegessen, ${today.trainingsThisWeek} Trainings diese Woche, Schlaf ${today.sleepHours ?? 'keine Angabe'} Stunden`}
              value={kcalText}
              unit="KCAL"
              delay={360}
              rings={[
                { color: colors.brand, progress: today.kcalEaten / (kcalGoal || 2000) },
                { color: colors.warning, progress: today.trainingsThisWeek / (trainGoal || 3) },
                { color: colors.accent, progress: (today.sleepHours ?? 0) / (sleepGoal || 8) },
              ]}
            />
            <dl className="flex-1 min-w-0 space-y-3.5">
              {[
                { color: 'bg-brand', label: 'Kalorien', value: kcalText, sub: kcalGoal ? `/ ${kcalGoal.toLocaleString('de-DE')} kcal` : 'kcal' },
                { color: 'bg-warning', label: 'Training', value: String(Math.round(trainShown)), sub: trainGoal ? `/ ${trainGoal} diese Woche` : 'diese Woche' },
                { color: 'bg-accent', label: 'Schlaf', value: sleepText, sub: sleepGoal ? `/ ${String(sleepGoal).replace('.', ',')} h` : 'h' },
              ].map(row => (
                <div key={row.label}>
                  <dt className="flex items-center gap-2 text-[11px] font-bold tracking-wider text-text-secondary uppercase">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${row.color}`} aria-hidden="true" />
                    {row.label}
                  </dt>
                  <dd className="pl-[18px] leading-tight">
                    <span className="text-xl font-extrabold text-text-primary">{row.value}</span>{' '}
                    <span className="text-xs text-text-muted whitespace-nowrap">{row.sub}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {/* Diese Woche */}
        <div className="enter card" style={d(260)}>
          <h2 className="section-title">Diese Woche</h2>
          <p className="flex items-center gap-1.5 text-sm text-text-secondary mt-1 mb-4">
            <Flame size={15} className="text-brand" aria-hidden="true" />
            {today.streak > 0 ? `${today.streak}-Tage-Streak` : 'Noch kein Streak – trag heute etwas ein'}
          </p>
          <WeekBars minutes={today.weekMinutes} todayIndex={todayIndex} delay={420} />
        </div>
      </div>

      {/* Heutiger Plan */}
      <section aria-labelledby="plan-title">
        <div className="enter flex items-center justify-between mb-3 px-1" style={d(350)}>
          <h2 id="plan-title" className="section-title">Heutiger Plan</h2>
          <Link to="/calendar" className="text-sm font-bold text-brand underline underline-offset-2">Alle ansehen</Link>
        </div>
        {loading ? (
          <div className="card !p-4 h-[5.5rem] animate-pulse" aria-hidden="true" />
        ) : planCount === 0 ? (
          <div className="enter card !p-5 flex items-center justify-between gap-4" style={d(420)}>
            <p className="text-sm text-text-secondary">Für heute ist noch nichts geplant.</p>
            <Link to="/training" className="btn-primary text-sm shrink-0">Training eintragen</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {today.doneTrainings.map((t, i) => (
              <PlanRow
                key={t.id} to="/training" icon={Dumbbell} tint="bg-brand/10 text-brand" done delay={440 + i * 80}
                title={t.trainingstyp ?? 'Training'}
                meta={[t.dauer_min ? `${t.dauer_min} min` : null, t.kalorien_verbrannt ? `${t.kalorien_verbrannt} kcal` : null].filter(Boolean).join(' · ') || 'Erledigt'}
              />
            ))}
            {today.events.map((e, i) => (
              <PlanRow
                key={e.id} to="/calendar" delay={440 + (today.doneTrainings.length + i) * 80}
                icon={e.typ === 'coaching' ? Users : e.typ === 'training' ? Dumbbell : Clock}
                tint={e.typ === 'coaching' ? 'bg-info/10 text-info' : e.typ === 'training' ? 'bg-brand/10 text-brand' : 'bg-warning/10 text-warning'}
                title={e.titel} meta={eventMeta(e)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Masterplan Banner — nur beim ersten Login nach Plan-Anwendung */}
      {masterplan && showBanner && (
        <div className="enter card border border-brand/30 bg-brand/5 flex items-center gap-4" style={d(480)}>
          <div className="p-3 rounded-xl bg-brand/10 text-brand shrink-0">
            <FileText size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-text-primary">Dein Masterplan ist bereit 🎉</div>
            <div className="text-xs text-text-muted mt-0.5">
              {masterplan.pdf_name ?? 'Personalisierter Coaching-Plan'} · {masterplan.angewendet_am ? formatDate(masterplan.angewendet_am) : ''}
            </div>
          </div>
          <button
            onClick={() => {
              setShowBanner(false)
              localStorage.setItem(`masterplan_seen_${user!.id}`, new Date().toISOString())
            }}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors shrink-0"
            title="Schließen"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* KPI Grid */}
      <div className="enter grid grid-cols-2 lg:grid-cols-4 gap-4" style={d(520)}>
        <StatCard
          label="Aktuelles Gewicht"
          value={stats.currentWeight}
          unit="kg"
          icon={Scale}
          trend={stats.weightChange !== null ? (stats.weightChange < 0 ? 'down' : stats.weightChange > 0 ? 'up' : 'neutral') : undefined}
          color="primary"
        />
        <StatCard
          label="Gewichtsveränderung"
          value={stats.weightChange !== null ? (stats.weightChange > 0 ? `+${stats.weightChange.toFixed(1)}` : stats.weightChange.toFixed(1)) : null}
          unit="kg"
          icon={Target}
          color="accent"
        />
        <StatCard label="Ø Schlafdauer" value={stats.avgSleep} unit="h" icon={Moon} color="primary" />
        <StatCard label="Trainingseinheiten" value={stats.totalTrainings || null} unit="gesamt" icon={Dumbbell} color="success" />
        <StatCard label="Kalorienverbrauch" value={stats.totalCalories || null} unit="kcal" icon={Flame} color="warning" />
        <StatCard label="Schlafqualität Ø" value={stats.sleepQuality} unit="/ 10" icon={Moon} color="accent" />
        <StatCard label="Zielgewicht" value={stats.targetWeight} unit="kg" icon={Target} color="success" />
        <StatCard
          label="Noch bis Ziel"
          value={stats.currentWeight && stats.targetWeight ? Math.abs(stats.currentWeight - stats.targetWeight).toFixed(1) : null}
          unit="kg"
          icon={TrendingDown}
          color="primary"
        />
      </div>

      {/* Charts */}
      <div className="enter grid grid-cols-1 lg:grid-cols-2 gap-6" style={d(600)}>
        {/* Weight Chart */}
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <h2 className="section-title">Gewichtsverlauf</h2>
            {stats.targetWeight && (
              <span className="badge bg-success/10 text-success">Ziel: {stats.targetWeight} kg</span>
            )}
          </div>
          {stats.weightHistory.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={stats.weightHistory}>
                <defs>
                  <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={colors.brand} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={colors.brand} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
                <XAxis dataKey="datum" tick={{ fill: colors.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: colors.tick, fontSize: 11 }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="gewicht" stroke={colors.brand} strokeWidth={2} fill="url(#weightGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-text-muted text-sm">
              Noch keine Gewichtsdaten vorhanden
            </div>
          )}
        </div>

        {/* Sleep Chart */}
        <div className="card">
          <h2 className="section-title mb-6">Schlafdauer (letzte 14 Tage)</h2>
          {stats.sleepHistory.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={stats.sleepHistory}>
                <defs>
                  <linearGradient id="sleepGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={colors.accent} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={colors.accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
                <XAxis dataKey="datum" tick={{ fill: colors.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: colors.tick, fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 12]} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="stunden" stroke={colors.accent} strokeWidth={2} fill="url(#sleepGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-text-muted text-sm">
              Noch keine Schlafdaten vorhanden
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
