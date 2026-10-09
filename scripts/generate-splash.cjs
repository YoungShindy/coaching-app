// Erzeugt die Systemstartbilder für iPhone/iPad (apple-touch-startup-image) und Android (APK).
// Aufruf: npm run splash
//
// iOS zeigt beim Start einer Web-App zuerst ein statisches Bild (weiß, wenn keins hinterlegt ist), die Android-App
// zeigt vor dem Laden der Seite den System-Startbildschirm. Die Startanimation in index.html beginnt mit der
// kompakten Hantel des HLX-Logos mittig auf Markengrün. Diese Bilder zeigen exakt dieses erste Bild (gleiche Größe
// und Position wie in der Animation), damit der Übergang in die Animation ohne Sprung bleibt.
// Schreibt public/splash/ios-*.png und android/app/src/main/res/drawable-*/splash_logo.png und gibt die passenden
// <link>-Zeilen für index.html aus.
const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const BRAND = '#075640'

// Nachgezeichnetes Hantel-Logo (scripts/hlx-logo.json) und Skalierung des ersten Bildes der Animation
const LOGO = require('./hlx-logo.json')
const ART_UNITS = 360 // Breite der SVG-Zeichenfläche in index.html
// Breite der Zeichenfläche wie in index.html: min(94vw, max(420px, 50vmin), 720px, 120vh)
const ART_VW = 0.94
const ART_MIN_CSS = 420
const ART_VMIN = 0.5
const ART_MAX_CSS = 720
const ART_VH = 1.2
const PUSH_START = 0.94 // Startgröße des Push-Ins
const OUT_DIR = path.join(__dirname, '..', 'public', 'splash')
const ANDROID_RES = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res')
const ANDROID_REF_DP = 390 // Referenzbreite eines Handys in dp für das Android-Startbild
const ANDROID_ICON_DP = 288 // Fläche des System-Startbildschirms (Android 12+: Kreis mit 192 dp darin)
const art = (vw, vh) => Math.min(ART_VW * vw, Math.max(ART_MIN_CSS, ART_VMIN * Math.min(vw, vh)), ART_MAX_CSS, ART_VH * vh)

// Hantel (kompakt) als SVG-Gruppe in Einheiten der Zeichenfläche; Mitte der Zeichenfläche = (180, 200)
function barbell(px, centerX, centerY) {
  const [tx, ty] = LOGO.t0
  return (
    `<g transform="translate(${centerX} ${centerY}) scale(${px}) translate(-180 -200)">` +
    `<g transform="translate(${tx} ${ty}) scale(${LOGO.k})" fill="#fff" fill-rule="evenodd">` +
    `<path transform="translate(${LOGO.dx} 0)" d="${LOGO.left}"/><path transform="translate(${-LOGO.dx} 0)" d="${LOGO.right}"/>` +
    `</g></g>`
  )
}

// Android: quadratisches Bild (288 dp), Hantel in der Größe des ersten Animationsbildes auf einem 390-dp-Handy.
// Dient als Symbol des System-Startbildschirms (Android 12+ und androidx-Kompatibilität) und als Fensterhintergrund.
async function androidImages() {
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
  for (const [name, f] of Object.entries(dens)) {
    const size = Math.round(ANDROID_ICON_DP * f)
    const u = (art(ANDROID_REF_DP, 844) / ART_UNITS) * PUSH_START * f
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${barbell(u, size / 2, size / 2)}</svg>`
    const dir = path.join(ANDROID_RES, `drawable-${name}`)
    fs.mkdirSync(dir, { recursive: true })
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toFile(path.join(dir, 'splash_logo.png'))
  }
}

// CSS-Pixel (Breite x Höhe im Hochformat) und Pixeldichte der gängigen iPhones
const PHONES = [
  { w: 440, h: 956, dpr: 3, name: 'iPhone 16 Pro Max' },
  { w: 430, h: 932, dpr: 3, name: 'iPhone 14/15/16 Plus & Pro Max' },
  { w: 428, h: 926, dpr: 3, name: 'iPhone 12/13 Pro Max, 14 Plus' },
  { w: 402, h: 874, dpr: 3, name: 'iPhone 16 Pro' },
  { w: 393, h: 852, dpr: 3, name: 'iPhone 14 Pro, 15, 15 Pro, 16' },
  { w: 390, h: 844, dpr: 3, name: 'iPhone 12/13/14, 12/13 Pro' },
  { w: 414, h: 896, dpr: 3, name: 'iPhone XS Max, 11 Pro Max' },
  { w: 414, h: 896, dpr: 2, name: 'iPhone XR, 11' },
  { w: 420, h: 912, dpr: 3, name: 'iPhone Air' },
  { w: 375, h: 812, dpr: 3, name: 'iPhone X, XS, 11 Pro' },
  { w: 360, h: 780, dpr: 3, name: 'iPhone 12/13 mini' },
  { w: 414, h: 736, dpr: 3, name: 'iPhone 6/7/8 Plus' },
  { w: 375, h: 667, dpr: 2, name: 'iPhone SE (2./3. Gen.), 8' },
]

// iPads gibt es im Hoch- und Querformat, in Safari bleiben device-width/-height die Hochformat-Maße
const TABLETS = [
  { w: 744, h: 1133, dpr: 2, name: 'iPad mini (6./7. Gen.)' },
  { w: 768, h: 1024, dpr: 2, name: 'iPad 9,7", iPad mini 4/5' },
  { w: 810, h: 1080, dpr: 2, name: 'iPad 10,2"' },
  { w: 820, h: 1180, dpr: 2, name: 'iPad 10,9" (10. Gen.), iPad Air 10,9"/11"' },
  { w: 834, h: 1112, dpr: 2, name: 'iPad Pro 10,5", iPad Air 3' },
  { w: 834, h: 1194, dpr: 2, name: 'iPad Pro 11"' },
  { w: 834, h: 1210, dpr: 2, name: 'iPad Pro 11" (M4)' },
  { w: 1024, h: 1366, dpr: 2, name: 'iPad Pro 12,9", iPad Air 13"' },
  { w: 1032, h: 1376, dpr: 2, name: 'iPad Pro 13" (M4)' },
]

const DEVICES = [
  ...PHONES.map((d) => ({ ...d, orient: 'portrait' })),
  ...TABLETS.flatMap((d) => [
    { ...d, orient: 'portrait' },
    { ...d, orient: 'landscape' },
  ]),
]

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const links = []
  for (const d of DEVICES) {
    const landscape = d.orient === 'landscape'
    const vw = landscape ? d.h : d.w // sichtbare Breite/Höhe der Seite in CSS-Pixeln
    const vh = landscape ? d.w : d.h
    const pw = vw * d.dpr
    const ph = vh * d.dpr
    const file = `ios-${pw}x${ph}.png`
    // px je Einheit der Zeichenfläche; Bildmitte entspricht der Mitte (180, 200) der Zeichenfläche
    const u = (art(vw, vh) / ART_UNITS) * d.dpr * PUSH_START
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}"><rect width="100%" height="100%" fill="${BRAND}"/>` +
      barbell(u, pw / 2, ph / 2) +
      `</svg>`
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toFile(path.join(OUT_DIR, file))
    links.push(
      `    <link rel="apple-touch-startup-image" href="/coaching-app/splash/${file}" ` +
        `media="(device-width: ${d.w}px) and (device-height: ${d.h}px) and (-webkit-device-pixel-ratio: ${d.dpr}) and (orientation: ${d.orient})" /> <!-- ${d.name}${landscape ? ', Querformat' : ''} -->`,
    )
  }
  await androidImages()
  console.log(links.join('\n'))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
