import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Camera, ImagePlus, RefreshCw, Timer, X } from 'lucide-react'
import { cn } from '../lib/utils'

// Foto aufnehmen: entweder live in der App (mit Selbstauslöser 3/5/10 s, Front- und Rückkamera)
// oder aus der Fotomediathek / Galerie wählen.

const TIMER_KEY = 'hlx-photo-timer'
const TIMER_CHOICES = [0, 3, 5, 10] as const
type TimerSeconds = (typeof TIMER_CHOICES)[number]

function loadTimer(): TimerSeconds {
  try {
    const stored = parseInt(localStorage.getItem(TIMER_KEY) ?? '')
    return (TIMER_CHOICES as readonly number[]).includes(stored) ? (stored as TimerSeconds) : 0
  } catch {
    return 0
  }
}

export const canUseLiveCamera = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

/** Vollbild-Kamera mit Selbstauslöser. Gibt das aufgenommene Foto als Datei zurück. */
export function LiveCamera({ onCapture, onClose }: { onCapture: (file: File) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const countdownRef = useRef<number | undefined>(undefined)
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [timer, setTimer] = useState<TimerSeconds>(loadTimer)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [flash, setFlash] = useState(false)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
  }, [])

  const cancelCountdown = useCallback(() => {
    window.clearInterval(countdownRef.current)
    countdownRef.current = undefined
    setRemaining(null)
  }, [])

  // Kamera starten (und beim Wechsel zwischen Front- und Rückkamera neu starten)
  useEffect(() => {
    let cancelled = false
    setReady(false)
    setError('')
    stopStream()
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } },
        audio: false,
      })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(track => track.stop()); return }
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          video.play().catch(() => undefined)
        }
      })
      .catch(() => {
        if (!cancelled) setError('Kein Zugriff auf die Kamera. Bitte erlaube die Kamera in den Einstellungen oder wähle ein Foto aus der Galerie.')
      })
    return () => { cancelled = true; stopStream() }
  }, [facing, stopStream])

  useEffect(() => () => window.clearInterval(countdownRef.current), [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function chooseTimer(seconds: TimerSeconds) {
    setTimer(seconds)
    try { localStorage.setItem(TIMER_KEY, String(seconds)) } catch { /* optional */ }
  }

  function takePhoto() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
    setFlash(true)
    window.setTimeout(() => setFlash(false), 180)
    canvas.toBlob(blob => {
      if (!blob) { setError('Das Foto konnte nicht aufgenommen werden.'); return }
      onCapture(new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.92)
  }

  function onShutter() {
    if (remaining !== null) { cancelCountdown(); return }
    if (timer === 0) { takePhoto(); return }
    let left: number = timer
    setRemaining(left)
    countdownRef.current = window.setInterval(() => {
      left -= 1
      if (left <= 0) {
        cancelCountdown()
        takePhoto()
      } else {
        setRemaining(left)
      }
    }, 1000)
  }

  const counting = remaining !== null

  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col" role="dialog" aria-modal="true" aria-label="Kamera">
      <div className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <span className="text-white font-semibold text-sm">Foto aufnehmen</span>
        <button onClick={onClose} className="p-2 rounded-full bg-white/10 text-white" aria-label="Kamera schließen">
          <X size={18} />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden min-h-0">
        <video
          ref={videoRef}
          className={cn('absolute inset-0 w-full h-full object-contain', facing === 'user' && '-scale-x-100')}
          playsInline
          muted
          autoPlay
          onLoadedMetadata={() => setReady(true)}
        />
        {counting && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span key={remaining} className="pop-in text-white font-bold drop-shadow-lg" style={{ fontSize: 'min(40vw, 14rem)', lineHeight: 1 }}>
              {remaining}
            </span>
          </div>
        )}
        {flash && <div className="absolute inset-0 bg-white" />}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/85 p-6 text-center">
            <p className="text-white text-sm max-w-sm">{error}</p>
          </div>
        )}
      </div>

      <div className="px-4 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] bg-black space-y-4">
        <div className="flex items-center justify-center gap-2" role="group" aria-label="Selbstauslöser">
          <Timer size={16} className="text-white/60" aria-hidden="true" />
          {TIMER_CHOICES.map(seconds => (
            <button
              key={seconds}
              onClick={() => chooseTimer(seconds)}
              disabled={counting}
              aria-pressed={timer === seconds}
              className={cn(
                'min-w-[3.25rem] px-3 py-1.5 rounded-full text-sm font-semibold transition-colors disabled:opacity-50',
                timer === seconds ? 'bg-white text-black' : 'bg-white/10 text-white',
              )}
            >
              {seconds === 0 ? 'Aus' : `${seconds} s`}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <div className="w-12" />
          <button
            onClick={onShutter}
            disabled={!ready && !counting}
            aria-label={counting ? 'Selbstauslöser abbrechen' : timer ? `Foto in ${timer} Sekunden aufnehmen` : 'Foto aufnehmen'}
            className="w-[72px] h-[72px] rounded-full border-4 border-white flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40"
          >
            {counting
              ? <X size={30} className="text-white" />
              : <span className="block w-14 h-14 rounded-full bg-white" />}
          </button>
          <button
            onClick={() => setFacing(f => (f === 'environment' ? 'user' : 'environment'))}
            disabled={counting}
            className="w-12 h-12 rounded-full bg-white/10 text-white flex items-center justify-center disabled:opacity-40"
            aria-label="Kamera wechseln"
          >
            <RefreshCw size={20} />
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Zwei Schaltflächen: „Kamera“ (Live-Kamera mit Selbstauslöser) und „Galerie“ (Fotomediathek).
 * Ohne Kamera-Unterstützung öffnet „Kamera“ die System-Kamera.
 */
export function PhotoSourceButtons({ onPick, compact = false }: { onPick: (file: File) => void; compact?: boolean }) {
  const [live, setLive] = useState(false)
  const nativeCamera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)

  function picked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onPick(file)
  }

  return (
    <>
      <input ref={nativeCamera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={picked} />
      <input ref={gallery} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={picked} />
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => (canUseLiveCamera() ? setLive(true) : nativeCamera.current?.click())}
          className={cn(
            'rounded-2xl border border-dashed border-brand/50 bg-brand/5 flex flex-col items-center gap-1.5 text-brand font-semibold text-sm active:scale-[0.97] transition-transform',
            compact ? 'py-3.5' : 'py-5',
          )}
        >
          <Camera size={22} aria-hidden="true" /> Kamera
          <span className="text-[11px] font-normal text-text-muted -mt-0.5">mit Timer 3 / 5 / 10 s</span>
        </button>
        <button
          type="button"
          onClick={() => gallery.current?.click()}
          className={cn(
            'rounded-2xl border border-dashed border-border bg-bg-elevated flex flex-col items-center gap-1.5 text-text-secondary font-semibold text-sm active:scale-[0.97] transition-transform',
            compact ? 'py-3.5' : 'py-5',
          )}
        >
          <ImagePlus size={22} aria-hidden="true" /> Galerie
          <span className="text-[11px] font-normal text-text-muted -mt-0.5">aus Fotomediathek</span>
        </button>
      </div>
      {live && createPortal(
        <LiveCamera
          onClose={() => setLive(false)}
          onCapture={file => { setLive(false); onPick(file) }}
        />,
        document.body,
      )}
    </>
  )
}
