import { supabase } from './supabase'
import { isColumnError } from './dbCompat'

// Körperfotos: mehrere pro Tag, frei beschriftet. Alte Fotos aus gewicht.foto_url werden mit angezeigt.

export const BUCKET = 'body-photos'
export const PHOTO_LABEL_SUGGESTIONS = ['Vorne', 'Seite', 'Rücken']
export const DEFAULT_LABEL = 'Foto'

import type { BodyPhoto } from './photoCompare'
export { compare, dayNumber, daysBetween, shiftISO } from './photoCompare'
export type { BodyPhoto, CompareSpan, Comparison } from './photoCompare'

/** Fehlt die Tabelle noch (Migration nicht eingespielt)? */
export const isMissingTable = (err: { message?: string; code?: string } | null | undefined) =>
  !!err && (/42P01|PGRST205|does not exist|schema cache/i.test(`${err.code ?? ''} ${err.message ?? ''}`) || isColumnError(err))

function pathFromUrl(url: string): string | null {
  const i = url.indexOf(`/${BUCKET}/`)
  if (i < 0) return null
  return decodeURIComponent(url.slice(i + BUCKET.length + 2).split('?')[0])
}

async function signAll(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!paths.length) return out
  try {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)
    for (const r of data ?? []) if (r.path && r.signedUrl) out.set(r.path, r.signedUrl)
  } catch { /* weiter mit öffentlicher Adresse */ }
  for (const p of paths) {
    if (!out.has(p)) out.set(p, supabase.storage.from(BUCKET).getPublicUrl(p).data.publicUrl)
  }
  return out
}

/** Alle Fotos eines Nutzers, neueste zuerst. Gewicht zum Foto-Tag wird dazugelegt. */
export async function loadBodyPhotos(userId: string): Promise<BodyPhoto[]> {
  const [rowsRes, weightRes] = await Promise.all([
    supabase.from('koerperfotos').select('*').eq('user_id', userId).order('datum', { ascending: false }),
    supabase.from('gewicht').select('id, datum, gewicht, foto_url').eq('user_id', userId).order('datum', { ascending: true }),
  ])
  const weights = ((weightRes.data ?? []) as unknown as { id: string; datum: string; gewicht: number; foto_url: string | null }[])
  const kgOn = (datum: string) => {
    let hit: number | null = null
    for (const w of weights) { if (w.datum <= datum) hit = w.gewicht; else break }
    return hit
  }

  const photos: BodyPhoto[] = ((rowsRes.error ? [] : rowsRes.data ?? []) as unknown as { id: string; datum: string; pfad: string; label: string }[])
    .map(r => ({ id: r.id, datum: r.datum, label: r.label || DEFAULT_LABEL, path: r.pfad, url: null, weightKg: kgOn(r.datum) }))
  const known = new Set(photos.map(p => p.path))

  // Fotos aus der alten Einzelspalte gewicht.foto_url
  for (const w of weights) {
    if (!w.foto_url) continue
    const path = pathFromUrl(w.foto_url)
    if (path && known.has(path)) continue
    photos.push({ id: `legacy-${w.id}`, datum: w.datum, label: DEFAULT_LABEL, path, url: path ? null : w.foto_url, legacyWeightId: w.id, weightKg: w.gewicht })
  }

  const signed = await signAll(photos.filter(p => p.path).map(p => p.path as string))
  for (const p of photos) if (p.path) p.url = signed.get(p.path) ?? null
  return photos.sort((a, b) => b.datum.localeCompare(a.datum) || a.label.localeCompare(b.label, 'de'))
}

/** Verkleinert und komprimiert ein Foto (längste Seite 1600 px, JPEG). Entfernt dabei auch die EXIF-Daten (Ort, Kamera). */
export async function compressImage(file: File, maxSide = 1600, quality = 0.85): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
    bmp.close?.()
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', quality))
    return blob ?? file
  } catch {
    return file // z. B. HEIC ohne Browser-Unterstützung: Original hochladen
  }
}

export interface UploadResult { ok: boolean; photo?: { id: string; path: string }; reason?: 'upload' | 'table' | 'save' }

export async function uploadBodyPhoto(userId: string, file: File, datum: string, label: string): Promise<UploadResult> {
  const blob = await compressImage(file)
  const path = `${userId}/${datum}-${Date.now()}.jpg`
  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (up.error) return { ok: false, reason: 'upload' }
  const ins = await supabase.from('koerperfotos').insert({ user_id: userId, datum, pfad: path, label: label.trim() || DEFAULT_LABEL }).select('id').single()
  if (ins.error || !ins.data) {
    await supabase.storage.from(BUCKET).remove([path])
    return { ok: false, reason: isMissingTable(ins.error) ? 'table' : 'save' }
  }
  return { ok: true, photo: { id: (ins.data as { id: string }).id, path } }
}

export async function deleteBodyPhoto(p: BodyPhoto) {
  if (p.path) await supabase.storage.from(BUCKET).remove([p.path])
  if (p.legacyWeightId) await supabase.from('gewicht').update({ foto_url: null } as never).eq('id', p.legacyWeightId)
  else await supabase.from('koerperfotos').delete().eq('id', p.id)
}

