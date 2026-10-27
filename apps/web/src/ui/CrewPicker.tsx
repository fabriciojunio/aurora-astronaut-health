import { useId } from 'react'
import { roleName } from '../i18n/content'
import { useI18n } from '../i18n/useI18n'
import { CREW } from '../sim/crew'

interface Props {
  crewId: string
  onChange: (crewId: string) => void
  disabled?: boolean
}

export function CrewPicker({ crewId, onChange, disabled }: Props) {
  const { t, lang } = useI18n()
  const id = useId()
  return (
    <div className="crew-picker">
      <label htmlFor={id}>{t('picker.label')}</label>
      <select id={id} value={crewId} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        {CREW.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}, {roleName(p.role, lang).toLowerCase()}
          </option>
        ))}
      </select>
    </div>
  )
}
