import './zodConfig.ts'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-sans-condensed/latin-500.css'
import '@fontsource/ibm-plex-sans-condensed/latin-600.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import './styles.css'
import App from './App.tsx'
import { registerServiceWorker } from './registerServiceWorker.ts'

if (import.meta.env.PROD) registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
