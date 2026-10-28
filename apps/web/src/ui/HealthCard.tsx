import type { DayAnomaly } from '../ai/anomalyMonitor'
import type { AnomalyModel } from '../ai/isolationForest'
import { EVIDENCE } from '../domain/evidence'
import { severityRank, type Alert, type Severity } from '../domain/riskEngine'
import { VITAL_KINDS, latestByKind, news2, type VitalReading } from '../domain/vitals'
import { alertText, featureName, localNumber, riskName, roleName, severityName, unitName, vitalName } from '../i18n/content'
import { useI18n } from '../i18n/useI18n'
import { CREW } from '../sim/crew'
import { signed } from './labels'
import type { Loadable } from './useVerifiedData'

interface Props {
  crewId: string
  /** The readings the card summarises; the newest of each kind is shown. */
  vitals: readonly VitalReading[]
  alerts: readonly Alert[]
  anomaly: DayAnomaly | undefined
  model: Loadable<AnomalyModel>
  onAsk?: (alert: Alert) => void
  /** With live data a single unusual reading is worth repeating; in a simulated day it is noise. */
  live?: boolean
}

function worstSeverity(alerts: readonly Alert[]): Severity | undefined {
  return alerts.reduce<Severity | undefined>(
    (worst, a) => (worst === undefined || severityRank(a.severity) > severityRank(worst) ? a.severity : worst),
    undefined,
  )
}

/** One crew member's state: latest vital signs, NEWS2, the pattern check and the alerts. */
export function HealthCard({ crewId, vitals, alerts, anomaly, model, onAsk, live = false }: Props) {
  const { t, lang } = useI18n()
  const profile = CREW.find((p) => p.id === crewId)
  const latest = latestByKind(vitals)
  const score = news2(latest, { newConfusion: false })
  const worst = worstSeverity(alerts)
  const headingId = `crew-${crewId}`
  const unusual = anomaly?.status === 'assessed' && anomaly.anomalous

  return (
    <article className="card crew-card" aria-labelledby={headingId}>
      <header className="crew-head">
        <div>
          <h2 id={headingId}>{profile?.name ?? crewId}</h2>
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
        <span className="mono">
          {score.risk === 'incomplete' ? t('crew.news2Incomplete') : `${score.total} ${riskName(score.risk, lang)}`}
        </span>
      </p>

      <section className={unusual ? 'anomaly unusual' : 'anomaly'} aria-label={t('pattern.title')}>
        <h3 className="section-title">{t('pattern.title')}</h3>
        <AnomalyText model={model} result={anomaly} live={live} />
      </section>

      <h3 className="section-title">{t('crew.alerts')}</h3>
      {alerts.length === 0 ? (
        <p className="muted">{t('crew.nothing')}</p>
      ) : (
        <ul className="alerts">
          {alerts.map((alert) => {
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

function AnomalyText({ model, result, live }: { model: Loadable<AnomalyModel>; result: DayAnomaly | undefined; live: boolean }) {
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
  if (!result.anomalous) {
    return <p>{live && result.anomalousReadings === 1 ? t('pattern.confirm') : t('pattern.normal')}</p>
  }
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
