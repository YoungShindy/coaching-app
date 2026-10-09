import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { Avatar } from './Avatar'
import { randomConfig } from './avatarConfig'
import { useGame } from '../../hooks/useGame'

/** Einmaliges Angebot für bestehende Konten: eigene Figur erstellen. „Später“ merkt sich der Browser. */
export function CharacterOffer() {
  const { available, loaded, character, offerDismissed, dismissOffer } = useGame()
  const navigate = useNavigate()
  const config = useMemo(() => randomConfig(), [])
  if (!available || !loaded || character || offerDismissed) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Neu: deine eigene Figur">
      <div className="absolute inset-0 bg-black/60 fade-in" onClick={dismissOffer} />
      <div className="relative w-full max-w-sm bg-bg-card border border-border rounded-4xl shadow-card p-6 text-center modal-in mb-[max(1rem,env(safe-area-inset-bottom))] sm:mb-0">
        <div className="mx-auto w-fit rounded-4xl bg-gradient-to-b from-brand/10 to-transparent px-6 pt-3">
          <Avatar config={config} size={150} idle label="Eine Figur zum Kennenlernen" />
        </div>
        <h2 className="mt-3 text-xl font-extrabold text-text-primary flex items-center justify-center gap-2"><Sparkles size={18} className="text-warning" aria-hidden="true" /> Neu: deine eigene Figur</h2>
        <p className="mt-2 text-sm text-text-secondary leading-relaxed">
          Sie sammelt mit dir XP, steigt im Level auf und trägt, was du dir im Shop kaufst. Dazu gibt es Challenges und Belohnungen. Das Einrichten dauert etwa zwei Minuten.
        </p>
        <div className="mt-5 space-y-2">
          <button autoFocus onClick={() => { dismissOffer(); navigate('/charakter') }} className="btn-primary w-full">Jetzt einrichten</button>
          <button onClick={dismissOffer} className="w-full py-2.5 text-sm font-semibold text-text-secondary hover:text-text-primary">Später, über „Mehr“</button>
        </div>
      </div>
    </div>
  )
}
