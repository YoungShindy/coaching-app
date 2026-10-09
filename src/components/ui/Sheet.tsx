import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  /** Auf dem Handy fast bildschirmhoch (z. B. Auswahllisten) */
  tall?: boolean
}

/** Blatt von unten (Handy) bzw. Dialog (groß). Gleitet ein und beim Schließen wieder weg. */
export function Sheet({ open, onClose, title, children, tall }: SheetProps) {
  const [mounted, setMounted] = useState(open)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (open) { setMounted(true); setClosing(false); return }
    if (!mounted) return
    setClosing(true)
    const t = window.setTimeout(() => { setMounted(false); setClosing(false) }, 240)
    return () => window.clearTimeout(t)
  }, [open, mounted])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!mounted) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className={cn('absolute inset-0 bg-black/60', closing ? 'fade-out' : 'fade-in')} onClick={onClose} />
      <div
        className={cn(
          'relative w-full sm:max-w-xl bg-bg-card border border-border shadow-card flex flex-col',
          'rounded-t-4xl sm:rounded-4xl pb-[max(1rem,env(safe-area-inset-bottom))]',
          tall ? 'h-[92dvh] sm:h-[80vh]' : 'max-h-[88dvh]',
          closing ? 'sheet-out' : 'sheet-in',
        )}
      >
        <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3 shrink-0">
          <h2 className="text-lg font-bold text-text-primary truncate">{title}</h2>
          <button onClick={onClose} className="p-2 rounded-full bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors" aria-label="Schließen">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-2">{children}</div>
      </div>
    </div>
  )
}
