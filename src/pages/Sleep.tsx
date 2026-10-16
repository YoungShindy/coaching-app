import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, Moon, Camera, Sparkles, X, HeartPulse, TrendingUp, TrendingDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { formatDate, calcSleepHours, todayISO } from '../lib/utils'
import { Modal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { Spinner } from '../components/ui/Spinner'
import { useCountUpText } from '../hooks/useCountUp'
import { isMissingColumn } from '../lib/dbErrors'
import type { SchlafEntry } from '../types/database'
import { BarChart, Bar, Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="card !p-3 text-xs">
      <div className="text-text-muted mb-1">{label}</div>
      <div className="text-text-primary font-bold">{payload[0]?.value}h</div>
    </div>
  )
}

const HrvTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="card !p-3 text-xs">
      <div className="text-text-muted mb-1">{label}</div>
      <div className="text-text-primary font-bold">{payload[0]?.value} ms</div>
    </div>
  )
}

// Meldet true, sobald das Element (einmalig) im sichtbaren Bereich ist – so läuft die Graph-Animation erst, wenn man sie sieht
function useInViewOnce<T extends Element>() {
  const [el, setEl] = useState<T | null>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    if (!el || seen) return
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setSeen(true); observer.disconnect() }
    }, { threshold: 0.35 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [el, seen])
  return [setEl, seen] as const
}

const EMPTY_FORM = { datum: todayISO(), einschlafzeit: '23:00', aufwachzeit: '07:00', schlafqualitaet: '7', hrv: '', notizen: '' }

function QualityStars({ value }: { value: number | null }) {
  if (!value) return <span className="text-text-muted">--</span>
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < value ? 'bg-brand' : 'bg-border'}`} />
      ))}
      <span className="ml-1.5 text-xs text-text-secondary">{value}/10</span>
    </div>
  )
}

export function Sleep() {
  const { user } = useAuth()
  const { colors } = useTheme()
  const [entries, setEntries] = useState<SchlafEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [sleepGoal, setSleepGoal] = useState(8)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saveError, setSaveError] = useState('')

  async function load() {
    if (!user) return
    const [entriesRes, settingsRes] = await Promise.all([
      supabase.from('schlaf').select('*').eq('user_id', user.id).order('datum', { ascending: true }),
      supabase.from('client_settings').select('schlaf_ziel').eq('user_id', user.id).single(),
    ])
    setEntries(entriesRes.data ?? [])
    setSleepGoal(settingsRes.data?.schlaf_ziel ?? 8)
    setLoading(false)
  }

  useEffect(() => { load() }, [user])

  async function analyzePhoto(file: File) {
    setAnalyzing(true)
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1]
      setPhotoPreview(reader.result as string)
      try {
        const { data } = await supabase.functions.invoke('analyze-screenshot', {
          body: { imageBase64: base64, mimeType: file.type, context: 'sleep' },
        })
        if (data?.result) {
          const r = data.result
          setForm(f => ({
            ...f,
            einschlafzeit: r.einschlafzeit || f.einschlafzeit,
            aufwachzeit: r.aufwachzeit || f.aufwachzeit,
            schlafqualitaet: r.schlafqualitaet ? String(Math.min(10, Math.max(1, Math.round(r.schlafqualitaet)))) : f.schlafqualitaet,
            hrv: r.hrv_ms && r.hrv_ms > 0 && r.hrv_ms <= 500 ? String(Math.round(r.hrv_ms * 10) / 10) : f.hrv,
            notizen: r.notizen || f.notizen,
          }))
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : ''
        alert(msg.includes('429') ? 'Zu viele Anfragen – bitte kurz warten und erneut versuchen.' : 'Foto-Analyse fehlgeschlagen. Bitte erneut versuchen.')
      }
      setAnalyzing(false)
    }
    reader.readAsDataURL(file)
  }

  async function handleSave() {
    if (!user) return
    const hrv = parseFloat(form.hrv.replace(',', '.'))
    if (form.hrv && !(hrv > 0 && hrv <= 500)) {
      setSaveError('Die HRV muss zwischen 1 und 500 ms liegen.')
      return
    }
    setSaving(true)
    setSaveError('')
    const row = {
      user_id: user.id,
      datum: form.datum,
      einschlafzeit: form.einschlafzeit,
      aufwachzeit: form.aufwachzeit,
      schlafqualitaet: form.schlafqualitaet ? parseInt(form.schlafqualitaet) : null,
      notizen: form.notizen || null,
    }
    let { error } = await supabase.from('schlaf').upsert(
      { ...row, hrv_ms: form.hrv ? Math.round(hrv * 10) / 10 : null },
      { onConflict: 'user_id,datum' },
    )
    if (isMissingColumn(error)) {
      // Datenbank-Update (Spalte hrv_ms) noch nicht eingespielt: Schlaf speichern, HRV nicht
      ;({ error } = await supabase.from('schlaf').upsert(row, { onConflict: 'user_id,datum' }))
      if (!error && form.hrv) alert('Der Schlaf wurde gespeichert, die HRV aber nicht: Das Datenbank-Update für die HRV fehlt noch.')
    }
    if (error) {
      setSaveError('Speichern fehlgeschlagen. Bitte versuche es noch einmal.')
      setSaving(false)
      return
    }
    await load()
    setOpen(false)
    setPhotoPreview(null)
    setForm({ ...EMPTY_FORM, datum: todayISO() })
    setSaving(false)
  }

  async function handleDelete(id: string) {
    await supabase.from('schlaf').delete().eq('id', id)
    setEntries(e => e.filter(x => x.id !== id))
  }

  const withHours = entries
    .filter(e => e.einschlafzeit && e.aufwachzeit)
    .map(e => ({
      ...e,
      stunden: calcSleepHours(e.einschlafzeit!, e.aufwachzeit!),
      datumLabel: formatDate(e.datum, 'dd.MM'),
    }))

  const avgSleep = withHours.length
    ? Math.round(withHours.reduce((a, b) => a + b.stunden, 0) / withHours.length * 10) / 10
    : null

  const avgQuality = entries.filter(e => e.schlafqualitaet).length
    ? Math.round(entries.filter(e => e.schlafqualitaet).reduce((a, b) => a + (b.schlafqualitaet ?? 0), 0) / entries.filter(e => e.schlafqualitaet).length * 10) / 10
    : null

  const chartData = withHours.slice(-21)

  const hrvData = useMemo(
    () => entries
      .filter(e => e.hrv_ms != null)
      .slice(-30)
      .map(e => ({ datumLabel: formatDate(e.datum, 'dd.MM'), hrv: Number(e.hrv_ms) })),
    [entries],
  )
  const hrvAvg = hrvData.length ? Math.round(hrvData.reduce((a, b) => a + b.hrv, 0) / hrvData.length) : null
  const hrvLatest = hrvData.length ? hrvData[hrvData.length - 1].hrv : null
  const hrvDelta = hrvLatest !== null && hrvData.length > 1
    ? Math.round((hrvLatest - hrvData.slice(0, -1).reduce((a, b) => a + b.hrv, 0) / (hrvData.length - 1)) * 10) / 10
    : null
  const hrvAxis = hrvData.length
    ? [Math.max(0, Math.floor(Math.min(...hrvData.map(d => d.hrv)) / 10) * 10 - 10), Math.ceil(Math.max(...hrvData.map(d => d.hrv)) / 10) * 10 + 10]
    : [0, 100]
  const [hrvChartRef, hrvChartSeen] = useInViewOnce<HTMLDivElement>()
  const hrvLatestRef = useCountUpText<HTMLSpanElement>(hrvLatest ?? 0, v => String(Math.round(v)), { duration: 1100 })

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title text-2xl">Schlaf</h1>
          <p className="text-text-secondary text-sm mt-0.5">Schlafdauer & Qualitätstracking</p>
        </div>
        <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Eintragen
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card text-center">
          <div className="text-2xl font-bold text-text-primary">{avgSleep ? `${avgSleep}h` : '--'}</div>
          <div className="text-xs text-text-muted mt-1">Ø Schlafdauer</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-text-primary">{sleepGoal}h</div>
          <div className="text-xs text-text-muted mt-1">Schlafziel</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-text-primary">{avgQuality ? `${avgQuality}/10` : '--'}</div>
          <div className="text-xs text-text-muted mt-1">Ø Qualität</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-text-primary">{hrvAvg !== null ? `${hrvAvg} ms` : '--'}</div>
          <div className="text-xs text-text-muted mt-1">Ø HRV</div>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 1 && (
        <div className="card">
          <h2 className="section-title mb-6">Schlafdauer Verlauf</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
              <XAxis dataKey="datumLabel" tick={{ fill: colors.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: colors.tick, fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 12]} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={sleepGoal} stroke={colors.success} strokeDasharray="6 3" label={{ value: 'Ziel', fill: colors.success, fontSize: 11 }} />
              <Bar isAnimationActive={false} dataKey="stunden" fill={colors.accent} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* HRV */}
      {hrvData.length > 0 && (
        <div className="card">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="section-title flex items-center gap-2"><HeartPulse size={18} className="text-danger" /> HRV Verlauf</h2>
              <p className="text-xs text-text-muted mt-1">Herzratenvariabilität in ms{hrvAvg !== null && <> · gestrichelt: Ø {hrvAvg} ms</>}</p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-3xl font-bold text-text-primary leading-none">
                <span ref={hrvLatestRef} className="tabular-nums" />
                <span className="text-sm font-semibold text-text-muted ml-1">ms</span>
              </div>
              {hrvDelta !== null && (
                <div className={`mt-1.5 inline-flex items-center gap-1 text-xs font-semibold ${hrvDelta >= 0 ? 'text-success' : 'text-warning'}`}>
                  {hrvDelta >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                  {hrvDelta > 0 ? '+' : ''}{hrvDelta} ms zum Schnitt
                </div>
              )}
            </div>
          </div>
          {hrvData.length > 1 ? (
            <div ref={hrvChartRef} style={{ height: 260 }}>
            {hrvChartSeen && (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={hrvData}>
                <defs>
                  <linearGradient id="hrvGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={colors.brand} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={colors.brand} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
                <XAxis dataKey="datumLabel" tick={{ fill: colors.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: colors.tick, fontSize: 11 }} axisLine={false} tickLine={false} domain={hrvAxis} />
                <Tooltip content={<HrvTooltip />} />
                {hrvAvg !== null && (
                  <ReferenceLine y={hrvAvg} stroke={colors.success} strokeDasharray="6 3" />
                )}
                <Area
                  isAnimationActive
                  animationDuration={1600}
                  animationEasing="ease-out"
                  type="monotone"
                  dataKey="hrv"
                  stroke={colors.brand}
                  strokeWidth={2.5}
                  fill="url(#hrvGrad)"
                  dot={{ fill: colors.brand, r: 3 }}
                  activeDot={{ r: 6 }}
                />
              </AreaChart>
            </ResponsiveContainer>
            )}
            </div>
          ) : (
            <p className="text-sm text-text-muted text-center py-6">Trage die HRV an mehreren Tagen ein, dann siehst du hier den Verlauf.</p>
          )}
        </div>
      )}

      {/* Table */}
      <div className="card">
        <h2 className="section-title mb-4">Einträge</h2>
        {loading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : entries.length === 0 ? (
          <EmptyState icon={Moon} title="Noch keine Schlafeinträge" description="Trage täglich deine Schlafzeiten ein." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-text-muted font-medium">Datum</th>
                  <th className="text-left py-2 px-3 text-text-muted font-medium">Eingeschlafen</th>
                  <th className="text-left py-2 px-3 text-text-muted font-medium">Aufgewacht</th>
                  <th className="text-right py-2 px-3 text-text-muted font-medium">Dauer</th>
                  <th className="text-left py-2 px-3 text-text-muted font-medium">Qualität</th>
                  <th className="text-right py-2 px-3 text-text-muted font-medium">HRV</th>
                  <th className="py-2 px-3" />
                </tr>
              </thead>
              <tbody>
                {[...entries].reverse().map(e => {
                  const stunden = e.einschlafzeit && e.aufwachzeit ? calcSleepHours(e.einschlafzeit, e.aufwachzeit) : null
                  return (
                    <tr key={e.id} className="border-b border-border/50 hover:bg-bg-elevated/50 transition-colors">
                      <td className="py-2.5 px-3 text-text-secondary">{formatDate(e.datum)}</td>
                      <td className="py-2.5 px-3 text-text-primary">{e.einschlafzeit ?? '--'}</td>
                      <td className="py-2.5 px-3 text-text-primary">{e.aufwachzeit ?? '--'}</td>
                      <td className="py-2.5 px-3 text-right">
                        <span className={`font-semibold ${stunden !== null && stunden >= sleepGoal ? 'text-success' : stunden !== null ? 'text-warning' : 'text-text-muted'}`}>
                          {stunden !== null ? `${stunden}h` : '--'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <QualityStars value={e.schlafqualitaet} />
                      </td>
                      <td className="py-2.5 px-3 text-right text-text-primary">{e.hrv_ms != null ? `${Number(e.hrv_ms)} ms` : '--'}</td>
                      <td className="py-2.5 px-3 text-right">
                        <button onClick={() => handleDelete(e.id)} className="p-1.5 rounded hover:bg-danger/10 hover:text-danger text-text-muted transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => { setOpen(false); setPhotoPreview(null) }} title="Schlaf eintragen">
        <div className="space-y-4">
          {/* Photo AI */}
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={e => { if (e.target.files?.[0]) analyzePhoto(e.target.files[0]) }} />
          <div
            onClick={() => fileRef.current?.click()}
            className={`relative flex items-center gap-3 p-3 rounded-xl border-2 border-dashed cursor-pointer transition-all
              ${photoPreview ? 'border-accent/50 bg-accent/5' : 'border-border hover:border-accent/40 hover:bg-accent/5'}`}
          >
            {photoPreview ? (
              <>
                <img src={photoPreview} alt="Schlaf" className="w-14 h-14 rounded-lg object-cover shrink-0" />
                <div className="flex-1 min-w-0">
                  {analyzing ? (
                    <div className="flex items-center gap-2 text-sm text-accent"><Spinner size={14} /><span>Analysiere Schlafdata...</span></div>
                  ) : (
                    <div className="text-sm text-success font-medium flex items-center gap-1.5"><Sparkles size={14} />Schlafzeiten erkannt</div>
                  )}
                  <div className="text-xs text-text-muted mt-0.5">Anderes Bild wählen</div>
                </div>
                <button onClick={e => { e.stopPropagation(); setPhotoPreview(null) }}
                  className="p-1 rounded hover:bg-danger/10 hover:text-danger text-text-muted transition-colors shrink-0">
                  <X size={14} />
                </button>
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                  <Camera size={18} className="text-accent" />
                </div>
                <div>
                  <div className="text-sm font-medium text-text-primary flex items-center gap-1.5">
                    <Sparkles size={13} className="text-accent" />
                    Schlaf-App Screenshot analysieren
                  </div>
                  <div className="text-xs text-text-muted">Apple Health, Oura, Whoop — Zeiten & Qualität werden automatisch erkannt</div>
                </div>
              </>
            )}
          </div>

          <div>
            <label className="label">Datum</label>
            <input type="date" className="input" value={form.datum} onChange={e => setForm(f => ({ ...f, datum: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Eingeschlafen um</label>
              <input type="time" className="input" value={form.einschlafzeit} onChange={e => setForm(f => ({ ...f, einschlafzeit: e.target.value }))} />
            </div>
            <div>
              <label className="label">Aufgewacht um</label>
              <input type="time" className="input" value={form.aufwachzeit} onChange={e => setForm(f => ({ ...f, aufwachzeit: e.target.value }))} />
            </div>
          </div>
          {form.einschlafzeit && form.aufwachzeit && (
            <div className="p-3 bg-bg-elevated rounded-lg text-center">
              <span className="text-text-muted text-sm">Schlafdauer: </span>
              <span className="font-bold text-text-primary">{calcSleepHours(form.einschlafzeit, form.aufwachzeit)}h</span>
            </div>
          )}
          <div>
            <label className="label">Schlafqualität (1–10)</label>
            <div className="flex items-center gap-3">
              <input
                type="range" min="1" max="10" className="flex-1 accent-brand"
                value={form.schlafqualitaet}
                onChange={e => setForm(f => ({ ...f, schlafqualitaet: e.target.value }))}
              />
              <span className="w-8 text-center font-bold text-text-primary">{form.schlafqualitaet}</span>
            </div>
          </div>
          <div>
            <label className="label flex items-center gap-1.5"><HeartPulse size={13} /> HRV in ms (optional)</label>
            <input
              type="number" inputMode="decimal" min="1" max="500" step="0.1" className="input"
              placeholder="z. B. 55"
              value={form.hrv}
              onChange={e => setForm(f => ({ ...f, hrv: e.target.value }))}
            />
            <p className="text-xs text-text-muted mt-1">Den Wert findest du in deiner Uhr oder Schlaf-App (Apple Health, Oura, Whoop, Garmin).</p>
          </div>
          <div>
            <label className="label">Notizen (optional)</label>
            <input type="text" className="input" placeholder="Wie hast du geschlafen?" value={form.notizen} onChange={e => setForm(f => ({ ...f, notizen: e.target.value }))} />
          </div>
          {saveError && <p role="alert" className="text-sm text-danger">{saveError}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={() => { setOpen(false); setSaveError('') }} className="btn-secondary flex-1">Abbrechen</button>
            <button onClick={handleSave} className="btn-primary flex-1 flex items-center justify-center gap-2" disabled={saving}>
              {saving && <Spinner size={16} />}
              Speichern
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
