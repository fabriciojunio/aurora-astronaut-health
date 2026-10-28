import { useMemo } from 'react'
import { daysUntil, theilSen } from '../ai/forecast'
import { EVIDENCE } from '../domain/evidence'
import { CAREER_LIMIT_MSV, careerStatus, dailyDoses, spikeDays, type DailyDose } from '../domain/radiation'
import type { ScenarioDay } from '../sim/scenarios'
import type { MessageKey } from '../i18n/messages'
import { useI18n } from '../i18n/useI18n'
import { DailyDoseChart } from './DailyDoseChart'
import type { Loadable, RealData } from './useVerifiedData'

interface Props {
  /** The simulated mission's days; in real use there is no dose history, so only the measurements show. */
  days?: readonly ScenarioDay[]
  dayIndex: number
  data: Loadable<RealData>
}

const MEASURED = [
  { environment: 'iss', title: 'chart.iss' },
  { environment: 'lunar_orbit', title: 'chart.moon' },
  { environment: 'mars_surface', title: 'chart.mars' },
] as const satisfies readonly { environment: string; title: MessageKey }[]

export function RadiationView({ days, dayIndex, data }: Props) {
  return (
    <div className="stack">
      {days && <CareerDose days={days} dayIndex={dayIndex} />}
      <MeasuredDoses data={data} />
    </div>
  )
}

function CareerDose({ days, dayIndex }: { days: readonly ScenarioDay[]; dayIndex: number }) {
  const { t } = useI18n()
  const day = days[dayIndex]
  if (!day) return null
  const status = careerStatus(day.accumulatedMsv)
  const percent = Math.min(status.careerFraction * 100, 100)
  const history = days.slice(0, dayIndex + 1).map((d) => ({ t: Date.parse(d.date), value: d.accumulatedMsv }))
  const trend = theilSen(history)
  const eta = trend ? daysUntil(trend, Date.parse(day.date), CAREER_LIMIT_MSV) : undefined

  return (
    <section className="card" aria-labelledby="career-title">
      <h2 id="career-title">{t('rad.career')}</h2>
      <div className="hero-row">
        <div>
          <span className="hero-number">{day.accumulatedMsv}</span> <span className="muted">mSv</span>
          <p className="muted small">{t('rad.ofLimit', { pct: Math.round(percent), limit: CAREER_LIMIT_MSV })}</p>
        </div>
        <div>
          <span className="hero-number">{status.remainingMsv}</span> <span className="muted">{t('rad.left')}</span>
          <p className="muted small">
            {trend === undefined
              ? t('rad.trendShort')
              : eta === undefined
                ? t('rad.trendSlow', { rate: trend.slopePerDay.toFixed(2) })
                : t('rad.trendEta', { rate: trend.slopePerDay.toFixed(2), days: Math.round(eta) })}
          </p>
        </div>
      </div>
      <div
        className="meter"
        role="meter"
        aria-label={t('rad.meter')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
      >
        <span style={{ width: `${percent}%` }} className={percent >= 80 ? 'high' : undefined} />
      </div>
      <p className="muted small">{t('rad.limitSource', { source: EVIDENCE.nasaStd3001Radiation.citation })}</p>
    </section>
  )
}

function MeasuredDoses({ data }: { data: Loadable<RealData> }) {
  const { t } = useI18n()
  const charts = useMemo(() => {
    if (data.status !== 'ready') return []
    return MEASURED.map(({ environment, title }) => {
      const doses: DailyDose[] = dailyDoses(data.value.radiation.records, environment)
      return { environment, title, doses, spikes: new Set(spikeDays(doses).map((d) => d.date)) }
    })
  }, [data])

  return (
    <section className="card" aria-labelledby="measured-title">
      <h2 id="measured-title">{t('rad.measured')}</h2>
      <p className="muted small">{t('rad.measuredNote')}</p>
      {data.status === 'loading' && <p className="muted">{t('rad.checking')}</p>}
      {data.status === 'error' && <p role="alert">{t('rad.failed')}</p>}
      {data.status === 'ready' && (
        <>
          <div className="charts">
            {charts.map((c) => (
              <DailyDoseChart key={c.environment} title={t(c.title)} days={c.doses} spikes={c.spikes} />
            ))}
          </div>
          <SourceLine entry={data.value.radiation.entry} />
          <SolarProtons protons={data.value.protons} />
        </>
      )}
    </section>
  )
}

function SourceLine({ entry }: { entry: RealData['radiation']['entry'] }) {
  const { t } = useI18n()
  return (
    <p className="muted small source-line">
      {t('rad.source')}{' '}
      <a href={entry.url} target="_blank" rel="noopener noreferrer">
        {entry.source}
      </a>
      {t('rad.retrieved', { date: entry.retrievedAt.slice(0, 10), hash: entry.sha256.slice(0, 12) })}
    </p>
  )
}

function SolarProtons({ protons }: { protons: RealData['protons'] }) {
  const { t } = useI18n()
  const latest = protons.records.reduce<(typeof protons.records)[number] | undefined>(
    (a, r) => (!a || r.time > a.time ? r : a),
    undefined,
  )
  if (!latest) return null
  return (
    <div className="protons">
      <h3 className="section-title">{t('rad.protons')}</h3>
      <p>
        {t('rad.protonsLine', { flux: latest.flux_10mev, time: latest.time.slice(0, 16).replace('T', ' ') })}{' '}
        <strong>{latest.storm_level === 0 ? t('rad.noStorm') : t('rad.stormLevel', { level: latest.storm_level })}</strong>.
      </p>
      <SourceLine entry={protons.entry} />
    </div>
  )
}
