import { anomalyForDay, type DayAnomaly } from '../ai/anomalyMonitor'
import type { AnomalyModel } from '../ai/isolationForest'
import { EVIDENCE } from '../domain/evidence'
import { severityRank, type Alert, type Severity } from '../domain/riskEngine'
import { UNITS, VITAL_KINDS, latestByKind, news2 } from '../domain/vitals'
import { CREW } from '../sim/crew'
import type { CrewDay, ScenarioDay } from '../sim/scenarios'
import { SEVERITY_LABEL, VITAL_LABEL, featureLabel, signed } from './labels'
import type { Loadable } from './useVerifiedData'

interface Props {
  days: readonly ScenarioDay[]
  dayIndex: number
  model: Loadable<AnomalyModel>
  onAsk?: (alert: Alert) => void
}

export function CrewView({ days, dayIndex, model, onAsk }: Props) {
  const day = days[dayIndex]
  if (!day) return null
  return (
    <div className="crew-grid">
      {day.crew.map((crewDay) => (
        <CrewCard key={crewDay.crewId} crewDay={crewDay} days={days} dayIndex={dayIndex} model={model} onAsk={onAsk} />
      ))}
    </div>
  )
}

function worstSeverity(alerts: readonly Alert[]): Severity | undefined {
  return alerts.reduce<Severity | undefined>(
    (worst, a) => (worst === undefined || severityRank(a.severity) > severityRank(worst) ? a.severity : worst),
    undefined,
  )
}

function CrewCard({ crewDay, days, dayIndex, model, onAsk }: Props & { crewDay: CrewDay }) {
  const profile = CREW.find((p) => p.id === crewDay.crewId)
  const latest = latestByKind(crewDay.vitals)
  const score = news2(latest, { newConfusion: false })
  const worst = worstSeverity(crewDay.alerts)
  const headingId = `crew-${crewDay.crewId}`

  return (
    <article className="card crew-card" aria-labelledby={headingId}>
      <header className="crew-head">
        <div>
          <h2 id={headingId}>{profile?.name ?? crewDay.crewId}</h2>
          <p className="muted">{profile?.role}</p>
        </div>
        <span className={`pill ${worst ?? 'ok'}`}>{worst ? SEVERITY_LABEL[worst] : 'No alerts'}</span>
      </header>

      <dl className="vitals">
        {VITAL_KINDS.map((kind) => (
          <div key={kind}>
            <dt>{VITAL_LABEL[kind]}</dt>
            <dd>
              {latest[kind]?.value ?? '–'} <small>{UNITS[kind]}</small>
            </dd>
          </div>
        ))}
      </dl>
      <p className="small">
        <span className="label">NEWS2</span>
        <span className="mono">{score.risk === 'incomplete' ? 'incomplete' : `${score.total} ${score.risk}`}</span>
      </p>

      <AnomalyPanel days={days} dayIndex={dayIndex} crewId={crewDay.crewId} model={model} />

      <h3 className="section-title">Alerts</h3>
      {crewDay.alerts.length === 0 ? (
        <p className="muted">Nothing needs attention.</p>
      ) : (
        <ul className="alerts">
          {crewDay.alerts.map((alert) => (
            <li key={alert.key} className={`alert ${alert.severity}`}>
              <div className="alert-head">
                <span className={`pill ${alert.severity}`}>{SEVERITY_LABEL[alert.severity]}</span>
                <strong>{alert.title}</strong>
              </div>
              <p>{alert.why}</p>
              <p>
                <span className="label">Do now</span> {alert.action}
              </p>
              <details>
                <summary>Sources</summary>
                <ul className="sources">
                  {alert.evidence.map((id) => (
                    <li key={id}>
                      <a href={EVIDENCE[id].url} target="_blank" rel="noopener noreferrer">
                        {EVIDENCE[id].citation}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
              {onAsk && (
                <button type="button" className="link" onClick={() => onAsk(alert)}>
                  Ask the assistant about this alert
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}

function AnomalyPanel({ days, dayIndex, crewId, model }: Omit<Props, 'onAsk'> & { crewId: string }) {
  const result = model.status === 'ready' ? anomalyForDay(model.value, days, crewId, dayIndex) : undefined
  const unusual = result?.status === 'assessed' && result.anomalous
  return (
    <section className={unusual ? 'anomaly unusual' : 'anomaly'} aria-label="Pattern check">
      <h3 className="section-title">
        Pattern check
      </h3>
      <AnomalyText model={model} result={result} />
    </section>
  )
}

function AnomalyText({ model, result }: { model: Loadable<AnomalyModel>; result: DayAnomaly | undefined }) {
  if (model.status === 'loading') return <p className="muted">Loading the model…</p>
  if (model.status === 'error' || !result) {
    return <p>The model file failed its integrity check and is not used. The rules still apply.</p>
  }
  if (result.status === 'baseline') {
    return (
      <p className="muted">
        Learning this person’s normal: {result.daysLeft} {result.daysLeft === 1 ? 'day' : 'days'} left.
      </p>
    )
  }
  if (result.status === 'unavailable') return <p className="muted">Not enough readings to compare today.</p>
  if (!result.anomalous) return <p>Within this person’s usual pattern.</p>
  return (
    <>
      <p>
        <strong>Unusual pattern</strong> in {result.anomalousReadings} of today’s readings. Furthest from this
        person’s normal:
      </p>
      <ul className="drivers" aria-label="Signals furthest from normal">
        {result.result.drivers.map((d) => (
          <li key={d.feature}>
            {featureLabel(d.feature)} <span className="mono">{signed(d.deviation)}</span>
          </li>
        ))}
      </ul>
    </>
  )
}
