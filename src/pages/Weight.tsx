import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, Scale, Camera, X, Images } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { formatDate, todayISO } from '../lib/utils'
import { Modal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { Spinner } from '../components/ui/Spinner'
import { KoerperFotos } from '../components/photos/KoerperFotos'
import { SegmentTabs } from '../components/ui/SegmentTabs'
import { PHOTO_LABEL_SUGGESTIONS, uploadBodyPhoto } from '../lib/koerperfotos'
import type { GewichtEntry } from '../types/database'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="card !p-3 text-xs">
      <div className="text-text-muted mb-1">{label}</div>
      <div className="text-text-primary font-bold">{payload[0]?.value} kg</div>
    </div>
  )
}

export function Weight() {
  const { user } = useAuth()
  const { colors } = useTheme()
  const [entries, setEntries] = useState<GewichtEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [targetWeight, setTargetWeight] = useState<number | null>(null)
  const [form, setForm] = useState({ datum: todayISO(), gewicht: '', notizen: '' })
  const [saving, setSaving] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoLabel, setPhotoLabel] = useState(PHOTO_LABEL_SUGGESTIONS[0])
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [tab, setTab] = useState<'log' | 'fotos'>('log')
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    if (!user) return
    const [entriesRes, settingsRes] = await Promise.all([
      supabase.from('gewicht').select('*').eq('user_id', user.id).order('datum', { ascending: true }),
      supabase.from('client_settings').select('zielgewicht').eq('user_id', user.id).single(),
    ])
    setEntries((entriesRes.data ?? []) as GewichtEntry[])
    setTargetWeight(settingsRes.data?.zielgewicht ?? null)
    setLoading(false)
  }

  useEffect(() => { load() }, [user])

  function handlePhotoSelect(file: File) {
    setPhotoFile(file)
    const reader = new FileReader()
    reader.onload = () => setPhotoPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  async function uploadPhoto(entryId: string, file: File): Promise<string | null> {
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${user!.id}/${entryId}.${ext}`
    const { error } = await supabase.storage.from('body-photos').upload(path, file, { upsert: true })
    if (error) return null
    const { data } = supabase.storage.from('body-photos').getPublicUrl(path)
    return data.publicUrl
  }

  async function handleSave() {
    if (!user || !form.gewicht) return
    setSaving(true)
    const val = parseFloat(form.gewicht)
    const { data } = await supabase.from('gewicht').upsert({
      user_id: user.id,
      datum: form.datum,
      gewicht: val,
      notizen: form.notizen || null,
    }, { onConflict: 'user_id,datum' }).select().single()

    if (data && photoFile) {
      setUploadingPhoto(true)
      const res = await uploadBodyPhoto(user.id, photoFile, form.datum, photoLabel)
      if (!res.ok && res.reason === 'table') {
        // Datenbank noch ohne Körperfoto-Tabelle: altes Verfahren (ein Foto je Gewichtseintrag)
        const url = await uploadPhoto(data.id, photoFile)
        if (url) await supabase.from('gewicht').update({ foto_url: url } as any).eq('id', data.id)
      }
      setUploadingPhoto(false)
    }

    await load()
    setOpen(false)
    setForm({ datum: todayISO(), gewicht: '', notizen: '' })
    setPhotoFile(null)
    setPhotoPreview(null)
    setSaving(false)
  }

  async function handleDelete(id: string) {
    // Delete photo from storage if exists
    const entry = entries.find(e => e.id === id)
    if (entry?.foto_url) {
      const path = entry.foto_url.split('/body-photos/')[1]
      if (path) await supabase.storage.from('body-photos').remove([path])
    }
    await supabase.from('gewicht').delete().eq('id', id)
    setEntries(e => e.filter(x => x.id !== id))
  }

  const chartData = entries.map(e => ({
    datum: formatDate(e.datum, 'dd.MM'),
    gewicht: e.gewicht,
  }))

  const currentWeight = entries.at(-1)?.gewicht
  const startWeight = entries[0]?.gewicht
  const change = currentWeight && startWeight ? currentWeight - startWeight : null
  const domainMin = entries.length ? Math.min(...entries.map(e => e.gewicht)) - 2 : 50
  const domainMax = entries.length ? Math.max(...entries.map(e => e.gewicht)) + 2 : 100

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title text-2xl">Gewicht</h1>
          <p className="text-text-secondary text-sm mt-0.5">Tägliches Gewichtstracking</p>
        </div>
        <button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Eintragen
        </button>
      </div>

      {/* Reiter: Einträge / Körperfotos */}
      <SegmentTabs
        tabs={[{ key: 'log', label: 'Einträge' }, { key: 'fotos', label: 'Körperfotos' }]}
        value={tab} onChange={k => setTab(k as 'log' | 'fotos')} label="Gewicht oder Körperfotos"
      />

      {tab === 'log' && (
        <>
      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Aktuell', value: currentWeight ? `${currentWeight} kg` : '--' },
          { label: 'Start', value: startWeight ? `${startWeight} kg` : '--' },
          { label: 'Veränderung', value: change !== null ? `${change > 0 ? '+' : ''}${change.toFixed(1)} kg` : '--' },
          { label: 'Ziel', value: targetWeight ? `${targetWeight} kg` : '--' },
        ].map(s => (
          <div key={s.label} className="card text-center">
            <div className="text-xl font-bold text-text-primary">{s.value}</div>
            <div className="text-xs text-text-muted mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      {entries.length > 1 && (
        <div className="card">
          <h2 className="section-title mb-6">Gewichtsverlauf</h2>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="wGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors.brand} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={colors.brand} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
              <XAxis dataKey="datum" tick={{ fill: colors.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: colors.tick, fontSize: 11 }} axisLine={false} tickLine={false} domain={[domainMin, domainMax]} />
              <Tooltip content={<CustomTooltip />} />
              {targetWeight && (
                <ReferenceLine y={targetWeight} stroke={colors.success} strokeDasharray="6 3" label={{ value: 'Ziel', fill: colors.success, fontSize: 11 }} />
              )}
              <Area isAnimationActive={false} type="monotone" dataKey="gewicht" stroke={colors.brand} strokeWidth={2.5} fill="url(#wGrad)" dot={{ fill: colors.brand, r: 3 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

        </>
      )}

      {/* Log Tab */}
      {tab === 'log' && (
        <div className="card">
          {loading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : entries.length === 0 ? (
            <EmptyState icon={Scale} title="Noch keine Einträge" description="Trage täglich dein Gewicht ein um deinen Fortschritt zu verfolgen." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-text-muted font-medium">Datum</th>
                    <th className="text-right py-2 px-3 text-text-muted font-medium">Gewicht</th>
                    <th className="text-right py-2 px-3 text-text-muted font-medium">Veränderung</th>
                    <th className="text-left py-2 px-3 text-text-muted font-medium">Notizen</th>
                    <th className="text-center py-2 px-3 text-text-muted font-medium">Foto</th>
                    <th className="py-2 px-3" />
                  </tr>
                </thead>
                <tbody>
                  {[...entries].reverse().map((e, i, arr) => {
                    const prev = arr[i + 1]
                    const diff = prev ? e.gewicht - prev.gewicht : null
                    return (
                      <tr key={e.id} className="border-b border-border/50 hover:bg-bg-elevated/50 transition-colors">
                        <td className="py-2.5 px-3 text-text-secondary">{formatDate(e.datum)}</td>
                        <td className="py-2.5 px-3 text-right font-semibold text-text-primary">{e.gewicht} kg</td>
                        <td className={`py-2.5 px-3 text-right text-xs font-medium ${diff === null ? 'text-text-muted' : diff < 0 ? 'text-success' : diff > 0 ? 'text-danger' : 'text-text-muted'}`}>
                          {diff !== null ? `${diff > 0 ? '+' : ''}${diff.toFixed(1)} kg` : '--'}
                        </td>
                        <td className="py-2.5 px-3 text-text-muted max-w-[120px] truncate">{e.notizen ?? '--'}</td>
                        <td className="py-2.5 px-3 text-center">
                          {e.foto_url ? (
                            <button onClick={() => setLightboxUrl(e.foto_url!)}
                              className="w-8 h-8 rounded-lg overflow-hidden border border-border hover:border-brand transition-colors inline-block">
                              <img src={e.foto_url} alt="" className="w-full h-full object-cover" />
                            </button>
                          ) : <span className="text-text-muted text-xs">–</span>}
                        </td>
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
      )}

      {/* Fotos Tab */}
      {tab === 'fotos' && user && <KoerperFotos userId={user.id} />}

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setLightboxUrl(null)}>
          <button className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white"><X size={20} /></button>
          <img src={lightboxUrl} alt="" className="max-w-full max-h-full object-contain rounded-xl" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Add entry modal */}
      <Modal open={open} onClose={() => { setOpen(false); setPhotoFile(null); setPhotoPreview(null) }} title="Gewicht eintragen">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Datum</label>
              <input type="date" className="input" value={form.datum} onChange={e => setForm(f => ({ ...f, datum: e.target.value }))} />
            </div>
            <div>
              <label className="label">Gewicht (kg)</label>
              <input type="number" step="0.1" className="input" placeholder="75.5" value={form.gewicht} onChange={e => setForm(f => ({ ...f, gewicht: e.target.value }))} autoFocus />
            </div>
          </div>
          <div>
            <label className="label">Notizen (optional)</label>
            <input type="text" className="input" placeholder="Z.B. nach dem Sport" value={form.notizen} onChange={e => setForm(f => ({ ...f, notizen: e.target.value }))} />
          </div>

          {/* Photo upload */}
          <div>
            <label className="label flex items-center gap-1.5"><Camera size={13} /> Körperfoto (optional)</label>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoSelect(f) }} />
            {photoPreview ? (
              <div className="relative">
                <img src={photoPreview} alt="Vorschau" className="w-full h-40 object-cover rounded-xl border border-border" />
                <button onClick={() => { setPhotoFile(null); setPhotoPreview(null) }}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-danger/80 transition-colors">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-border hover:border-brand/50 hover:bg-brand/5 transition-colors text-sm text-text-muted">
                <Camera size={16} /> Foto aufnehmen oder auswählen
              </button>
            )}
            {photoPreview && (
              <div className="mt-3">
                <label className="label !text-xs" htmlFor="weight-photo-label">Beschriftung</label>
                <div className="flex flex-wrap gap-1.5 mb-2" role="group" aria-label="Beschriftung wählen">
                  {PHOTO_LABEL_SUGGESTIONS.map(l => (
                    <button key={l} type="button" aria-pressed={photoLabel === l} onClick={() => setPhotoLabel(l)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${photoLabel === l ? 'bg-primary border-brand text-white' : 'border-border text-text-secondary'}`}>{l}</button>
                  ))}
                </div>
                <input id="weight-photo-label" className="input !py-2 text-sm" maxLength={30} value={photoLabel} onChange={e => setPhotoLabel(e.target.value)} />
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={() => { setOpen(false); setPhotoFile(null); setPhotoPreview(null) }} className="btn-secondary flex-1">Abbrechen</button>
            <button onClick={handleSave} className="btn-primary flex-1 flex items-center justify-center gap-2" disabled={saving || !form.gewicht}>
              {(saving || uploadingPhoto) && <Spinner size={16} />}
              {uploadingPhoto ? 'Foto hochladen…' : saving ? 'Speichern…' : 'Speichern'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
