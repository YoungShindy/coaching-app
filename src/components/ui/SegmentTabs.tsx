import { cn } from '../../lib/utils'

interface Tab<T extends string> { key: T; label: string }

/** Umschalter mit gleitender Markierung (Reiter innerhalb einer Seite). */
export function SegmentTabs<T extends string>({ tabs, value, onChange, label, className }: {
  tabs: Tab<T>[]
  value: T
  onChange: (key: T) => void
  label: string
  className?: string
}) {
  const index = Math.max(0, tabs.findIndex(t => t.key === value))
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const next = (index + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    onChange(tabs[next].key)
  }
  return (
    <div
      role="tablist" aria-label={label} onKeyDown={onKey}
      className={cn('relative grid p-1 rounded-full bg-bg-elevated border border-border', className)}
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden="true"
        className="absolute top-1 bottom-1 left-1 rounded-full bg-primary ring-1 ring-inset ring-brand/30 shadow-glow-sm"
        style={{
          width: `calc((100% - 0.5rem) / ${tabs.length})`,
          transform: `translateX(${index * 100}%)`,
          transition: 'transform 0.4s var(--ease-out)',
        }}
      />
      {tabs.map(t => (
        <button
          key={t.key} role="tab" aria-selected={t.key === value} tabIndex={t.key === value ? 0 : -1}
          onClick={() => onChange(t.key)}
          className={cn('relative z-10 py-2 px-2 max-[359px]:px-1 text-sm max-[359px]:text-[12px] font-semibold rounded-full transition-colors duration-300 active:scale-95 truncate',
            t.key === value ? 'text-white' : 'text-text-secondary hover:text-text-primary')}
        >{t.label}</button>
      ))}
    </div>
  )
}
