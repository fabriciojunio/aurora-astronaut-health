import { useEffect, useId, useState, type FormEvent } from 'react'
import { SYMPTOMS, checkInSchema, type CheckIn, type Symptom } from '../domain/checkin'
import { evaluate, type Alert } from '../domain/riskEngine'
import { CREW } from '../sim/crew'
import { appendAudit } from '../storage/auditTrail'
import type { Vault } from '../storage/vault'
import { CrewPicker } from './CrewPicker'
import { alertText, severityName, symptomName } from '../i18n/content'
import type { MessageKey } from '../i18n/messages'
import { useI18n } from '../i18n/useI18n'

interface Props {
  vault: Vault
  crewId: string
  onCrewChange: (crewId: string) => void
  now?: () => Date
}

const SCALES = [
  { key: 'sleepQuality', label: 'checkin.sleepQuality', range: 'checkin.scaleSleep' },
  { key: 'mood', label: 'checkin.mood', range: 'checkin.scaleMood' },
  { key: 'stress', label: 'checkin.stress', range: 'checkin.scaleStress' },
] as const satisfies readonly { key: string; label: MessageKey; range: MessageKey }[]

const NUMBERS = [
  { key: 'sleepHours', label: 'checkin.sleepHours', step: 0.5, max: 16 },
  { key: 'hydrationMl', label: 'checkin.hydration', step: 100, max: 8000 },
  { key: 'resistanceMin', label: 'checkin.resistance', step: 5, max: 300 },
  { key: 'aerobicMin', label: 'checkin.aerobic', step: 5, max: 300 },
] as const satisfies readonly { key: string; label: MessageKey; step: number; max: number }[]

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
  const { t, lang } = useI18n()
  const [errors, setErrors] = useState<Record<string, MessageKey>>({})
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<MessageKey | null>(null)
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
    setStatus(null)
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
      const fieldErrors: Record<string, MessageKey> = {}
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? 'form')
        fieldErrors[field] ??= field === 'note' ? 'checkin.noteError' : 'checkin.numberError'
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
      setStatus('checkin.saved')
    } catch {
      setStatus('checkin.failed')
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
        <h2 id={`${formId}-title`}>{t('checkin.title')}</h2>
        <CrewPicker crewId={crewId} onChange={onCrewChange} disabled={saving} />

        <div className="form-grid">
          {NUMBERS.map((n) => (
            <div key={n.key}>
              <label htmlFor={`${formId}-${n.key}`}>{t(n.label)}</label>
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
                  {t(errors[n.key]!)}
                </p>
              )}
            </div>
          ))}
        </div>

        {SCALES.map((scale) => (
          <fieldset key={scale.key} className="scale">
            <legend>
              {t(scale.label)} <span className="muted small">{t(scale.range)}</span>
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
          <legend>{t('checkin.symptoms')}</legend>
          {SYMPTOMS.map((s) => (
            <label key={s}>
              <input type="checkbox" checked={draft.symptoms.includes(s)} onChange={() => toggleSymptom(s)} />
              {symptomName(s, lang)}
            </label>
          ))}
        </fieldset>

        <label htmlFor={noteId}>{t('checkin.note')}</label>
        <textarea
          id={noteId}
          rows={3}
          maxLength={500}
          value={draft.note}
          onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
          aria-describedby={`${noteId}-hint`}
        />
        <p id={`${noteId}-hint`} className="muted small">
          {t('checkin.noteHint')}
        </p>

        <p className="form-status" role="status">
          {status && t(status)}
        </p>
        <button type="submit" className="primary" disabled={saving}>
          {saving ? t('checkin.saving') : t('checkin.save')}
        </button>
      </form>

      {alerts.length > 0 && (
        <section className="card" aria-labelledby={`${formId}-alerts`}>
          <h2 id={`${formId}-alerts`}>{t('checkin.fromYours')}</h2>
          <ul className="alerts">
            {alerts.map((a) => (
              <li key={a.key} className={`alert ${a.severity}`}>
                <div className="alert-head">
                  <span className={`pill ${a.severity}`}>{severityName(a.severity, lang)}</span>
                  <strong>{alertText(a, lang).title}</strong>
                </div>
                <p>{alertText(a, lang).action}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="muted small">
        {history.length === 1
          ? t('checkin.countOne', { name: profile?.name ?? crewId })
          : t('checkin.count', { n: history.length, name: profile?.name ?? crewId })}
      </p>
    </div>
  )
}
