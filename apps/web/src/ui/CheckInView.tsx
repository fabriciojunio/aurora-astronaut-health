import { useEffect, useId, useState, type FormEvent } from 'react'
import { SYMPTOMS, checkInSchema, type CheckIn, type Symptom } from '../domain/checkin'
import { evaluate, type Alert } from '../domain/riskEngine'
import { CREW } from '../sim/crew'
import { appendAudit } from '../storage/auditTrail'
import type { Vault } from '../storage/vault'
import { CrewPicker } from './CrewPicker'
import { SEVERITY_LABEL, SYMPTOM_LABEL } from './labels'

interface Props {
  vault: Vault
  crewId: string
  onCrewChange: (crewId: string) => void
  now?: () => Date
}

const SCALES = [
  { key: 'sleepQuality', label: 'Sleep quality', low: 'very poor', high: 'very good' },
  { key: 'mood', label: 'Mood', low: 'very low', high: 'very good' },
  { key: 'stress', label: 'Stress', low: 'none', high: 'very high' },
] as const

const NUMBERS = [
  { key: 'sleepHours', label: 'Sleep last night (hours)', step: 0.5, max: 16 },
  { key: 'hydrationMl', label: 'Fluids yesterday (ml)', step: 100, max: 8000 },
  { key: 'resistanceMin', label: 'Resistance exercise (min)', step: 5, max: 300 },
  { key: 'aerobicMin', label: 'Aerobic exercise (min)', step: 5, max: 300 },
] as const

type Draft = {
  sleepHours: string
  hydrationMl: string
  resistanceMin: string
  aerobicMin: string
  sleepQuality: number
  mood: number
  stress: number
  symptoms: Symptom[]
  note: string
}

const EMPTY: Draft = {
  sleepHours: '',
  hydrationMl: '',
  resistanceMin: '',
  aerobicMin: '',
  sleepQuality: 3,
  mood: 3,
  stress: 2,
  symptoms: [],
  note: '',
}

// Blank number fields stay blank: an empty box must never be read as zero hours of sleep.
const toNumber = (text: string) => (text.trim() === '' ? Number.NaN : Number(text))

export function CheckInView({ vault, crewId, onCrewChange, now = () => new Date() }: Props) {
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [history, setHistory] = useState<CheckIn[]>([])
  const noteId = useId()
  const formId = useId()

  useEffect(() => {
    let active = true
    vault.list<CheckIn>('checkins').then((all) => active && setHistory(all.filter((c) => c.crewId === crewId)))
    return () => {
      active = false
    }
  }, [vault, crewId])

  const profile = CREW.find((p) => p.id === crewId)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setStatus('')
    const parsed = checkInSchema.safeParse({
      crewId,
      at: now().toISOString(),
      sleepHours: toNumber(draft.sleepHours),
      sleepQuality: draft.sleepQuality,
      mood: draft.mood,
      stress: draft.stress,
      symptoms: draft.symptoms,
      hydrationMl: toNumber(draft.hydrationMl),
      resistanceMin: toNumber(draft.resistanceMin),
      aerobicMin: toNumber(draft.aerobicMin),
      prescribedResistanceMin: profile?.prescribedResistanceMin ?? 60,
      prescribedAerobicMin: 30,
      note: draft.note,
    })
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? 'form')
        fieldErrors[field] ??= field === 'note' ? 'Keep the note under 500 characters.' : 'Enter a number in the allowed range.'
      }
      setErrors(fieldErrors)
      return
    }
    setErrors({})
    setSaving(true)
    try {
      const checkIn = parsed.data
      await vault.put('checkins', `${crewId}:${checkIn.at}`, checkIn)
      // The audit entry records that a check-in happened, never what it says.
      await appendAudit(vault, { actor: crewId, action: 'checkin.saved', detail: { at: checkIn.at } })
      const all = [...history, checkIn]
      setHistory(all)
      setAlerts(
        evaluate({ crewId, now: now(), vitals: [], checkIns: all, pvt: [] }).filter((a) => a.area !== 'clinical'),
      )
      setDraft(EMPTY)
      setStatus('Saved encrypted on this device.')
    } catch {
      setStatus('The check-in could not be saved. Nothing was stored.')
    } finally {
      setSaving(false)
    }
  }

  const toggleSymptom = (symptom: Symptom) =>
    setDraft((d) => ({
      ...d,
      symptoms: d.symptoms.includes(symptom) ? d.symptoms.filter((s) => s !== symptom) : [...d.symptoms, symptom],
    }))

  return (
    <div className="stack">
      <form className="card" onSubmit={submit} noValidate aria-labelledby={`${formId}-title`}>
        <h2 id={`${formId}-title`}>Daily check-in</h2>
        <CrewPicker crewId={crewId} onChange={onCrewChange} disabled={saving} />

        <div className="form-grid">
          {NUMBERS.map((n) => (
            <div key={n.key}>
              <label htmlFor={`${formId}-${n.key}`}>{n.label}</label>
              <input
                id={`${formId}-${n.key}`}
                type="number"
                inputMode="decimal"
                min={0}
                max={n.max}
                step={n.step}
                value={draft[n.key]}
                onChange={(e) => setDraft((d) => ({ ...d, [n.key]: e.target.value }))}
                aria-invalid={errors[n.key] ? true : undefined}
                aria-describedby={errors[n.key] ? `${formId}-${n.key}-error` : undefined}
              />
              {errors[n.key] && (
                <p id={`${formId}-${n.key}-error`} className="field-error">
                  {errors[n.key]}
                </p>
              )}
            </div>
          ))}
        </div>

        {SCALES.map((scale) => (
          <fieldset key={scale.key} className="scale">
            <legend>
              {scale.label} <span className="muted small">1 {scale.low}, 5 {scale.high}</span>
            </legend>
            {[1, 2, 3, 4, 5].map((v) => (
              <label key={v}>
                <input
                  type="radio"
                  name={`${formId}-${scale.key}`}
                  value={v}
                  checked={draft[scale.key] === v}
                  onChange={() => setDraft((d) => ({ ...d, [scale.key]: v }))}
                />
                {v}
              </label>
            ))}
          </fieldset>
        ))}

        <fieldset className="symptoms">
          <legend>Symptoms since yesterday</legend>
          {SYMPTOMS.map((s) => (
            <label key={s}>
              <input type="checkbox" checked={draft.symptoms.includes(s)} onChange={() => toggleSymptom(s)} />
              {SYMPTOM_LABEL[s]}
            </label>
          ))}
        </fieldset>

        <label htmlFor={noteId}>Note (optional)</label>
        <textarea
          id={noteId}
          rows={3}
          maxLength={500}
          value={draft.note}
          onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
          aria-describedby={`${noteId}-hint`}
        />
        <p id={`${noteId}-hint`} className="muted small">
          Stored encrypted. Notes are never read by the alert rules or the assistant, and are not shared unless you
          allow it.
        </p>

        <p className="form-status" role="status">
          {status}
        </p>
        <button type="submit" className="primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save check-in'}
        </button>
      </form>

      {alerts.length > 0 && (
        <section className="card" aria-labelledby={`${formId}-alerts`}>
          <h2 id={`${formId}-alerts`}>From your check-ins</h2>
          <ul className="alerts">
            {alerts.map((a) => (
              <li key={a.key} className={`alert ${a.severity}`}>
                <div className="alert-head">
                  <span className={`pill ${a.severity}`}>{SEVERITY_LABEL[a.severity]}</span>
                  <strong>{a.title}</strong>
                </div>
                <p>{a.action}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="muted small">
        {history.length} {history.length === 1 ? 'check-in' : 'check-ins'} stored for {profile?.name ?? crewId}.
      </p>
    </div>
  )
}
