import { useEffect, useId, useState, type FormEvent } from 'react'
import { anomalyForReadings } from '../ai/liveAnomaly'
import type { AnomalyModel } from '../ai/isolationForest'
import type { CheckIn } from '../domain/checkin'
import { evaluate, type Alert } from '../domain/riskEngine'
import { PLAUSIBLE, VITAL_KINDS, type VitalKind } from '../domain/vitals'
import { localNumber, unitName, vitalName } from '../i18n/content'
import type { MessageKey } from '../i18n/messages'
import { useI18n } from '../i18n/useI18n'
import { SEED_DAYS, loadSnapshots, saveSnapshot, seedBaseline, toReadings, vitalSnapshotSchema, type VitalSnapshot } from '../live/records'
import { CREW } from '../sim/crew'
import type { Vault } from '../storage/vault'
import { CrewPicker } from './CrewPicker'
import { HealthCard } from './HealthCard'
import type { SavedPvt } from './PvtView'
import type { Loadable } from './useVerifiedData'

interface Props {
  vault: Vault
  crewId: string
  onCrewChange: (crewId: string) => void
  model: Loadable<AnomalyModel>
  onAsk?: (alert: Alert) => void
  now?: () => Date
}

type Draft = Record<VitalKind, string>

const EMPTY: Draft = Object.fromEntries(VITAL_KINDS.map((k) => [k, ''])) as Draft

// Blank stays blank: an empty field must never be read as zero.
const toNumber = (text: string) => (text.trim() === '' ? Number.NaN : Number(text.replace(',', '.')))

/** Real use: the astronaut's own readings, judged by the same rules and model as the simulation. */
export function MyHealthView({ vault, crewId, onCrewChange, model, onAsk, now = () => new Date() }: Props) {
  const { t, lang } = useI18n()
  const ids = useId()
  const [snapshots, setSnapshots] = useState<VitalSnapshot[]>([])
  const [checkIns, setCheckIns] = useState<CheckIn[]>([])
  const [pvt, setPvt] = useState<SavedPvt[]>([])
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [invalid, setInvalid] = useState<Set<VitalKind>>(new Set())
  const [status, setStatus] = useState<{ key: MessageKey; n?: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [clock, setClock] = useState(now)

  useEffect(() => {
    let active = true
    Promise.all([loadSnapshots(vault, crewId), vault.list<CheckIn>('checkins'), vault.list<SavedPvt>('pvt')]).then(
      ([s, c, p]) => {
        if (!active) return
        setSnapshots(s)
        setCheckIns(c.filter((x) => x.crewId === crewId))
        setPvt(p.filter((x) => x.crewId === crewId))
      },
    )
    return () => {
      active = false
    }
  }, [vault, crewId])

  const readings = snapshots.flatMap(toReadings)
  const alerts = evaluate({ crewId, now: clock, vitals: readings, checkIns, pvt: pvt.map((p) => ({ at: p.at, result: p.result })) })
  const anomaly = model.status === 'ready' ? anomalyForReadings(model.value, readings, clock) : undefined
  const profile = CREW.find((p) => p.id === crewId)

  function fillUsual() {
    if (!profile) return
    setDraft(Object.fromEntries(VITAL_KINDS.map((k) => [k, String(profile.baseline[k].mean)])) as Draft)
    setInvalid(new Set())
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    setStatus(null)
    const at = now()
    const values = Object.fromEntries(VITAL_KINDS.map((k) => [k, toNumber(draft[k])]))
    const parsed = vitalSnapshotSchema.safeParse({ crewId, at: at.toISOString(), source: 'manual', values })
    if (!parsed.success) {
      setInvalid(new Set(parsed.error.issues.map((i) => i.path[1]).filter((k): k is VitalKind => VITAL_KINDS.includes(k as VitalKind))))
      setStatus({ key: 'live.invalid' })
      return
    }
    setInvalid(new Set())
    setBusy(true)
    try {
      const saved = await saveSnapshot(vault, parsed.data)
      setSnapshots((list) => [...list, saved])
      setClock(at)
      setDraft(EMPTY)
      setStatus({ key: 'live.saved' })
    } catch {
      setStatus({ key: 'live.failed' })
    } finally {
      setBusy(false)
    }
  }

  async function seed() {
    setBusy(true)
    setStatus(null)
    try {
      const n = await seedBaseline(vault, crewId, now())
      setSnapshots(await loadSnapshots(vault, crewId))
      setClock(now())
      setStatus({ key: 'live.seeded', n })
    } catch {
      setStatus({ key: 'live.failed' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="live-grid">
      <div className="stack">
        <form className="card" onSubmit={save} noValidate aria-labelledby={`${ids}-record`}>
          <h2 id={`${ids}-record`}>{t('live.record')}</h2>
          <CrewPicker crewId={crewId} onChange={onCrewChange} disabled={busy} />
          <div className="form-grid">
            {VITAL_KINDS.map((kind) => (
              <div key={kind}>
                <label htmlFor={`${ids}-${kind}`}>
                  {vitalName(kind, lang)} <span className="muted small">({unitName(kind, lang)})</span>
                </label>
                <input
                  id={`${ids}-${kind}`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={draft[kind]}
                  onChange={(e) => setDraft((d) => ({ ...d, [kind]: e.target.value }))}
                  aria-invalid={invalid.has(kind) ? true : undefined}
                  aria-describedby={`${ids}-${kind}-range`}
                />
                <p id={`${ids}-${kind}-range`} className="muted small">
                  {t('live.range', { min: localNumber(PLAUSIBLE[kind][0], lang), max: localNumber(PLAUSIBLE[kind][1], lang) })}
                </p>
              </div>
            ))}
          </div>
          <p className="form-status" role="status">
            {status && t(status.key, { n: status.n ?? 0 })}
          </p>
          <div className="button-row">
            <button type="submit" className="primary" disabled={busy}>
              {busy ? t('live.saving') : t('live.save')}
            </button>
            <button type="button" onClick={fillUsual} disabled={busy}>
              {t('live.fillUsual')}
            </button>
          </div>
        </form>

        {anomaly?.status === 'baseline' && (
          <section className="card" aria-labelledby={`${ids}-seed`}>
            <h2 id={`${ids}-seed`}>{t('pattern.title')}</h2>
            <p>{t('live.needsBaseline', { days: SEED_DAYS })}</p>
            <button type="button" onClick={() => void seed()} disabled={busy}>
              {t('live.seed', { days: SEED_DAYS })}
            </button>
            <p className="muted small">{t('live.seedNote')}</p>
          </section>
        )}

        <section className="card" aria-labelledby={`${ids}-history`}>
          <h2 id={`${ids}-history`}>{t('live.history')}</h2>
          {snapshots.length === 0 ? (
            <p className="muted">{t('live.empty')}</p>
          ) : (
            <table className="audit">
              <thead>
                <tr>
                  <th scope="col">{t('live.colTime')}</th>
                  <th scope="col">{t('live.colSource')}</th>
                  <th scope="col">{vitalName('temperature', lang)}</th>
                  <th scope="col">{vitalName('heartRate', lang)}</th>
                  <th scope="col">SpO2</th>
                </tr>
              </thead>
              <tbody>
                {[...snapshots].reverse().slice(0, 12).map((s) => (
                  <tr key={s.at}>
                    <td>{s.at.slice(0, 16).replace('T', ' ')}</td>
                    <td>{s.source === 'manual' ? t('live.manual') : t('live.simulated')}</td>
                    <td>{localNumber(s.values.temperature, lang)}</td>
                    <td>{s.values.heartRate}</td>
                    <td>{localNumber(s.values.spo2, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <HealthCard crewId={crewId} vitals={readings} alerts={alerts} anomaly={anomaly} model={model} onAsk={onAsk} live />
    </div>
  )
}
