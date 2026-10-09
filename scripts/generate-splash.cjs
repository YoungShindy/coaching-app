// Erzeugt die iOS-Startbilder (apple-touch-startup-image) für die als Web-App gespeicherte Startseite.
// Aufruf: npm run splash
//
// iOS zeigt beim Start einer Web-App zuerst ein statisches Bild (weiß, wenn keins hinterlegt ist).
// Die Startanimation in index.html beginnt auf einfarbigem Markengrün, deshalb sind diese Bilder
// einfarbig: Der Übergang vom Systemstartbild in die Animation bleibt ohne Blitz.
// Gibt die passenden <link>-Zeilen für index.html aus.
const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const BRAND = '#075640'
const OUT_DIR = path.join(__dirname, '..', 'public', 'splash')

// CSS-Pixel (Breite x Höhe) und Pixeldichte der gängigen iPhones im Hochformat
const DEVICES = [
  { w: 440, h: 956, dpr: 3, name: 'iPhone 16 Pro Max' },
  { w: 430, h: 932, dpr: 3, name: 'iPhone 14/15/16 Plus & Pro Max' },
  { w: 428, h: 926, dpr: 3, name: 'iPhone 12/13 Pro Max, 14 Plus' },
  { w: 402, h: 874, dpr: 3, name: 'iPhone 16 Pro' },
  { w: 393, h: 852, dpr: 3, name: 'iPhone 14 Pro, 15, 15 Pro, 16' },
  { w: 390, h: 844, dpr: 3, name: 'iPhone 12/13/14, 12/13 Pro' },
  { w: 414, h: 896, dpr: 3, name: 'iPhone XS Max, 11 Pro Max' },
  { w: 414, h: 896, dpr: 2, name: 'iPhone XR, 11' },
  { w: 375, h: 812, dpr: 3, name: 'iPhone X, XS, 11 Pro, 12/13 mini' },
  { w: 375, h: 667, dpr: 2, name: 'iPhone SE (2./3. Gen.), 8' },
]

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const links = []
  for (const d of DEVICES) {
    const pw = d.w * d.dpr
    const ph = d.h * d.dpr
    const file = `ios-${pw}x${ph}.png`
    await sharp({ create: { width: pw, height: ph, channels: 3, background: BRAND } })
      .png({ compressionLevel: 9, palette: true })
      .toFile(path.join(OUT_DIR, file))
    links.push(
      `    <link rel="apple-touch-startup-image" href="/coaching-app/splash/${file}" ` +
        `media="(device-width: ${d.w}px) and (device-height: ${d.h}px) and (-webkit-device-pixel-ratio: ${d.dpr}) and (orientation: portrait)" /> <!-- ${d.name} -->`,
    )
  }
  console.log(links.join('\n'))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
