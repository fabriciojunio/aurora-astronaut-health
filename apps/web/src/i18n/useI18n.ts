import { useContext } from 'react'
import { LanguageContext } from './LanguageContext'
import { MESSAGES, format, type MessageKey } from './messages'

export function useI18n() {
  const { lang, setLang } = useContext(LanguageContext)
  const t = (key: MessageKey, vars?: Record<string, string | number>) => format(MESSAGES[lang][key], vars)
  return { lang, setLang, t }
}
