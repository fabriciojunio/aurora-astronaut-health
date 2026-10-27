import { useId } from 'react'
import { CREW } from '../sim/crew'

interface Props {
  crewId: string
  onChange: (crewId: string) => void
  disabled?: boolean
}

export function CrewPicker({ crewId, onChange, disabled }: Props) {
  const id = useId()
  return (
    <div className="crew-picker">
      <label htmlFor={id}>Recording for</label>
      <select id={id} value={crewId} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        {CREW.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}, {p.role.toLowerCase()}
          </option>
        ))}
      </select>
    </div>
  )
}
