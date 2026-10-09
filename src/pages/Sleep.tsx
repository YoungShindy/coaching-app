import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, Moon, Camera, Sparkles, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { formatDate, calcSleepHours, todayISO } from '../lib/utils'
import { Modal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { Spinner } from '../components/ui/Spinner'
import type { SchlafEntry } from '../types/database'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="card !p-3 text-xs">
      <div className="text-text-muted mb-1">{label}</div>
      <div className="text-text-primary font-bold">{payload[0]?.value}h</div>
    </div>
  )
}

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
  const [form, setForm] = useState({ datum: todayISO(), einschlafzeit: '23:00', aufwachzeit: '07:00', schlafqualitaet: '7', notizen: '' })

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
    setSaving(true)
    await supabase.from('schlaf').upsert({
      user_id: user.id,
      datum: form.datum,
      einschlafzeit: form.einschlafzeit,
      aufwachzeit: form.aufwachzeit,
      schlafqualitaet: form.schlafqualitaet ? parseInt(form.schlafqualitaet) : null,
      notizen: form.notizen || null,
    }, { onConflict: 'user_id,datum' })
    await load()
    setOpen(false)
    setPhotoPreview(null)
    setForm({ datum: todayISO(), einschlafzeit: '23:00', aufwachzeit: '07:00', schlafqualitaet: '7', notizen: '' })
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
      <div className="grid grid-cols-3 gap-4">
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
                      <td className="py-2.5 px-3 text-right">
                        <button onClick={() => handleDelete(e.id)} aria-label={`Eintrag vom ${formatDate(e.datum)} löschen`} className="p-1.5 rounded hover:bg-danger/10 hover:text-danger text-text-muted transition-colors">
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
            <label className="label">Notizen (optional)</label>
            <input type="text" className="input" placeholder="Wie hast du geschlafen?" value={form.notizen} onChange={e => setForm(f => ({ ...f, notizen: e.target.value }))} />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setOpen(false)} className="btn-secondary flex-1">Abbrechen</button>
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
