import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ThemeProvider } from './hooks/useTheme'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/coaching-app/sw.js').catch(() => {})
  })
  // Tipp auf eine Push-Nachricht, während die App offen ist: zur gemeinten Seite springen
  navigator.serviceWorker.addEventListener('message', (ev) => {
    if (ev.data?.type !== 'hlx-navigate' || typeof ev.data.url !== 'string') return
    try {
      const hash = new URL(ev.data.url, window.location.href).hash
      if (hash) window.location.hash = hash
    } catch { /* ungültige Adresse ignorieren */ }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
