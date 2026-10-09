import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X, ChevronRight, Dumbbell, Info } from 'lucide-react'
import { Spinner } from '../components/ui/Spinner'
import { cn } from '../lib/utils'
import { GROUPS, gifUrl, imgUrl, loadExercises, norm, searchKey, type GroupKey, type PoolExercise } from '../lib/exercises'

// ─── Detail ───────────────────────────────────────────────────────────────────

function DetailModal({ ex, onClose }: { ex: PoolExercise; onClose: () => void }) {
  const [gifFailed, setGifFailed] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={ex.name}>
      <div className="absolute inset-0 bg-black/60 fade-in" onClick={onClose} />
      <div className="relative bg-bg-card border border-border w-full sm:max-w-lg rounded-t-4xl sm:rounded-4xl overflow-hidden max-h-[90dvh] flex flex-col sheet-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-text-primary truncate">{ex.name}</h2>
            <p className="text-xs text-text-muted mt-0.5">{ex.body_part_de} · {ex.equipment_de}</p>
          </div>
          <button onClick={onClose} className="ml-3 p-2 rounded-full bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors" aria-label="Schließen">
            <X size={18} />
          </button>
        </div>

        <div className="bg-bg-elevated flex items-center justify-center shrink-0" style={{ height: 240 }}>
          <img
            src={gifFailed ? imgUrl(ex) : gifUrl(ex)} alt={ex.name} className="h-full object-contain"
            onError={() => setGifFailed(true)}
          />
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <span className="px-2.5 py-1 rounded-full bg-brand/15 text-brand text-xs font-semibold">{ex.target_de}</span>
            {ex.secondary_de.map(m => (
              <span key={m} className="px-2.5 py-1 rounded-full bg-bg-elevated text-text-secondary text-xs border border-border">{m}</span>
            ))}
          </div>

          {ex.steps.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                <Info size={12} /> Ausführung
              </h3>
              <ol className="space-y-2.5">
                {ex.steps.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm text-text-secondary leading-relaxed">
                    <span className="w-5 h-5 rounded-full bg-brand/15 text-brand text-xs flex items-center justify-center shrink-0 mt-0.5 font-semibold">{i + 1}</span>
                    <span>{/[.!?]$/.test(step) ? step : step + '.'}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <p className="text-[11px] text-text-muted">Englischer Name: {ex.name_en}</p>
        </div>
      </div>
    </div>
  )
}

// ─── Zeile ────────────────────────────────────────────────────────────────────

function ExRow({ ex, onClick }: { ex: PoolExercise; onClick: () => void }) {
  const [imgError, setImgError] = useState(false)
  return (
    <button onClick={onClick} className="flex items-center gap-3 w-full py-2.5 px-3 rounded-2xl hover:bg-bg-elevated active:scale-[0.985] transition-all text-left group">
      <div className="w-12 h-12 rounded-xl bg-bg-elevated overflow-hidden shrink-0 flex items-center justify-center">
        {!imgError
          ? <img src={imgUrl(ex)} alt="" loading="lazy" className="w-full h-full object-cover" onError={() => setImgError(true)} />
          : <Dumbbell size={20} className="text-text-muted" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-text-primary truncate">{ex.name}</div>
        <div className="text-xs text-text-muted mt-0.5 truncate">{ex.target_de} · {ex.equipment_de}</div>
      </div>
      <ChevronRight size={14} className="text-text-muted opacity-40 group-hover:opacity-80 transition-opacity shrink-0" />
    </button>
  )
}

// ─── Seite ────────────────────────────────────────────────────────────────────

export function Uebungspool({ embedded = false }: { embedded?: boolean }) {
  const [exercises, setExercises] = useState<PoolExercise[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<GroupKey | null>(null)
  const [detail, setDetail] = useState<PoolExercise | null>(null)
  const letterRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    loadExercises().then(d => { setExercises(d); setLoading(false) }).catch(() => { setFailed(true); setLoading(false) })
  }, [])

  const keys = useMemo(() => new Map(exercises.map(e => [e.id, searchKey(e)])), [exercises])

  const filtered = useMemo(() => {
    const words = norm(query).split(' ').filter(Boolean)
    return exercises
      .filter(e => {
        if (group && e.group !== group) return false
        if (words.length) { const k = keys.get(e.id) ?? ''; return words.every(w => k.includes(w)) }
        return true
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'de'))
  }, [exercises, keys, query, group])

  const grouped = useMemo(() => {
    const map: Record<string, PoolExercise[]> = {}
    for (const ex of filtered) {
      const letter = (ex.name[0] ?? '#').toUpperCase()
      ;(map[letter] ??= []).push(ex)
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b, 'de'))
  }, [filtered])
  const letters = grouped.map(([l]) => l)

  if (loading) return <div className="flex items-center justify-center py-32"><Spinner size={36} /></div>

  if (failed || exercises.length === 0) {
    return (
      <div className="card text-center py-10 space-y-3 max-w-2xl">
        <Dumbbell size={40} className="text-text-muted mx-auto" />
        <p className="font-semibold text-text-primary">Der Übungspool konnte nicht geladen werden</p>
        <p className="text-sm text-text-secondary max-w-sm mx-auto">Prüfe deine Internetverbindung und lade die Seite neu.</p>
      </div>
    )
  }

  return (
    <div className="flex gap-2 max-w-2xl relative">
      <div className="flex-1 min-w-0 space-y-4">
        {!embedded && (
          <div>
            <h1 className="section-title text-2xl">Übungspool</h1>
            <p className="text-text-secondary text-sm mt-0.5">{exercises.length} Übungen</p>
          </div>
        )}

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            type="search" placeholder={`Übung suchen (${exercises.length} Übungen)`} value={query}
            onChange={e => setQuery(e.target.value)} className="input pl-9 pr-9" aria-label="Übung suchen"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary" aria-label="Suche leeren">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setGroup(null)}
            className={cn('px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border shrink-0 transition-all active:scale-95',
              !group ? 'bg-primary border-brand text-white' : 'border-border text-text-secondary hover:border-brand/40')}
          >Alle</button>
          {GROUPS.filter(g => g.key !== 'sonstige').map(g => (
            <button
              key={g.key} onClick={() => setGroup(group === g.key ? null : g.key)}
              className={cn('px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border shrink-0 transition-all active:scale-95',
                group === g.key ? 'bg-primary border-brand text-white' : 'border-border text-text-secondary hover:border-brand/40')}
            >{g.label}</button>
          ))}
        </div>

        {(query || group) && <p className="text-xs text-text-muted">{filtered.length} Ergebnis{filtered.length !== 1 ? 'se' : ''}</p>}

        <div className="space-y-1">
          {grouped.length === 0 ? (
            <div className="card text-center py-8 text-text-muted text-sm">Keine Übungen gefunden.</div>
          ) : grouped.map(([letter, exs]) => (
            <div key={letter} ref={el => { letterRefs.current[letter] = el }}>
              <div className="px-3 py-1 text-xs font-bold text-text-muted uppercase tracking-widest sticky top-0 bg-bg/90 backdrop-blur-sm z-10 border-b border-border/40 mb-0.5">{letter}</div>
              {exs.map(ex => <ExRow key={ex.id} ex={ex} onClick={() => setDetail(ex)} />)}
            </div>
          ))}
        </div>
      </div>

      {!query && !group && letters.length > 4 && (
        <div className="flex flex-col items-center gap-0.5 py-2 shrink-0 sticky top-8 self-start">
          {letters.map(l => (
            <button key={l} onClick={() => letterRefs.current[l]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="w-5 text-center text-[10px] font-bold text-brand leading-tight">{l}</button>
          ))}
        </div>
      )}

      {detail && <DetailModal ex={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}
