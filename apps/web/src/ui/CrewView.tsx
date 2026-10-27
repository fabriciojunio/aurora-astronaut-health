import { anomalyForDay, type DayAnomaly } from '../ai/anomalyMonitor'
import type { AnomalyModel } from '../ai/isolationForest'
import { EVIDENCE } from '../domain/evidence'
import { severityRank, type Alert, type Severity } from '../domain/riskEngine'
import { VITAL_KINDS, latestByKind, news2 } from '../domain/vitals'
import { CREW } from '../sim/crew'
import type { CrewDay, ScenarioDay } from '../sim/scenarios'
import { alertText, featureName, localNumber, riskName, roleName, severityName, unitName, vitalName } from '../i18n/content'
import { useI18n } from '../i18n/useI18n'
import { signed } from './labels'
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
  const { t, lang } = useI18n()
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
          <p className="muted">{profile && roleName(profile.role, lang)}</p>
        </div>
        <span className={`pill ${worst ?? 'ok'}`}>{worst ? severityName(worst, lang) : t('crew.noAlerts')}</span>
      </header>

      <dl className="vitals">
        {VITAL_KINDS.map((kind) => (
          <div key={kind}>
            <dt>{vitalName(kind, lang)}</dt>
            <dd>
              {latest[kind] ? localNumber(latest[kind].value, lang) : '–'} <small>{unitName(kind, lang)}</small>
            </dd>
          </div>
        ))}
      </dl>
      <p className="small">
        <span className="label">NEWS2</span>
        <span className="mono">{score.risk === 'incomplete' ? t('crew.news2Incomplete') : `${score.total} ${riskName(score.risk, lang)}`}</span>
      </p>

      <AnomalyPanel days={days} dayIndex={dayIndex} crewId={crewDay.crewId} model={model} />

      <h3 className="section-title">{t('crew.alerts')}</h3>
      {crewDay.alerts.length === 0 ? (
        <p className="muted">{t('crew.nothing')}</p>
      ) : (
        <ul className="alerts">
          {crewDay.alerts.map((alert) => {
            const text = alertText(alert, lang)
            return (
            <li key={alert.key} className={`alert ${alert.severity}`}>
              <div className="alert-head">
                <span className={`pill ${alert.severity}`}>{severityName(alert.severity, lang)}</span>
                <strong>{text.title}</strong>
              </div>
              <p>{text.why}</p>
              <p>
                <span className="label">{t('crew.doNow')}</span> {text.action}
              </p>
              <details>
                <summary>{t('crew.sources')}</summary>
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
                  {t('crew.ask')}
                </button>
              )}
            </li>
            )
          })}
        </ul>
      )}
    </article>
  )
}

function AnomalyPanel({ days, dayIndex, crewId, model }: Omit<Props, 'onAsk'> & { crewId: string }) {
  const result = model.status === 'ready' ? anomalyForDay(model.value, days, crewId, dayIndex) : undefined
  const unusual = result?.status === 'assessed' && result.anomalous
  const { t } = useI18n()
  return (
    <section className={unusual ? 'anomaly unusual' : 'anomaly'} aria-label={t('pattern.title')}>
      <h3 className="section-title">{t('pattern.title')}</h3>
      <AnomalyText model={model} result={result} />
    </section>
  )
}

function AnomalyText({ model, result }: { model: Loadable<AnomalyModel>; result: DayAnomaly | undefined }) {
  const { t, lang } = useI18n()
  if (model.status === 'loading') return <p className="muted">{t('pattern.loading')}</p>
  if (model.status === 'error' || !result) return <p>{t('pattern.failed')}</p>
  if (result.status === 'baseline') {
    return (
      <p className="muted">
        {result.daysLeft === 1 ? t('pattern.learningOne') : t('pattern.learning', { n: result.daysLeft })}
      </p>
    )
  }
  if (result.status === 'unavailable') return <p className="muted">{t('pattern.unavailable')}</p>
  if (!result.anomalous) return <p>{t('pattern.normal')}</p>
  return (
    <>
      <p>
        <strong>{t('pattern.unusual')}</strong> {t('pattern.unusualRest', { n: result.anomalousReadings })}
      </p>
      <ul className="drivers" aria-label={t('pattern.drivers')}>
        {result.result.drivers.map((d) => (
          <li key={d.feature}>
            {featureName(d.feature, lang)} <span className="mono">{localNumber(signed(d.deviation), lang)}</span>
          </li>
        ))}
      </ul>
    </>
  )
}
