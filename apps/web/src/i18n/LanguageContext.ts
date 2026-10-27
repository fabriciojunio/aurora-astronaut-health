import { createContext } from 'react'
import type { Lang } from './messages'

export const STORAGE_KEY = 'aurora.lang'

export interface LanguageState {
  lang: Lang
  setLang: (lang: Lang) => void
}

export const LanguageContext = createContext<LanguageState>({ lang: 'en', setLang: () => {} })

// The choice is a per-viewer convenience, so browser storage is enough; it can be unavailable
// (private mode, blocked site data), and then English is used.
export function storedLang(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'pt' ? 'pt' : 'en'
  } catch {
    return 'en'
  }
}

export function storeLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // Not remembered; the switch still works for this visit.
  }
}
