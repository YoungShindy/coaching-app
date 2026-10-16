// @ts-nocheck
// Übernommen aus dem Redesign-Paket. Typen und lokale Namen werden schrittweise verbessert.
import { supabase } from '../lib/supabase'
import { compressImage } from '../lib/images'
import { isMissingTable } from '../lib/dbErrors'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn, formatDate, todayISO } from '../lib/utils'
import { ArrowLeftRight, Camera, ImagePlus, Lock, Plus, Scale, Trash2, X } from 'lucide-react'
import { BottomSheet } from '../components/ui/BottomSheet'
import { Spinner } from '../components/ui/Spinner'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { SegmentedTabs } from '../components/ui/SegmentedTabs'
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { EmptyState } from '../components/ui/EmptyState'
import { Modal } from '../components/ui/Modal'
import { PhotoSourceButtons } from '../components/PhotoCapture'

export const MS_PER_DAY = 864e5
export const dayNumber = (dateISO) => Math.round(Date.parse(`${dateISO}T00:00:00Z`) / MS_PER_DAY)
export const daysBetween = (dateA, dateB) => dayNumber(dateA) - dayNumber(dateB)
export function addDays(dateISO, dayCount) {
  return new Date(Date.parse(`${dateISO}T00:00:00Z`) + dayCount * MS_PER_DAY).toISOString().slice(0, 10)
}
export function findComparison(allPhotos, wantedLabel, wantedRange, customDate) {
  let sameLabel = allPhotos.filter((photoItem) => photoItem.label === wantedLabel)
  if (!sameLabel.length) return null
  let latest = sameLabel[0],
    older = sameLabel.filter((photoItem) => photoItem.id !== latest.id && photoItem.datum < latest.datum)
  if (!older.length)
    return {
      now: latest,
      before: null,
      gapDays: 0,
      wanted: wantedRange === 'custom' || wantedRange === 'start' ? -1 : wantedRange,
      approximate: false,
    }
  if (wantedRange === 'start') {
    let oldest = older[older.length - 1]
    return {
      now: latest,
      before: oldest,
      gapDays: daysBetween(latest.datum, oldest.datum),
      wanted: -1,
      approximate: false,
    }
  }
  let targetDate = wantedRange === 'custom' && customDate ? customDate : addDays(latest.datum, -(wantedRange === 'custom' ? 30 : wantedRange)),
    closest = older[0]
  for (let candidate of older) Math.abs(daysBetween(candidate.datum, targetDate)) < Math.abs(daysBetween(closest.datum, targetDate)) && (closest = candidate)
  let wantedDays = wantedRange === 'custom' ? daysBetween(latest.datum, targetDate) : wantedRange
  return {
    now: latest,
    before: closest,
    gapDays: daysBetween(latest.datum, closest.datum),
    wanted: wantedDays,
    approximate: Math.abs(daysBetween(closest.datum, targetDate)) > 7,
  }
}
export const PHOTO_BUCKET = 'body-photos'
export const DEFAULT_LABELS = ['Vorne', 'Seite', 'Rücken']
export const LEGACY_LABEL = 'Foto'
export function pathFromUrl(photoUrl) {
  let bucketPos = photoUrl.indexOf(`/${PHOTO_BUCKET}/`)
  return bucketPos < 0 ? null : decodeURIComponent(photoUrl.slice(bucketPos + 11 + 2).split('?')[0])
}
export async function signedUrlMap(paths) {
  let urlMap = new Map()
  if (!paths.length) return urlMap
  try {
    let { data: signed } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600)
    for (let entry of signed ?? []) entry.path && entry.signedUrl && urlMap.set(entry.path, entry.signedUrl)
  } catch {}
  for (let filePath of paths) urlMap.has(filePath) || urlMap.set(filePath, supabase.storage.from(PHOTO_BUCKET).getPublicUrl(filePath).data.publicUrl)
  return urlMap
}
export async function loadPhotos(ownerId) {
  let [photoResult, weightResult] = await Promise.all([
      supabase.from('koerperfotos').select('*').eq('user_id', ownerId).order('datum', {
        ascending: false,
      }),
      supabase.from('gewicht').select('id, datum, gewicht, foto_url').eq('user_id', ownerId).order('datum', {
        ascending: true,
      }),
    ]),
    weights = weightResult.data ?? [],
    weightOn = (day) => {
      let found = null
      for (let entry of weights)
        if (entry.datum <= day) found = entry.gewicht
        else break
      return found
    },
    photoList = (photoResult.error ? [] : (photoResult.data ?? [])).map((photoRow) => ({
      id: photoRow.id,
      datum: photoRow.datum,
      label: photoRow.label || 'Foto',
      path: photoRow.pfad,
      url: null,
      weightKg: weightOn(photoRow.datum),
    })),
    knownPaths = new Set(photoList.map((photoItem) => photoItem.path))
  for (let weightRow of weights) {
    if (!weightRow.foto_url) continue
    let legacyPath = pathFromUrl(weightRow.foto_url)
    ;(legacyPath && knownPaths.has(legacyPath)) ||
      photoList.push({
        id: `legacy-${weightRow.id}`,
        datum: weightRow.datum,
        label: LEGACY_LABEL,
        path: legacyPath,
        url: legacyPath ? null : weightRow.foto_url,
        legacyWeightId: weightRow.id,
        weightKg: weightRow.gewicht,
      })
  }
  let urls = await signedUrlMap(photoList.filter((photoItem) => photoItem.path).map((photoItem) => photoItem.path))
  for (let photoItem of photoList) photoItem.path && (photoItem.url = urls.get(photoItem.path) ?? null)
  return photoList.sort((photoA, photoB) => photoB.datum.localeCompare(photoA.datum) || photoA.label.localeCompare(photoB.label, 'de'))
}
export async function uploadPhoto(ownerId, file, day, photoText) {
  let compressed = await compressImage(file),
    filePath = `${ownerId}/${day}-${Date.now()}.jpg`
  if (
    (
      await supabase.storage.from('body-photos').upload(filePath, compressed, {
        contentType: 'image/jpeg',
        upsert: false,
      })
    ).error
  )
    return {
      ok: false,
      reason: 'upload',
    }
  let insertResult = await supabase
    .from('koerperfotos')
    .insert({
      user_id: ownerId,
      datum: day,
      pfad: filePath,
      label: photoText.trim() || 'Foto',
    })
    .select('id')
    .single()
  return insertResult.error || !insertResult.data
    ? (await supabase.storage.from(PHOTO_BUCKET).remove([filePath]),
      {
        ok: false,
        reason: isMissingTable(insertResult.error) ? 'table' : 'save',
      })
    : {
        ok: true,
        photo: {
          id: insertResult.data.id,
          path: filePath,
        },
      }
}
export async function deletePhoto(photoItem) {
  ;(photoItem.path && (await supabase.storage.from(PHOTO_BUCKET).remove([photoItem.path])),
    photoItem.legacyWeightId
      ? await supabase
          .from('gewicht')
          .update({
            foto_url: null,
          })
          .eq('id', photoItem.legacyWeightId)
      : await supabase.from('koerperfotos').delete().eq('id', photoItem.id))
}
export const COMPARE_RANGES = [
  {
    key: 30,
    label: '30 Tage',
  },
  {
    key: 60,
    label: '60 Tage',
  },
  {
    key: 90,
    label: '90 Tage',
  },
  {
    key: 'start',
    label: 'Start',
  },
  {
    key: 'custom',
    label: 'Datum',
  },
]
export function agoText(daysAgo) {
  return daysAgo <= 0 ? 'heute' : daysAgo === 1 ? 'gestern' : daysAgo < 100 ? `vor ${daysAgo} Tagen` : `vor ${Math.round(daysAgo / 30.4)} Monaten`
}
export const formatKg = (kg) =>
  `${kg.toLocaleString('de-DE', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} kg`
export const formatDelta = (kgDelta) =>
  `${kgDelta > 0 ? '+' : kgDelta < 0 ? '−' : '±'}${Math.abs(kgDelta).toLocaleString('de-DE', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} kg`
export function AQ_({ p: photoItem, className: extraClass, onClick: onOpen }) {
  let [loaded, setLoaded] = useState(false),
    [failed, setFailed] = useState(false)
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!onOpen}
      className={cn('relative overflow-hidden bg-bg-elevated block w-full', extraClass)}
      aria-label={`Foto ${photoItem.label} vom ${formatDate(photoItem.datum)} vergrößern`}
    >
      {!failed && photoItem.url && (
        <img
          src={photoItem.url}
          alt=""
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn('w-full h-full object-cover transition-opacity duration-500', loaded ? 'opacity-100' : 'opacity-0')}
        />
      )}
      {(failed || !photoItem.url) && (
        <span className="absolute inset-0 flex items-center justify-center text-text-muted">
          <Camera size={22} aria-hidden="true" />
        </span>
      )}
    </button>
  )
}
export function OQ_({ open: isOpen, onClose: handleClose, userId: uid, labels: knownLabels, defaultLabel: presetLabel, onSaved: handleSaved }) {
  let [photoDate, setPhotoDate] = useState(todayISO()),
    [photoLabel, setPhotoLabel] = useState(presetLabel ?? DEFAULT_LABELS[0]),
    [file, setFile] = useState(null),
    [previewUrl, setPreviewUrl] = useState(null),
    [saving, setSaving] = useState(false),
    [errorText, setErrorText] = useState('')
  ;(useEffect(() => {
    isOpen && (setPhotoDate(todayISO()), setPhotoLabel(presetLabel ?? DEFAULT_LABELS[0]), setFile(null), setPreviewUrl(null), setErrorText(''))
  }, [isOpen, presetLabel]),
    useEffect(
      () => () => {
        previewUrl && URL.revokeObjectURL(previewUrl)
      },
      [previewUrl],
    ))
  let labelOptions = useMemo(() => Array.from(new Set([...DEFAULT_LABELS, ...knownLabels])), [knownLabels])
  function chooseFile(picked) {
    picked && (setFile(picked), setErrorText(''), setPreviewUrl((oldUrl) => (oldUrl && URL.revokeObjectURL(oldUrl), URL.createObjectURL(picked))))
  }
  async function savePhoto() {
    if (!file) {
      setErrorText('Wähle zuerst ein Foto aus.')
      return
    }
    if (!photoLabel.trim()) {
      setErrorText('Gib dem Foto eine Beschriftung, z. B. „Vorne“.')
      return
    }
    ;(setSaving(true), setErrorText(''))
    let saveResult = await uploadPhoto(uid, file, photoDate, photoLabel.trim())
    if ((setSaving(false), saveResult.ok)) {
      ;(handleSaved(photoLabel.trim()), handleClose())
      return
    }
    setErrorText(
      saveResult.reason === 'table'
        ? 'Die Datenbank ist noch nicht auf Körperfotos vorbereitet. Bitte das Datenbank-Update einspielen.'
        : saveResult.reason === 'upload'
          ? 'Das Foto konnte nicht hochgeladen werden. Prüfe deine Verbindung und versuche es noch einmal.'
          : 'Das Foto wurde hochgeladen, aber nicht gespeichert. Bitte versuche es noch einmal.',
    )
  }
  return (
    <BottomSheet open={isOpen} onClose={handleClose} title="Körperfoto hinzufügen">
      <div className="space-y-5 pb-4">
        <div>
          <span className="label">Foto</span>
          {previewUrl ? (
            <div className="relative w-40 aspect-[3/4] rounded-2xl overflow-hidden border border-border">
              <img src={previewUrl} alt="Vorschau des gewählten Fotos" className="w-full h-full object-cover" />
              <button
                onClick={() => {
                  ;(setFile(null), setPreviewUrl(null))
                }}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white"
                aria-label="Foto entfernen"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <PhotoSourceButtons onPick={chooseFile} />
          )}
        </div>
        <div>
          <span className="label">Beschriftung</span>
          <div className="flex flex-wrap gap-2 mb-2" role="group" aria-label="Beschriftung wählen">
            {labelOptions.map((labelOption) => (
              <button
                aria-pressed={photoLabel === labelOption}
                onClick={() => setPhotoLabel(labelOption)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm font-semibold border transition-all active:scale-95',
                  photoLabel === labelOption
                    ? 'bg-primary border-brand text-white'
                    : 'border-border text-text-secondary hover:border-brand/40',
                )}
                key={labelOption}
              >
                {labelOption}
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor="photo-label">
            Eigene Beschriftung
          </label>
          <input
            id="photo-label"
            className="input"
            maxLength={30}
            placeholder="Eigene Beschriftung, z. B. Bizeps-Pose"
            value={photoLabel}
            onChange={(event) => setPhotoLabel(event.target.value)}
          />
          <p className="text-xs text-text-muted mt-1.5">
            Fotos mit gleicher Beschriftung werden miteinander verglichen. Nimm sie am besten immer ähnlich auf.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="photo-date">
            Datum
          </label>
          <input
            id="photo-date"
            type="date"
            className="input"
            value={photoDate}
            max={todayISO()}
            onChange={(event) => setPhotoDate(event.target.value)}
          />
        </div>
        {errorText && (
          <p role="alert" className="text-sm text-danger">
            {errorText}
          </p>
        )}
        <button onClick={savePhoto} disabled={saving} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
          {saving ? <Spinner size={16} /> : <Camera size={18} aria-hidden="true" />} {saving ? 'Speichere …' : 'Foto speichern'}
        </button>
        <p className="text-xs text-text-muted text-center">
          Deine Fotos sind privat. Dein Coach sieht sie nur, wenn du sie in den Einstellungen freigibst.
        </p>
      </div>
    </BottomSheet>
  )
}
export function SQ_({ userId: uid, readOnly: viewOnly = false, consent: hasConsent = true, className: extraClass }) {
  let [photos, setPhotos] = useState(null),
    [chosenLabel, setChosenLabel] = useState(null),
    [range, setRange] = useState(30),
    [customStart, setCustomStart] = useState(''),
    [sheetOpen, setSheetOpen] = useState(false),
    [viewing, setViewing] = useState(null),
    [confirmDeleteId, setConfirmDeleteId] = useState(null),
    reload = useCallback(async () => {
      setPhotos(await loadPhotos(uid))
    }, [uid])
  useEffect(() => {
    if (viewOnly && !hasConsent) {
      setPhotos([])
      return
    }
    reload()
  }, [reload, viewOnly, hasConsent])
  let labelList = useMemo(() => {
      let counts = new Map()
      for (let photoItem of photos ?? []) counts.set(photoItem.label, (counts.get(photoItem.label) ?? 0) + 1)
      return [...counts.entries()].sort((entryA, entryB) => entryB[1] - entryA[1]).map(([entry]) => entry)
    }, [photos]),
    activeLabel = chosenLabel && labelList.includes(chosenLabel) ? chosenLabel : (labelList[0] ?? null),
    comparison = useMemo(() => (photos && activeLabel ? findComparison(photos, activeLabel, range, customStart || undefined) : null), [photos, activeLabel, range, customStart]),
    today = todayISO()
  useEffect(() => {
    range === 'custom' && !customStart && comparison?.before && setCustomStart(comparison.before.datum)
  }, [range, customStart, comparison])
  async function removePhoto(photoItem) {
    ;(setConfirmDeleteId(null), setPhotos((list) => list && list.filter((item) => item.id !== photoItem.id)), setViewing(null), await deletePhoto(photoItem))
  }
  if (viewOnly && !hasConsent)
    return (
      <div className={cn('card flex items-center gap-3 text-sm text-text-secondary', extraClass)}>
        <Lock size={18} className="text-text-muted shrink-0" aria-hidden="true" />
        <span>Körperfotos sind nicht freigegeben. Der Klient kann das in den Einstellungen erlauben.</span>
      </div>
    )
  if (!photos)
    return (
      <div className="flex justify-center py-16">
        <Spinner size={32} />
      </div>
    )
  let byDate = Array.from(photos.reduce((dateMap, photoItem) => dateMap.set(photoItem.datum, [...(dateMap.get(photoItem.datum) ?? []), photoItem]), new Map()).entries())
  return (
    <div className={cn('space-y-5', extraClass)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="section-title">Körperfotos</h2>
        {!viewOnly && (
          <button onClick={() => setSheetOpen(true)} className="btn-primary !px-4 !py-2 text-sm flex items-center gap-2">
            <Camera size={16} aria-hidden="true" /> Foto hinzufügen
          </button>
        )}
      </div>
      {photos.length === 0 ? (
        <div className="card text-center py-12 space-y-2">
          <Camera size={34} className="text-text-muted mx-auto" aria-hidden="true" />
          <p className="font-semibold text-text-primary">Noch keine Körperfotos</p>
          <p className="text-sm text-text-secondary max-w-xs mx-auto">
            {viewOnly
              ? 'Der Klient hat noch keine Fotos hochgeladen.'
              : 'Mach alle paar Wochen ein Foto. So siehst du heute vs. vor 30 Tagen nebeneinander.'}
          </p>
        </div>
      ) : (
        <>
          <div
            className="card space-y-4 enter"
            style={{
              '--d': 40,
            }}
          >
            <div className="flex items-center gap-2">
              <ArrowLeftRight size={16} className="text-brand" aria-hidden="true" />
              <h3 className="font-semibold text-text-primary">Vorher und Nachher</h3>
            </div>
            {labelList.length > 1 && (
              <div
                className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none"
                role="group"
                aria-label="Pose wählen"
              >
                {labelList.map((labelOption) => (
                  <button
                    aria-pressed={activeLabel === labelOption}
                    onClick={() => setChosenLabel(labelOption)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-sm font-semibold border whitespace-nowrap shrink-0 transition-all active:scale-95',
                      activeLabel === labelOption
                        ? 'bg-primary border-brand text-white'
                        : 'border-border text-text-secondary hover:border-brand/40',
                    )}
                    key={labelOption}
                  >
                    {labelOption}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Abstand zum Vergleichsfoto">
              {COMPARE_RANGES.map((rangeOption) => (
                <button
                  aria-pressed={range === rangeOption.key}
                  onClick={() => setRange(rangeOption.key)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition-all active:scale-95',
                    range === rangeOption.key
                      ? 'bg-brand/15 border-brand/50 text-brand'
                      : 'border-border text-text-muted hover:border-brand/40',
                  )}
                  key={String(rangeOption.key)}
                >
                  {rangeOption.label}
                </button>
              ))}
            </div>
            {range === 'custom' && (
              <div>
                <label className="label !text-xs" htmlFor="cmp-date">
                  Vorher-Foto am oder um den
                </label>
                <input
                  id="cmp-date"
                  type="date"
                  className="input !w-auto"
                  value={customStart}
                  max={comparison?.now.datum}
                  onChange={(event) => setCustomStart(event.target.value)}
                />
              </div>
            )}
            {comparison && (
              <div className="max-w-lg mx-auto w-full" key={`${activeLabel}-${range}-${customStart}`}>
                <div className="grid grid-cols-2 gap-3">
                  <figure className="space-y-2 m-0">
                    {comparison.before ? (
                      <>
                        <AQ_
                          p={comparison.before}
                          onClick={() => setViewing(comparison.before)}
                          className="aspect-[3/4] rounded-2xl border border-border enter"
                        />
                        <figcaption className="text-center">
                          <div className="text-xs font-bold text-text-secondary uppercase tracking-wide">Vorher</div>
                          <div className="text-sm font-semibold text-text-primary">{formatDate(comparison.before.datum)}</div>
                          <div className="text-xs text-text-muted">
                            {agoText(daysBetween(today, comparison.before.datum))}
                            {comparison.before.weightKg != null && ` · ${formatKg(comparison.before.weightKg)}`}
                          </div>
                        </figcaption>
                      </>
                    ) : (
                      <div className="aspect-[3/4] rounded-2xl border border-dashed border-border flex items-center justify-center text-center p-3">
                        <p className="text-xs text-text-muted">
                          Noch kein älteres Foto mit „{comparison.now.label}“ zum Vergleichen.
                        </p>
                      </div>
                    )}
                  </figure>
                  <figure className="space-y-2 m-0">
                    <AQ_
                      p={comparison.now}
                      onClick={() => setViewing(comparison.now)}
                      className="aspect-[3/4] rounded-2xl border-2 border-brand/40 enter"
                    />
                    <figcaption className="text-center">
                      <div className="text-xs font-bold text-brand uppercase tracking-wide">
                        {comparison.now.datum === today ? 'Heute' : 'Aktuell'}
                      </div>
                      <div className="text-sm font-semibold text-text-primary">{formatDate(comparison.now.datum)}</div>
                      <div className="text-xs text-text-muted">
                        {agoText(daysBetween(today, comparison.now.datum))}
                        {comparison.now.weightKg != null && ` · ${formatKg(comparison.now.weightKg)}`}
                      </div>
                    </figcaption>
                  </figure>
                </div>
                {comparison.before && (
                  <p className="text-sm text-text-secondary text-center mt-3" aria-live="polite">
                    <strong className="text-text-primary">{comparison.gapDays} Tage</strong> dazwischen
                    {comparison.before.weightKg != null && comparison.now.weightKg != null && (
                      <>
                        {' '}
                        · Gewicht{' '}
                        <strong className="text-text-primary">{formatDelta(comparison.now.weightKg - comparison.before.weightKg)}</strong>
                      </>
                    )}
                    {comparison.approximate && comparison.wanted > 0 && (
                      <span className="block text-xs text-text-muted mt-1">
                        Genau {comparison.wanted} Tage davor gibt es kein Foto, hier siehst du das nächstgelegene.
                      </span>
                    )}
                  </p>
                )}
                {comparison.now.datum !== today && !viewOnly && daysBetween(today, comparison.now.datum) >= 7 && (
                  <p className="text-xs text-text-muted text-center mt-2">
                    Dein letztes Foto ist {agoText(daysBetween(today, comparison.now.datum))}. Zeit für ein neues?
                  </p>
                )}
              </div>
            )}
          </div>
          <div
            className="card space-y-4 enter"
            style={{
              '--d': 110,
            }}
          >
            <h3 className="font-semibold text-text-primary">Alle Fotos ({photos.length})</h3>
            {byDate.map(([dateKey, dayPhotos]) => (
              <div key={dateKey}>
                <div className="text-xs font-semibold text-text-secondary mb-2">
                  {formatDate(dateKey, 'EEEE, dd. MMMM yyyy')}
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {dayPhotos.map((photoItem) => (
                    <div className="space-y-1" key={photoItem.id}>
                      <AQ_
                        p={photoItem}
                        onClick={() => setViewing(photoItem)}
                        className="aspect-[3/4] rounded-xl border border-border hover:border-brand transition-colors"
                      />
                      <div className="text-[11px] text-center font-semibold text-text-secondary truncate">
                        {photoItem.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {viewing && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4 gap-4 fade-in"
          role="dialog"
          aria-modal="true"
          aria-label={`Foto ${viewing.label}`}
          onClick={() => setViewing(null)}
        >
          <button
            className="absolute top-4 right-4 p-2.5 rounded-full bg-white/15 text-white"
            aria-label="Schließen"
            onClick={() => setViewing(null)}
          >
            <X size={20} />
          </button>
          {viewing.url && (
            <img
              src={viewing.url}
              alt={`${viewing.label} vom ${formatDate(viewing.datum)}`}
              className="max-w-full max-h-[75dvh] object-contain rounded-2xl modal-in"
              onClick={(event) => event.stopPropagation()}
            />
          )}
          <div className="text-white text-center" onClick={(event) => event.stopPropagation()}>
            <div className="font-semibold">
              {viewing.label} · {formatDate(viewing.datum)}
            </div>
            <div className="text-sm text-white/70">
              {agoText(daysBetween(today, viewing.datum))}
              {viewing.weightKg != null && ` · ${formatKg(viewing.weightKg)}`}
            </div>
            <div className="flex gap-2 justify-center mt-3">
              {comparison && viewing.label === comparison.now.label && viewing.id !== comparison.now.id && (
                <button
                  className="px-4 py-2 rounded-full bg-white/15 text-white text-sm font-semibold"
                  onClick={() => {
                    ;(setRange('custom'), setCustomStart(viewing.datum), setViewing(null))
                  }}
                >
                  Als „Vorher“ verwenden
                </button>
              )}
              {!viewOnly &&
                (confirmDeleteId === viewing.id ? (
                  <button
                    className="px-4 py-2 rounded-full bg-danger text-bg text-sm font-semibold"
                    onClick={() => removePhoto(viewing)}
                  >
                    Wirklich löschen
                  </button>
                ) : (
                  <button
                    className="px-4 py-2 rounded-full bg-white/15 text-white text-sm font-semibold flex items-center gap-1.5"
                    onClick={() => setConfirmDeleteId(viewing.id)}
                  >
                    <Trash2 size={14} aria-hidden="true" /> Löschen
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
      {!viewOnly && (
        <OQ_
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          userId={uid}
          labels={labelList}
          defaultLabel={activeLabel ?? undefined}
          onSaved={(savedLabel) => {
            ;(setChosenLabel(savedLabel), reload())
          }}
        />
      )}
    </div>
  )
}
export const CQ_ = ({ active: isActive, payload: tooltipItems, label: photoText }) =>
  !isActive || !tooltipItems?.length ? null : (
    <div className="card !p-3 text-xs">
      <div className="text-text-muted mb-1">{photoText}</div>
      <div className="text-text-primary font-bold">{tooltipItems[0]?.value} kg</div>
    </div>
  )
export function Weight() {
  let { user: authUser } = useAuth(),
    { colors: chartColors } = useTheme(),
    [weightEntries, setEntries] = useState([]),
    [isLoading, setLoading] = useState(true),
    [modalOpen, setModalOpen] = useState(false),
    [targetWeight, setTargetWeight] = useState(null),
    [form, setForm] = useState({
      datum: todayISO(),
      gewicht: '',
      notizen: '',
    }),
    [saving, setSaving] = useState(false),
    [photoFile, setPhotoFile] = useState(null),
    [photoPreview, setPhotoPreview] = useState(null),
    [photoLabel, setPhotoLabel] = useState(DEFAULT_LABELS[0]),
    [uploading, setUploading] = useState(false),
    [tab, setTab] = useState('log'),
    [viewPhotoUrl, setViewPhotoUrl] = useState(null)
  async function loadEntries() {
    if (!authUser) return
    let [entriesResult, settingsResult] = await Promise.all([
      supabase.from('gewicht').select('*').eq('user_id', authUser.id).order('datum', {
        ascending: true,
      }),
      supabase.from('client_settings').select('zielgewicht').eq('user_id', authUser.id).single(),
    ])
    ;(setEntries(entriesResult.data ?? []), setTargetWeight(settingsResult.data?.zielgewicht ?? null), setLoading(false))
  }
  useEffect(() => {
    loadEntries()
  }, [authUser])
  function choosePhoto(file) {
    setPhotoFile(file)
    let reader = new FileReader()
    ;((reader.onload = () => setPhotoPreview(reader.result)), reader.readAsDataURL(file))
  }
  async function uploadLegacyPhoto(entryId, file) {
    let ext = file.name.split('.').pop() ?? 'jpg',
      filePath = `${authUser.id}/${entryId}.${ext}`,
      { error: uploadError } = await supabase.storage.from('body-photos').upload(filePath, file, {
        upsert: true,
      })
    if (uploadError) return null
    let { data: urlData } = supabase.storage.from('body-photos').getPublicUrl(filePath)
    return urlData.publicUrl
  }
  async function saveEntry() {
    if (!authUser || !form.gewicht) return
    setSaving(true)
    let kg = parseFloat(form.gewicht),
      { data: saved } = await supabase
        .from('gewicht')
        .upsert(
          {
            user_id: authUser.id,
            datum: form.datum,
            gewicht: kg,
            notizen: form.notizen || null,
          },
          {
            onConflict: 'user_id,datum',
          },
        )
        .select()
        .single()
    if (saved && photoFile) {
      setUploading(true)
      let photoResult = await uploadPhoto(authUser.id, photoFile, form.datum, photoLabel)
      if (!photoResult.ok && photoResult.reason === 'table') {
        let legacyUrl = await uploadLegacyPhoto(saved.id, photoFile)
        legacyUrl &&
          (await supabase
            .from('gewicht')
            .update({
              foto_url: legacyUrl,
            })
            .eq('id', saved.id))
      }
      setUploading(false)
    }
    ;(await loadEntries(),
      setModalOpen(false),
      setForm({
        datum: todayISO(),
        gewicht: '',
        notizen: '',
      }),
      setPhotoFile(null),
      setPhotoPreview(null),
      setSaving(false))
  }
  async function deleteEntry(entryId) {
    let entry = weightEntries.find((item) => item.id === entryId)
    if (entry?.foto_url) {
      let storagePath = entry.foto_url.split('/body-photos/')[1]
      storagePath && (await supabase.storage.from('body-photos').remove([storagePath]))
    }
    ;(await supabase.from('gewicht').delete().eq('id', entryId), setEntries((list) => list.filter((item) => item.id !== entryId)))
  }
  let chartData = weightEntries.map((entry) => ({
      datum: formatDate(entry.datum, 'dd.MM'),
      gewicht: entry.gewicht,
    })),
    latestWeight = weightEntries.at(-1)?.gewicht,
    firstWeight = weightEntries[0]?.gewicht,
    change = latestWeight && firstWeight ? latestWeight - firstWeight : null,
    axisMin = weightEntries.length ? Math.min(...weightEntries.map((entry) => entry.gewicht)) - 2 : 50,
    axisMax = weightEntries.length ? Math.max(...weightEntries.map((entry) => entry.gewicht)) + 2 : 100
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title text-2xl">Gewicht</h1>
          <p className="text-text-secondary text-sm mt-0.5">Tägliches Gewichtstracking</p>
        </div>
        <button onClick={() => setModalOpen(true)} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Eintragen
        </button>
      </div>
      <SegmentedTabs
        tabs={[
          {
            key: 'log',
            label: 'Einträge',
          },
          {
            key: 'fotos',
            label: 'Körperfotos',
          },
        ]}
        value={tab}
        onChange={(nextTab) => setTab(nextTab)}
        label="Gewicht oder Körperfotos"
      />
      {tab === 'log' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: 'Aktuell',
                value: latestWeight ? `${latestWeight} kg` : '--',
              },
              {
                label: 'Start',
                value: firstWeight ? `${firstWeight} kg` : '--',
              },
              {
                label: 'Veränderung',
                value: change === null ? '--' : `${change > 0 ? '+' : ''}${change.toFixed(1)} kg`,
              },
              {
                label: 'Ziel',
                value: targetWeight ? `${targetWeight} kg` : '--',
              },
            ].map((stat) => (
              <div className="card text-center" key={stat.label}>
                <div className="text-xl font-bold text-text-primary">{stat.value}</div>
                <div className="text-xs text-text-muted mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
          {weightEntries.length > 1 && (
            <div className="card">
              <h2 className="section-title mb-6">Gewichtsverlauf</h2>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="wGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartColors.brand} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={chartColors.brand} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                  <XAxis
                    dataKey="datum"
                    tick={{
                      fill: chartColors.tick,
                      fontSize: 11,
                    }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{
                      fill: chartColors.tick,
                      fontSize: 11,
                    }}
                    axisLine={false}
                    tickLine={false}
                    domain={[axisMin, axisMax]}
                  />
                  <Tooltip content={<CQ_ />} />
                  {targetWeight && (
                    <ReferenceLine
                      y={targetWeight}
                      stroke={chartColors.success}
                      strokeDasharray="6 3"
                      label={{
                        value: 'Ziel',
                        fill: chartColors.success,
                        fontSize: 11,
                      }}
                    />
                  )}
                  <Area
                    isAnimationActive={false}
                    type="monotone"
                    dataKey="gewicht"
                    stroke={chartColors.brand}
                    strokeWidth={2.5}
                    fill="url(#wGrad)"
                    dot={{
                      fill: chartColors.brand,
                      r: 3,
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
      {tab === 'log' && (
        <div className="card">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : weightEntries.length === 0 ? (
            <EmptyState
              icon={Scale}
              title="Noch keine Einträge"
              description="Trage täglich dein Gewicht ein um deinen Fortschritt zu verfolgen."
            />
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
                  {[...weightEntries].reverse().map((entry, position, allEntries) => {
                    let previous = allEntries[position + 1],
                      delta = previous ? entry.gewicht - previous.gewicht : null
                    return (
                      <tr className="border-b border-border/50 hover:bg-bg-elevated/50 transition-colors" key={entry.id}>
                        <td className="py-2.5 px-3 text-text-secondary">{formatDate(entry.datum)}</td>
                        <td className="py-2.5 px-3 text-right font-semibold text-text-primary">{entry.gewicht} kg</td>
                        <td
                          className={`py-2.5 px-3 text-right text-xs font-medium ${delta === null ? 'text-text-muted' : delta < 0 ? 'text-success' : delta > 0 ? 'text-danger' : 'text-text-muted'}`}
                        >
                          {delta === null ? '--' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)} kg`}
                        </td>
                        <td className="py-2.5 px-3 text-text-muted max-w-[120px] truncate">{entry.notizen ?? '--'}</td>
                        <td className="py-2.5 px-3 text-center">
                          {entry.foto_url ? (
                            <button
                              onClick={() => setViewPhotoUrl(entry.foto_url)}
                              className="w-8 h-8 rounded-lg overflow-hidden border border-border hover:border-brand transition-colors inline-block"
                            >
                              <img src={entry.foto_url} alt="" className="w-full h-full object-cover" />
                            </button>
                          ) : (
                            <span className="text-text-muted text-xs">–</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => deleteEntry(entry.id)}
                            className="p-1.5 rounded hover:bg-danger/10 hover:text-danger text-text-muted transition-colors"
                          >
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
      {tab === 'fotos' && authUser && <SQ_ userId={authUser.id} />}
      {viewPhotoUrl && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setViewPhotoUrl(null)}>
          <button className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white">
            <X size={20} />
          </button>
          <img
            src={viewPhotoUrl}
            alt=""
            className="max-w-full max-h-full object-contain rounded-xl"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
      <Modal
        open={modalOpen}
        onClose={() => {
          ;(setModalOpen(false), setPhotoFile(null), setPhotoPreview(null))
        }}
        title="Gewicht eintragen"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Datum</label>
              <input
                type="date"
                className="input"
                value={form.datum}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    datum: event.target.value,
                  }))
                }
              />
            </div>
            <div>
              <label className="label">Gewicht (kg)</label>
              <input
                type="number"
                step="0.1"
                className="input"
                placeholder="75.5"
                value={form.gewicht}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    gewicht: event.target.value,
                  }))
                }
                autoFocus
              />
            </div>
          </div>
          <div>
            <label className="label">Notizen (optional)</label>
            <input
              type="text"
              className="input"
              placeholder="Z.B. nach dem Sport"
              value={form.notizen}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  notizen: event.target.value,
                }))
              }
            />
          </div>
          <div>
            <label className="label flex items-center gap-1.5">
              <Camera size={13} /> Körperfoto (optional)
            </label>
            {photoPreview ? (
              <div className="relative">
                <img src={photoPreview} alt="Vorschau" className="w-full h-40 object-cover rounded-xl border border-border" />
                <button
                  onClick={() => {
                    ;(setPhotoFile(null), setPhotoPreview(null))
                  }}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-danger/80 transition-colors"
                  aria-label="Foto entfernen"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <PhotoSourceButtons compact onPick={choosePhoto} />
            )}
            {photoPreview && (
              <div className="mt-3">
                <label className="label !text-xs" htmlFor="weight-photo-label">
                  Beschriftung
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2" role="group" aria-label="Beschriftung wählen">
                  {DEFAULT_LABELS.map((labelOption) => (
                    <button
                      type="button"
                      aria-pressed={photoLabel === labelOption}
                      onClick={() => setPhotoLabel(labelOption)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${photoLabel === labelOption ? 'bg-primary border-brand text-white' : 'border-border text-text-secondary'}`}
                      key={labelOption}
                    >
                      {labelOption}
                    </button>
                  ))}
                </div>
                <input
                  id="weight-photo-label"
                  className="input !py-2 text-sm"
                  maxLength={30}
                  value={photoLabel}
                  onChange={(event) => setPhotoLabel(event.target.value)}
                />
              </div>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => {
                ;(setModalOpen(false), setPhotoFile(null), setPhotoPreview(null))
              }}
              className="btn-secondary flex-1"
            >
              Abbrechen
            </button>
            <button
              onClick={saveEntry}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
              disabled={saving || !form.gewicht}
            >
              {(saving || uploading) && <Spinner size={16} />}
              {uploading ? 'Foto hochladen…' : saving ? 'Speichern…' : 'Speichern'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
