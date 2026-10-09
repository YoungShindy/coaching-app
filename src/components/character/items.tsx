import { shade } from './avatarConfig'

// Zeichnungen für die Dinge aus dem Shop. Koordinaten passen zur Figur (Fläche 200 × 250, Kopf bei 100/94).

const DARK = '#1d1b1a'
const GOLD = '#e0a526'
const TORSO = 'M10 250 L10 222 C10 198 40 182 84 178 L116 178 C160 182 190 198 190 222 L190 250 Z'
export const TORSO_PATH = TORSO

export interface ClothesInfo {
  /** Farbe von Oberkörper und rechtem Ärmel */
  body: string
  /** Farbe des rechten Arms (Ärmel oder nackte Haut) */
  sleeve: string
  /** Farbe des linken Ärmels */
  leftSleeve: string
}

export function clothesInfo(kind: string | undefined, shirt: string, skin: string): ClothesInfo {
  switch (kind) {
    case 'tank': return { body: shirt, sleeve: skin, leftSleeve: shade(skin, 0.1) }
    case 'suit': return { body: '#262b3d', sleeve: '#262b3d', leftSleeve: '#1d2130' }
    default: return { body: shirt, sleeve: shirt, leftSleeve: shade(shirt, 0.16) }
  }
}

/** Dinge hinter Kopf und Oberkörper (z. B. die Kapuze). */
export function BackItem({ clothes, shirt }: { clothes?: string; shirt: string }) {
  if (clothes === 'hoodie') {
    return <path d="M58 170 C52 140 70 128 100 128 C130 128 148 140 142 170 C128 182 72 182 58 170 Z" fill={shade(shirt, 0.2)} />
  }
  return null
}

/** Oberkörper-Variante über dem Grundkörper. */
export function ClothesFront({ clothes, shirt, skin }: { clothes?: string; shirt: string; skin: string }) {
  switch (clothes) {
    case 'tank': return (
      <g>
        <path d={TORSO} fill={skin} />
        <path d="M46 250 L46 216 C52 202 68 192 84 186 L91 196 Q100 210 109 196 L116 186 C132 192 148 202 154 216 L154 250 Z" fill={shirt} />
      </g>
    )
    case 'hoodie': return (
      <g>
        <path d={TORSO} fill={shirt} />
        <path d="M84 178 Q100 200 116 178 Q100 186 84 178 Z" fill={shade(shirt, 0.25)} />
        <path d="M93 192 L91 218 M107 192 L109 216" stroke="#fff" strokeOpacity="0.85" strokeWidth="3" strokeLinecap="round" />
        <path d="M62 240 Q100 226 138 240" fill="none" stroke={shade(shirt, 0.25)} strokeWidth="3" strokeLinecap="round" />
      </g>
    )
    case 'jacket': return (
      <g>
        <path d={TORSO} fill={shirt} />
        <path d="M100 190 L100 250" stroke="#e8eeea" strokeWidth="3.5" />
        <path d="M84 178 L98 196 L96 182 Z M116 178 L102 196 L104 182 Z" fill={shade(shirt, 0.3)} />
        <path d="M30 214 Q60 200 84 192 M170 214 Q140 200 116 192" fill="none" stroke="#e8eeea" strokeOpacity="0.8" strokeWidth="4" strokeLinecap="round" />
      </g>
    )
    case 'jersey': return (
      <g>
        <path d={TORSO} fill={shirt} />
        {[196, 212, 228, 244].map(y => <rect key={y} x="8" y={y} width="184" height="8" fill="#fff" fillOpacity="0.28" />)}
        <path d="M84 178 Q100 200 116 178" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
        <text x="100" y="236" textAnchor="middle" fontFamily="system-ui,sans-serif" fontWeight="800" fontSize="26" fill="#fff" fillOpacity="0.9">10</text>
      </g>
    )
    case 'suit': return (
      <g>
        <path d={TORSO} fill="#262b3d" />
        <path d="M84 178 L100 226 L116 178 Z" fill="#f2f4f3" />
        <path d="M100 194 L94 204 L100 246 L106 204 Z" fill="#075640" />
        <path d="M84 178 L96 232 L80 250 M116 178 L104 232 L120 250" fill="none" stroke="#161a28" strokeWidth="3" strokeLinejoin="round" />
      </g>
    )
    default: return null
  }
}

/** Dinge am Hals. */
export function NeckItem({ item }: { item?: string }) {
  switch (item) {
    case 'scarf': return (
      <g>
        <path d="M78 168 Q100 190 122 168 L126 186 Q100 204 74 186 Z" fill="#c4461f" />
        <path d="M108 190 L126 186 L130 232 L110 228 Z" fill="#a83a19" />
        <path d="M110 208 L128 210 M110 218 L129 220" stroke="#fff" strokeOpacity="0.5" strokeWidth="3" />
      </g>
    )
    case 'medal': return (
      <g>
        <path d="M86 178 L100 216 L114 178" fill="none" stroke="#c4461f" strokeWidth="7" strokeLinejoin="round" />
        <circle cx="100" cy="224" r="13" fill={GOLD} stroke="#b9831a" strokeWidth="2" />
        <path d="M100 215 L103 222 L110 223 L105 228 L106 235 L100 231 L94 235 L95 228 L90 223 L97 222 Z" fill="#fff3c4" />
      </g>
    )
    case 'goldchain': return (
      <g>
        <path d="M82 178 Q100 218 118 178" fill="none" stroke={GOLD} strokeWidth="4.5" strokeLinecap="round" strokeDasharray="1 5.5" />
        <path d="M82 178 Q100 218 118 178" fill="none" stroke={GOLD} strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="100" cy="204" r="7.5" fill={GOLD} stroke="#b9831a" strokeWidth="1.6" />
        <path d="M97 204 H103 M100 200.5 V207.5" stroke="#fff3c4" strokeWidth="1.8" strokeLinecap="round" />
      </g>
    )
    default: return null
  }
}

/** Brillen auf Augenhöhe. */
export function FaceItem({ item }: { item?: string }) {
  if (item === 'glasses') return (
    <g fill="#fff" fillOpacity="0.1" stroke={DARK} strokeWidth="3.2" strokeLinecap="round">
      <circle cx="82" cy="96" r="14" /><circle cx="118" cy="96" r="14" />
      <path d="M96 94 Q100 90 104 94" fill="none" /><path d="M68 94 L55 91 M132 94 L145 91" fill="none" />
    </g>
  )
  if (item === 'sunglasses') return (
    <g>
      <path d="M95 94 Q100 90 105 94" fill="none" stroke={DARK} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M66 86 H96 V99 Q96 111 85 111 H77 Q66 111 66 99 Z" fill={DARK} />
      <path d="M104 86 H134 V99 Q134 111 123 111 H115 Q104 111 104 99 Z" fill={DARK} />
      <path d="M72 91 L84 91 M110 91 L122 91" stroke="#fff" strokeOpacity="0.35" strokeWidth="3" strokeLinecap="round" />
      <path d="M66 88 L54 86 M134 88 L146 86" stroke={DARK} strokeWidth="3.4" strokeLinecap="round" />
    </g>
  )
  return null
}

/** Mützen, Hüte und Kopfhörer. */
export function HeadItem({ item }: { item?: string }) {
  switch (item) {
    case 'headband': return (
      <g>
        <path d="M53 72 Q100 54 147 72 L147 84 Q100 66 53 84 Z" fill="#075640" />
        <path d="M100 66 L95 74 H99 L97 81 L105 72 H101 Z" fill="#fff" fillOpacity="0.9" />
      </g>
    )
    case 'cap': return (
      <g>
        <path d="M52 82 C48 42 74 28 100 28 C126 28 152 42 148 82 C130 72 70 72 52 82 Z" fill="#075640" />
        <path d="M46 84 Q100 108 154 84 Q154 76 138 74 Q100 86 62 74 Q46 76 46 84 Z" fill="#054433" />
        <path d="M101 46 L93 62 H99 L96 74 L108 58 H102 Z" fill="#fff" fillOpacity="0.92" />
      </g>
    )
    case 'beanie': return (
      <g>
        <path d="M52 84 C46 36 76 24 100 24 C124 24 154 36 148 84 Z" fill="#c4461f" />
        <path d="M49 72 Q100 86 151 72 L152 90 Q100 104 48 90 Z" fill="#a83a19" />
        {[62, 78, 94, 110, 126, 140].map(x => <path key={x} d={`M${x} 76 L${x} 94`} stroke="#c4461f" strokeWidth="2.4" />)}
        <circle cx="100" cy="21" r="11" fill="#e8654a" />
      </g>
    )
    case 'cowboy': return (
      <g>
        <ellipse cx="100" cy="76" rx="80" ry="15" fill="#8a5a2b" />
        <path d="M66 74 C62 36 80 26 100 30 C120 26 138 36 134 74 Z" fill="#9c6a35" />
        <path d="M66 66 Q100 76 134 66 L134 74 Q100 84 66 74 Z" fill="#4a3018" />
        <path d="M82 40 Q100 48 118 40" fill="none" stroke="#8a5a2b" strokeWidth="3" strokeLinecap="round" />
      </g>
    )
    case 'crown': return (
      <g>
        <path d="M62 68 L60 36 L80 54 L100 26 L120 54 L140 36 L138 68 Z" fill={GOLD} stroke="#b9831a" strokeWidth="2" strokeLinejoin="round" />
        <rect x="62" y="62" width="76" height="9" rx="3" fill="#c98f18" />
        <circle cx="60" cy="35" r="4.5" fill="#e0443a" /><circle cx="100" cy="25" r="5" fill="#2a80d6" /><circle cx="140" cy="35" r="4.5" fill="#e0443a" />
      </g>
    )
    default: return null
  }
}

/** Haustier vorn links im Bild. */
export function PetItem({ item }: { item?: string }) {
  switch (item) {
    case 'dog': return (
      <g>
        <path d="M14 250 C14 232 24 224 38 224 C52 224 62 232 62 250 Z" fill="#b57b45" />
        <ellipse cx="22" cy="206" rx="9" ry="16" fill="#7a4a24" transform="rotate(18 22 206)" />
        <ellipse cx="54" cy="206" rx="9" ry="16" fill="#7a4a24" transform="rotate(-18 54 206)" />
        <circle cx="38" cy="210" r="19" fill="#c78d52" />
        <ellipse cx="38" cy="219" rx="11" ry="8" fill="#f1d9b8" />
        <ellipse cx="38" cy="215" rx="4.5" ry="3.4" fill={DARK} />
        <circle cx="31" cy="205" r="2.6" fill={DARK} /><circle cx="45" cy="205" r="2.6" fill={DARK} />
        <path d="M34 222 Q38 227 42 222" fill="none" stroke={DARK} strokeWidth="1.8" strokeLinecap="round" />
      </g>
    )
    case 'cat': return (
      <g>
        <path d="M14 250 C14 232 24 224 38 224 C52 224 62 232 62 250 Z" fill="#8f98a3" />
        <path d="M20 200 L22 180 L34 194 Z M56 200 L54 180 L42 194 Z" fill="#7a838e" />
        <path d="M23 196 L24 186 L31 194 Z M53 196 L52 186 L45 194 Z" fill="#f0a6b4" />
        <circle cx="38" cy="210" r="19" fill="#a4adb8" />
        <ellipse cx="31" cy="206" rx="3" ry="3.8" fill="#1d1b1a" /><ellipse cx="45" cy="206" rx="3" ry="3.8" fill="#1d1b1a" />
        <path d="M36 213 L40 213 L38 216 Z" fill="#e8869a" />
        <path d="M38 216 Q34 221 30 219 M38 216 Q42 221 46 219" fill="none" stroke={DARK} strokeWidth="1.6" strokeLinecap="round" />
        <path d="M24 214 L12 212 M24 217 L12 220 M52 214 L64 212 M52 217 L64 220" stroke="#e8eeea" strokeWidth="1.4" strokeLinecap="round" />
      </g>
    )
    case 'bunny': return (
      <g>
        <path d="M14 250 C14 234 24 228 38 228 C52 228 62 234 62 250 Z" fill="#f4f1ec" />
        <ellipse cx="29" cy="190" rx="6.5" ry="20" fill="#f4f1ec" transform="rotate(-8 29 190)" />
        <ellipse cx="47" cy="190" rx="6.5" ry="20" fill="#f4f1ec" transform="rotate(8 47 190)" />
        <ellipse cx="29" cy="191" rx="3" ry="14" fill="#f2b3c0" transform="rotate(-8 29 191)" />
        <ellipse cx="47" cy="191" rx="3" ry="14" fill="#f2b3c0" transform="rotate(8 47 191)" />
        <circle cx="38" cy="216" r="17" fill="#f4f1ec" />
        <circle cx="32" cy="213" r="2.4" fill={DARK} /><circle cx="44" cy="213" r="2.4" fill={DARK} />
        <ellipse cx="38" cy="219" rx="3" ry="2.2" fill="#e8869a" />
        <path d="M38 221 L38 224 M38 224 Q34 227 31 225 M38 224 Q42 227 45 225" fill="none" stroke="#b8aea0" strokeWidth="1.5" strokeLinecap="round" />
      </g>
    )
    case 'turtle': return (
      <g>
        <ellipse cx="34" cy="243" rx="25" ry="15" fill="#3f9a5a" />
        <path d="M14 243 Q34 214 54 243 Z" fill="#2d7a45" />
        <path d="M24 236 L44 236 M20 243 L48 243 M34 224 L34 243" stroke="#256a3a" strokeWidth="2" />
        <circle cx="62" cy="238" r="9" fill="#6bb87c" />
        <circle cx="65" cy="236" r="2" fill={DARK} />
        <path d="M60 242 Q64 245 68 242" fill="none" stroke={DARK} strokeWidth="1.4" strokeLinecap="round" />
        <rect x="14" y="248" width="9" height="5" rx="2.5" fill="#6bb87c" /><rect x="44" y="248" width="9" height="5" rx="2.5" fill="#6bb87c" />
      </g>
    )
    case 'fox': return (
      <g>
        <path d="M14 250 C14 232 24 224 38 224 C52 224 62 232 62 250 Z" fill="#d9692a" />
        <path d="M20 202 L20 180 L35 194 Z M56 202 L56 180 L41 194 Z" fill="#c75a1c" />
        <path d="M23 197 L23 187 L31 194 Z M53 197 L53 187 L45 194 Z" fill="#2a2320" />
        <path d="M18 208 Q38 200 58 208 Q56 228 38 232 Q20 228 18 208 Z" fill="#e8772f" />
        <path d="M18 212 Q26 226 38 228 Q50 226 58 212 Q48 224 38 224 Q28 224 18 212 Z" fill="#fbeadb" />
        <circle cx="30" cy="210" r="2.4" fill={DARK} /><circle cx="46" cy="210" r="2.4" fill={DARK} />
        <ellipse cx="38" cy="221" rx="3.6" ry="2.6" fill={DARK} />
      </g>
    )
    default: return null
  }
}
