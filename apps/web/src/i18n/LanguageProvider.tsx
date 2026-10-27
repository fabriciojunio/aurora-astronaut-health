import { useEffect, useState, type ReactNode } from 'react'
import { LanguageContext, storeLang, storedLang } from './LanguageContext'
import type { Lang } from './messages'

export function LanguageProvider({ children, initial }: { children: ReactNode; initial?: Lang }) {
  const [lang, setLangState] = useState<Lang>(() => initial ?? storedLang())

  useEffect(() => {
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en'
  }, [lang])

  function setLang(next: Lang) {
    storeLang(next)
    setLangState(next)
  }

  return <LanguageContext.Provider value={{ lang, setLang }}>{children}</LanguageContext.Provider>
}
