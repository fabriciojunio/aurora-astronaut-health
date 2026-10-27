import { LANGS } from './messages'
import { useI18n } from './useI18n'

const NAMES = { en: 'EN', pt: 'PT' } as const
const FULL = { en: 'English', pt: 'Português' } as const

export function LanguageSwitch() {
  const { lang, setLang, t } = useI18n()
  return (
    <div className="lang-switch" role="group" aria-label={t('lang.switch')}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          lang={l === 'pt' ? 'pt-BR' : 'en'}
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
        >
          {NAMES[l]}
          {/* Spoken as "PT Português": the visible label stays in the name (WCAG 2.5.3). */}
          <span className="visually-hidden"> {FULL[l]}</span>
        </button>
      ))}
    </div>
  )
}
