import { useMemo, useState } from 'react'
import { Dices, Shuffle } from 'lucide-react'
import { Avatar } from './Avatar'
import {
  BEARD_STYLES, BROW_STYLES, EYE_STYLES, FACE_SHAPES, HAIR_COLORS, HAIR_STYLES, MOUTH_STYLES, RANDOM_NAMES, SHIRT_COLORS, SKIN_TONES,
  randomConfig, type AvatarConfig,
} from './avatarConfig'
import { SegmentTabs } from '../ui/SegmentTabs'
import { cn } from '../../lib/utils'
import { MAX_NAME, cleanName, type Equipped } from '../../lib/game'

type Group = 'gesicht' | 'haare' | 'mimik' | 'stil'
const GROUPS: { key: Group; label: string }[] = [
  { key: 'gesicht', label: 'Gesicht' }, { key: 'haare', label: 'Haare' }, { key: 'mimik', label: 'Mimik' }, { key: 'stil', label: 'Bart & Stil' },
]

function Swatches({ label, colors, value, onPick }: { label: string; colors: string[]; value: string; onPick: (c: string) => void }) {
  return (
    <div>
      <div className="text-xs font-semibold text-text-secondary mb-2">{label}</div>
      <div className="flex flex-wrap gap-2.5" role="group" aria-label={label}>
        {colors.map((col, i) => (
          <button
            key={col} type="button" onClick={() => onPick(col)} aria-pressed={value === col} aria-label={`${label} ${i + 1}`}
            className={cn('w-10 h-10 rounded-full border-2 transition-all active:scale-90', value === col ? 'border-brand ring-2 ring-brand/40 scale-105' : 'border-border-light')}
            style={{ backgroundColor: col }}
          />
        ))}
      </div>
    </div>
  )
}

function Tiles<K extends string>({ label, items, value, config, apply, onPick }: {
  label: string
  items: { key: K; label: string }[]
  value: K
  config: AvatarConfig
  apply: (key: K) => Partial<AvatarConfig>
  onPick: (key: K) => void
}) {
  return (
    <div>
      <div className="text-xs font-semibold text-text-secondary mb-2">{label}</div>
      <div className="grid grid-cols-4 gap-2" role="group" aria-label={label}>
        {items.map(it => (
          <button
            key={it.key} type="button" onClick={() => onPick(it.key)} aria-pressed={value === it.key}
            className={cn('rounded-2xl border p-1 flex flex-col items-center gap-0.5 transition-all active:scale-95',
              value === it.key ? 'border-brand bg-brand/10' : 'border-border bg-bg-elevated hover:border-brand/40')}
          >
            <Avatar view="head" size={58} config={{ ...config, ...apply(it.key) }} label="" />
            <span className="text-[11px] font-semibold text-text-secondary leading-tight text-center">{it.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Figur gestalten: vier Bereiche und ein Name (höchstens 16 Zeichen). */
export function AvatarEditor({ config, name, equipped, onConfig, onName, autoFocusName }: {
  config: AvatarConfig
  name: string
  equipped?: Equipped
  onConfig: (c: AvatarConfig) => void
  onName: (n: string) => void
  autoFocusName?: boolean
}) {
  const [group, setGroup] = useState<Group>('gesicht')
  const set = (patch: Partial<AvatarConfig>) => onConfig({ ...config, ...patch })
  const nameLeft = useMemo(() => MAX_NAME - name.length, [name])

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3">
        <div className="relative rounded-4xl bg-gradient-to-b from-brand/10 to-transparent px-8 pt-4">
          <Avatar config={config} equipped={equipped} size={210} idle label="Vorschau deiner Figur" />
        </div>
        <button
          type="button" onClick={() => onConfig(randomConfig())}
          className="btn-secondary !px-4 !py-2 text-sm flex items-center gap-2"
        >
          <Dices size={16} aria-hidden="true" /> Zufällige Figur
        </button>
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor="char-name" className="label !mb-1">Name deiner Figur</label>
          <span className={cn('text-xs tabular-nums', nameLeft < 4 ? 'text-warning' : 'text-text-muted')} aria-live="polite">{nameLeft} übrig</span>
        </div>
        <div className="flex gap-2">
          <input
            id="char-name" className="input" maxLength={MAX_NAME} autoComplete="off" autoFocus={autoFocusName}
            placeholder="z. B. Hugo" value={name} onChange={e => onName(cleanNameInput(e.target.value))}
          />
          <button
            type="button" aria-label="Zufälliger Name" title="Zufälliger Name"
            onClick={() => onName(RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)])}
            className="shrink-0 w-12 rounded-2xl bg-bg-elevated border border-border-input text-text-secondary hover:text-brand hover:border-brand/50 flex items-center justify-center transition-colors"
          >
            <Shuffle size={18} aria-hidden="true" />
          </button>
        </div>
        <p className="text-xs text-text-muted mt-1.5">Du kannst den Namen später jederzeit ändern.</p>
      </div>

      <SegmentTabs tabs={GROUPS} value={group} onChange={k => setGroup(k as Group)} label="Bereich der Figur" />

      <div key={group} className="space-y-5 enter" style={{ '--d': 0 } as React.CSSProperties}>
        {group === 'gesicht' && (
          <>
            <Swatches label="Hautton" colors={SKIN_TONES} value={config.skin} onPick={skin => set({ skin })} />
            <Tiles label="Gesichtsform" items={FACE_SHAPES} value={config.face} config={config} apply={face => ({ face })} onPick={face => set({ face })} />
          </>
        )}
        {group === 'haare' && (
          <>
            <Tiles label="Frisur" items={HAIR_STYLES} value={config.hairStyle} config={config} apply={hairStyle => ({ hairStyle })} onPick={hairStyle => set({ hairStyle })} />
            <Swatches label="Haarfarbe" colors={HAIR_COLORS} value={config.hairColor} onPick={hairColor => set({ hairColor })} />
          </>
        )}
        {group === 'mimik' && (
          <>
            <Tiles label="Augen" items={EYE_STYLES} value={config.eyes} config={config} apply={eyes => ({ eyes })} onPick={eyes => set({ eyes })} />
            <Tiles label="Augenbrauen" items={BROW_STYLES} value={config.brows} config={config} apply={brows => ({ brows })} onPick={brows => set({ brows })} />
            <Tiles label="Mund" items={MOUTH_STYLES} value={config.mouth} config={config} apply={mouth => ({ mouth })} onPick={mouth => set({ mouth })} />
          </>
        )}
        {group === 'stil' && (
          <>
            <Tiles label="Bart" items={BEARD_STYLES} value={config.beard} config={config} apply={beard => ({ beard })} onPick={beard => set({ beard })} />
            <Swatches label="Shirt-Farbe" colors={SHIRT_COLORS} value={config.shirt} onPick={shirt => set({ shirt })} />
          </>
        )}
      </div>
    </div>
  )
}

/** Während des Tippens Leerzeichen am Anfang vermeiden, den Rest zulassen. */
function cleanNameInput(v: string) {
  return v.replace(/^\s+/, '').replace(/\s{2,}/g, ' ').slice(0, MAX_NAME)
}

export { cleanName }
