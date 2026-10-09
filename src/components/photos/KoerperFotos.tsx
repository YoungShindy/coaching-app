import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeftRight, Camera, ImagePlus, Lock, Trash2, X } from 'lucide-react'
import { Sheet } from '../ui/Sheet'
import { Spinner } from '../ui/Spinner'
import { cn } from '../../lib/utils'
import { todayISO, formatDate } from '../../lib/utils'
import {
  PHOTO_LABEL_SUGGESTIONS, compare, daysBetween, deleteBodyPhoto, loadBodyPhotos, uploadBodyPhoto,
  type BodyPhoto, type CompareSpan,
} from '../../lib/koerperfotos'

const SPANS: { key: CompareSpan; label: string }[] = [
  { key: 30, label: '30 Tage' }, { key: 60, label: '60 Tage' }, { key: 90, label: '90 Tage' },
  { key: 'start', label: 'Start' }, { key: 'custom', label: 'Datum' },
]

function ago(days: number): string {
  if (days <= 0) return 'heute'
  if (days === 1) return 'gestern'
  if (days < 100) return `vor ${days} Tagen`
  const m = Math.round(days / 30.4)
  return `vor ${m} Monaten`
}

const kg = (n: number) => `${n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`
const signedKg = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`

/** Bild, das beim Laden weich einblendet. */
function Photo({ p, className, onClick }: { p: BodyPhoto; className?: string; onClick?: () => void }) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  return (
    <button
      type="button" onClick={onClick} disabled={!onClick}
      className={cn('relative overflow-hidden bg-bg-elevated block w-full', className)}
      aria-label={`Foto ${p.label} vom ${formatDate(p.datum)} vergrößern`}
    >
      {!failed && p.url && (
        <img
          src={p.url} alt="" loading="lazy" onLoad={() => setLoaded(true)} onError={() => setFailed(true)}
          className={cn('w-full h-full object-cover transition-opacity duration-500', loaded ? 'opacity-100' : 'opacity-0')}
        />
      )}
      {(failed || !p.url) && <span className="absolute inset-0 flex items-center justify-center text-text-muted"><Camera size={22} aria-hidden="true" /></span>}
    </button>
  )
}

// ─── Foto hinzufügen ──────────────────────────────────────────────────────────

export function AddPhotoSheet({ open, onClose, userId, labels, defaultLabel, onSaved }: {
  open: boolean
  onClose: () => void
  userId: string
  labels: string[]
  defaultLabel?: string
  onSaved: (label: string) => void
}) {
  const [datum, setDatum] = useState(todayISO())
  const [label, setLabel] = useState(defaultLabel ?? PHOTO_LABEL_SUGGESTIONS[0])
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const camRef = useRef<HTMLInputElement>(null)
  const galRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setDatum(todayISO()); setLabel(defaultLabel ?? PHOTO_LABEL_SUGGESTIONS[0]); setFile(null); setPreview(null); setError('')
  }, [open, defaultLabel])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const choices = useMemo(() => Array.from(new Set([...PHOTO_LABEL_SUGGESTIONS, ...labels])), [labels])

  function pick(f: File | undefined) {
    if (!f) return
    setFile(f); setError('')
    setPreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f) })
  }

  async function save() {
    if (!file) { setError('Wähle zuerst ein Foto aus.'); return }
    if (!label.trim()) { setError('Gib dem Foto eine Beschriftung, z. B. „Vorne“.'); return }
    setSaving(true); setError('')
    const res = await uploadBodyPhoto(userId, file, datum, label.trim())
    setSaving(false)
    if (res.ok) { onSaved(label.trim()); onClose(); return }
    setError(res.reason === 'table'
      ? 'Die Datenbank ist noch nicht auf Körperfotos vorbereitet. Bitte das Datenbank-Update einspielen.'
      : res.reason === 'upload' ? 'Das Foto konnte nicht hochgeladen werden. Prüfe deine Verbindung und versuche es noch einmal.'
      : 'Das Foto wurde hochgeladen, aber nicht gespeichert. Bitte versuche es noch einmal.')
  }

  return (
    <Sheet open={open} onClose={onClose} title="Körperfoto hinzufügen">
      <div className="space-y-5 pb-4">
        <div>
          <span className="label">Foto</span>
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={e => pick(e.target.files?.[0])} />
          <input ref={galRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={e => pick(e.target.files?.[0])} />
          {preview ? (
            <div className="relative w-40 aspect-[3/4] rounded-2xl overflow-hidden border border-border">
              <img src={preview} alt="Vorschau des gewählten Fotos" className="w-full h-full object-cover" />
              <button onClick={() => { setFile(null); setPreview(null) }} className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white" aria-label="Foto entfernen"><X size={14} /></button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => camRef.current?.click()} className="rounded-2xl border border-dashed border-brand/50 bg-brand/5 py-5 flex flex-col items-center gap-1.5 text-brand font-semibold text-sm active:scale-[0.97] transition-transform">
                <Camera size={22} aria-hidden="true" /> Kamera
              </button>
              <button onClick={() => galRef.current?.click()} className="rounded-2xl border border-dashed border-border bg-bg-elevated py-5 flex flex-col items-center gap-1.5 text-text-secondary font-semibold text-sm active:scale-[0.97] transition-transform">
                <ImagePlus size={22} aria-hidden="true" /> Aus Fotos
              </button>
            </div>
          )}
        </div>

        <div>
          <span className="label">Beschriftung</span>
          <div className="flex flex-wrap gap-2 mb-2" role="group" aria-label="Beschriftung wählen">
            {choices.map(c => (
              <button
                key={c} aria-pressed={label === c} onClick={() => setLabel(c)}
                className={cn('px-3 py-1.5 rounded-full text-sm font-semibold border transition-all active:scale-95',
                  label === c ? 'bg-primary border-brand text-white' : 'border-border text-text-secondary hover:border-brand/40')}
              >{c}</button>
            ))}
          </div>
          <label className="sr-only" htmlFor="photo-label">Eigene Beschriftung</label>
          <input id="photo-label" className="input" maxLength={30} placeholder="Eigene Beschriftung, z. B. Bizeps-Pose" value={label} onChange={e => setLabel(e.target.value)} />
          <p className="text-xs text-text-muted mt-1.5">Fotos mit gleicher Beschriftung werden miteinander verglichen. Nimm sie am besten immer ähnlich auf.</p>
        </div>

        <div>
          <label className="label" htmlFor="photo-date">Datum</label>
          <input id="photo-date" type="date" className="input" value={datum} max={todayISO()} onChange={e => setDatum(e.target.value)} />
        </div>

        {error && <p role="alert" className="text-sm text-danger">{error}</p>}

        <button onClick={save} disabled={saving} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
          {saving ? <Spinner size={16} /> : <Camera size={18} aria-hidden="true" />} {saving ? 'Speichere …' : 'Foto speichern'}
        </button>
        <p className="text-xs text-text-muted text-center">Deine Fotos sind privat. Dein Coach sieht sie nur, wenn du sie in den Einstellungen freigibst.</p>
      </div>
    </Sheet>
  )
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export function KoerperFotos({ userId, readOnly = false, consent = true, className }: {
  userId: string
  /** Coach-Ansicht: nur ansehen */
  readOnly?: boolean
  /** Nur für den Coach: hat der Klient die Fotos freigegeben? */
  consent?: boolean
  className?: string
}) {
  const [photos, setPhotos] = useState<BodyPhoto[] | null>(null)
  const [label, setLabel] = useState<string | null>(null)
  const [span, setSpan] = useState<CompareSpan>(30)
  const [customDate, setCustomDate] = useState<string>('')
  const [adding, setAdding] = useState(false)
  const [lightbox, setLightbox] = useState<BodyPhoto | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  const reload = useCallback(async () => { setPhotos(await loadBodyPhotos(userId)) }, [userId])
  useEffect(() => { if (readOnly && !consent) { setPhotos([]); return } void reload() }, [reload, readOnly, consent])

  const labels = useMemo(() => {
    const count = new Map<string, number>()
    for (const p of photos ?? []) count.set(p.label, (count.get(p.label) ?? 0) + 1)
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l)
  }, [photos])
  const active = label && labels.includes(label) ? label : labels[0] ?? null

  const cmp = useMemo(() => (photos && active ? compare(photos, active, span, customDate || undefined) : null), [photos, active, span, customDate])
  const today = todayISO()

  // Beim Wechsel auf „Datum“ sinnvoll vorbelegen: 30 Tage vor dem neuesten Foto
  useEffect(() => {
    if (span === 'custom' && !customDate && cmp?.before) setCustomDate(cmp.before.datum)
  }, [span, customDate, cmp])

  async function remove(p: BodyPhoto) {
    setConfirmDel(null)
    setPhotos(prev => (prev ? prev.filter(x => x.id !== p.id) : prev))
    setLightbox(null)
    await deleteBodyPhoto(p)
  }

  if (readOnly && !consent) {
    return (
      <div className={cn('card flex items-center gap-3 text-sm text-text-secondary', className)}>
        <Lock size={18} className="text-text-muted shrink-0" aria-hidden="true" />
        <span>Körperfotos sind nicht freigegeben. Der Klient kann das in den Einstellungen erlauben.</span>
      </div>
    )
  }

  if (!photos) return <div className="flex justify-center py-16"><Spinner size={32} /></div>

  const grouped = Array.from(photos.reduce((m, p) => m.set(p.datum, [...(m.get(p.datum) ?? []), p]), new Map<string, BodyPhoto[]>()).entries())

  return (
    <div className={cn('space-y-5', className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="section-title">Körperfotos</h2>
        {!readOnly && (
          <button onClick={() => setAdding(true)} className="btn-primary !px-4 !py-2 text-sm flex items-center gap-2">
            <Camera size={16} aria-hidden="true" /> Foto hinzufügen
          </button>
        )}
      </div>

      {photos.length === 0 ? (
        <div className="card text-center py-12 space-y-2">
          <Camera size={34} className="text-text-muted mx-auto" aria-hidden="true" />
          <p className="font-semibold text-text-primary">Noch keine Körperfotos</p>
          <p className="text-sm text-text-secondary max-w-xs mx-auto">
            {readOnly ? 'Der Klient hat noch keine Fotos hochgeladen.' : 'Mach alle paar Wochen ein Foto. So siehst du heute vs. vor 30 Tagen nebeneinander.'}
          </p>
        </div>
      ) : (
        <>
          <div className="card space-y-4 enter" style={{ '--d': 40 } as React.CSSProperties}>
            <div className="flex items-center gap-2">
              <ArrowLeftRight size={16} className="text-brand" aria-hidden="true" />
              <h3 className="font-semibold text-text-primary">Vorher und Nachher</h3>
            </div>

            {labels.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none" role="group" aria-label="Pose wählen">
                {labels.map(l => (
                  <button
                    key={l} aria-pressed={active === l} onClick={() => setLabel(l)}
                    className={cn('px-3 py-1.5 rounded-full text-sm font-semibold border whitespace-nowrap shrink-0 transition-all active:scale-95',
                      active === l ? 'bg-primary border-brand text-white' : 'border-border text-text-secondary hover:border-brand/40')}
                  >{l}</button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Abstand zum Vergleichsfoto">
              {SPANS.map(s => (
                <button
                  key={String(s.key)} aria-pressed={span === s.key} onClick={() => setSpan(s.key)}
                  className={cn('px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition-all active:scale-95',
                    span === s.key ? 'bg-brand/15 border-brand/50 text-brand' : 'border-border text-text-muted hover:border-brand/40')}
                >{s.label}</button>
              ))}
            </div>
            {span === 'custom' && (
              <div>
                <label className="label !text-xs" htmlFor="cmp-date">Vorher-Foto am oder um den</label>
                <input id="cmp-date" type="date" className="input !w-auto" value={customDate} max={cmp?.now.datum} onChange={e => setCustomDate(e.target.value)} />
              </div>
            )}

            {cmp && (
              <div key={`${active}-${span}-${customDate}`} className="max-w-lg mx-auto w-full">
                <div className="grid grid-cols-2 gap-3">
                  {/* Vorher */}
                  <figure className="space-y-2 m-0">
                    {cmp.before ? (
                      <>
                        <Photo p={cmp.before} onClick={() => setLightbox(cmp.before)} className="aspect-[3/4] rounded-2xl border border-border enter" />
                        <figcaption className="text-center">
                          <div className="text-xs font-bold text-text-secondary uppercase tracking-wide">Vorher</div>
                          <div className="text-sm font-semibold text-text-primary">{formatDate(cmp.before.datum)}</div>
                          <div className="text-xs text-text-muted">{ago(daysBetween(today, cmp.before.datum))}{cmp.before.weightKg != null && ` · ${kg(cmp.before.weightKg)}`}</div>
                        </figcaption>
                      </>
                    ) : (
                      <div className="aspect-[3/4] rounded-2xl border border-dashed border-border flex items-center justify-center text-center p-3">
                        <p className="text-xs text-text-muted">Noch kein älteres Foto mit „{cmp.now.label}“ zum Vergleichen.</p>
                      </div>
                    )}
                  </figure>
                  {/* Aktuell */}
                  <figure className="space-y-2 m-0">
                    <Photo p={cmp.now} onClick={() => setLightbox(cmp.now)} className="aspect-[3/4] rounded-2xl border-2 border-brand/40 enter" />
                    <figcaption className="text-center">
                      <div className="text-xs font-bold text-brand uppercase tracking-wide">{cmp.now.datum === today ? 'Heute' : 'Aktuell'}</div>
                      <div className="text-sm font-semibold text-text-primary">{formatDate(cmp.now.datum)}</div>
                      <div className="text-xs text-text-muted">{ago(daysBetween(today, cmp.now.datum))}{cmp.now.weightKg != null && ` · ${kg(cmp.now.weightKg)}`}</div>
                    </figcaption>
                  </figure>
                </div>

                {cmp.before && (
                  <p className="text-sm text-text-secondary text-center mt-3" aria-live="polite">
                    <strong className="text-text-primary">{cmp.gapDays} Tage</strong> dazwischen
                    {cmp.before.weightKg != null && cmp.now.weightKg != null && <> · Gewicht <strong className="text-text-primary">{signedKg(cmp.now.weightKg - cmp.before.weightKg)}</strong></>}
                    {cmp.approximate && cmp.wanted > 0 && <span className="block text-xs text-text-muted mt-1">Genau {cmp.wanted} Tage davor gibt es kein Foto, hier siehst du das nächstgelegene.</span>}
                  </p>
                )}
                {cmp.now.datum !== today && !readOnly && daysBetween(today, cmp.now.datum) >= 7 && (
                  <p className="text-xs text-text-muted text-center mt-2">Dein letztes Foto ist {ago(daysBetween(today, cmp.now.datum))}. Zeit für ein neues?</p>
                )}
              </div>
            )}
          </div>

          <div className="card space-y-4 enter" style={{ '--d': 110 } as React.CSSProperties}>
            <h3 className="font-semibold text-text-primary">Alle Fotos ({photos.length})</h3>
            {grouped.map(([datum, list]) => (
              <div key={datum}>
                <div className="text-xs font-semibold text-text-secondary mb-2">{formatDate(datum, 'EEEE, dd. MMMM yyyy')}</div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {list.map(p => (
                    <div key={p.id} className="space-y-1">
                      <Photo p={p} onClick={() => setLightbox(p)} className="aspect-[3/4] rounded-xl border border-border hover:border-brand transition-colors" />
                      <div className="text-[11px] text-center font-semibold text-text-secondary truncate">{p.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Großansicht */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4 gap-4 fade-in" role="dialog" aria-modal="true" aria-label={`Foto ${lightbox.label}`} onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 p-2.5 rounded-full bg-white/15 text-white" aria-label="Schließen" onClick={() => setLightbox(null)}><X size={20} /></button>
          {lightbox.url && <img src={lightbox.url} alt={`${lightbox.label} vom ${formatDate(lightbox.datum)}`} className="max-w-full max-h-[75dvh] object-contain rounded-2xl modal-in" onClick={e => e.stopPropagation()} />}
          <div className="text-white text-center" onClick={e => e.stopPropagation()}>
            <div className="font-semibold">{lightbox.label} · {formatDate(lightbox.datum)}</div>
            <div className="text-sm text-white/70">{ago(daysBetween(today, lightbox.datum))}{lightbox.weightKg != null && ` · ${kg(lightbox.weightKg)}`}</div>
            <div className="flex gap-2 justify-center mt-3">
              {cmp && lightbox.label === cmp.now.label && lightbox.id !== cmp.now.id && (
                <button className="px-4 py-2 rounded-full bg-white/15 text-white text-sm font-semibold" onClick={() => { setSpan('custom'); setCustomDate(lightbox.datum); setLightbox(null) }}>Als „Vorher“ verwenden</button>
              )}
              {!readOnly && (
                confirmDel === lightbox.id
                  ? <button className="px-4 py-2 rounded-full bg-danger text-bg text-sm font-semibold" onClick={() => remove(lightbox)}>Wirklich löschen</button>
                  : <button className="px-4 py-2 rounded-full bg-white/15 text-white text-sm font-semibold flex items-center gap-1.5" onClick={() => setConfirmDel(lightbox.id)}><Trash2 size={14} aria-hidden="true" /> Löschen</button>
              )}
            </div>
          </div>
        </div>
      )}

      {!readOnly && (
        <AddPhotoSheet
          open={adding} onClose={() => setAdding(false)} userId={userId} labels={labels} defaultLabel={active ?? undefined}
          onSaved={l => { setLabel(l); void reload() }}
        />
      )}
    </div>
  )
}
