import { useMemo } from 'react'
import { daysUntil, theilSen } from '../ai/forecast'
import { EVIDENCE } from '../domain/evidence'
import { CAREER_LIMIT_MSV, careerStatus, dailyDoses, spikeDays, type DailyDose } from '../domain/radiation'
import type { ScenarioDay } from '../sim/scenarios'
import { DailyDoseChart } from './DailyDoseChart'
import type { Loadable, RealData } from './useVerifiedData'

interface Props {
  days: readonly ScenarioDay[]
  dayIndex: number
  data: Loadable<RealData>
}

const MEASURED = [
  { environment: 'iss', title: 'ISS (DOSTEL)' },
  { environment: 'lunar_orbit', title: 'Lunar orbit (CRaTER)' },
  { environment: 'mars_surface', title: 'Mars surface (Curiosity RAD)' },
] as const

export function RadiationView({ days, dayIndex, data }: Props) {
  return (
    <div className="stack">
      <CareerDose days={days} dayIndex={dayIndex} />
      <MeasuredDoses data={data} />
    </div>
  )
}

function CareerDose({ days, dayIndex }: Omit<Props, 'data'>) {
  const day = days[dayIndex]
  if (!day) return null
  const status = careerStatus(day.accumulatedMsv)
  const percent = Math.min(status.careerFraction * 100, 100)
  const history = days.slice(0, dayIndex + 1).map((d) => ({ t: Date.parse(d.date), value: d.accumulatedMsv }))
  const trend = theilSen(history)
  const eta = trend ? daysUntil(trend, Date.parse(day.date), CAREER_LIMIT_MSV) : undefined

  return (
    <section className="card" aria-labelledby="career-title">
      <h2 id="career-title">Career dose in this scenario</h2>
      <div className="hero-row">
        <div>
          <span className="hero-number">{day.accumulatedMsv}</span> <span className="muted">mSv</span>
          <p className="muted small">{Math.round(percent)}% of {CAREER_LIMIT_MSV} mSv limit</p>
        </div>
        <div>
          <span className="hero-number">{status.remainingMsv}</span> <span className="muted">mSv left</span>
          <p className="muted small">
            {trend === undefined
              ? 'Trend needs at least 3 days.'
              : eta === undefined
                ? `Rising ${trend.slopePerDay.toFixed(2)} mSv/day; limit not reached within a year.`
                : `At the current trend (${trend.slopePerDay.toFixed(2)} mSv/day) the limit is reached in about ${Math.round(eta)} days.`}
          </p>
        </div>
      </div>
      <div
        className="meter"
        role="meter"
        aria-label="Share of the career dose limit used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
      >
        <span style={{ width: `${percent}%` }} className={percent >= 80 ? 'high' : undefined} />
      </div>
      <p className="muted small">Limit: {EVIDENCE.nasaStd3001Radiation.citation}. Trend: Theil-Sen.</p>
    </section>
  )
}

function MeasuredDoses({ data }: { data: Loadable<RealData> }) {
  const charts = useMemo(() => {
    if (data.status !== 'ready') return []
    return MEASURED.map(({ environment, title }) => {
      const doses: DailyDose[] = dailyDoses(data.value.radiation.records, environment)
      return { environment, title, doses, spikes: new Set(spikeDays(doses).map((d) => d.date)) }
    })
  }, [data])

  return (
    <section className="card" aria-labelledby="measured-title">
      <h2 id="measured-title">Measured in space, May 2024</h2>
      <p className="muted small">Absorbed dose, µGy/day. Highlighted: 3× median or more. Independent scales.</p>
      {data.status === 'loading' && <p className="muted">Checking the data files…</p>}
      {data.status === 'error' && (
        <p role="alert">The data files failed their integrity check, so they are not shown.</p>
      )}
      {data.status === 'ready' && (
        <>
          <div className="charts">
            {charts.map((c) => (
              <DailyDoseChart key={c.environment} title={c.title} days={c.doses} spikes={c.spikes} />
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
  return (
    <p className="muted small source-line">
      Source:{' '}
      <a href={entry.url} target="_blank" rel="noopener noreferrer">
        {entry.source}
      </a>
      , retrieved {entry.retrievedAt.slice(0, 10)}. SHA-256 verified on load ({entry.sha256.slice(0, 12)}…).
    </p>
  )
}

function SolarProtons({ protons }: { protons: RealData['protons'] }) {
  const latest = protons.records.reduce<(typeof protons.records)[number] | undefined>(
    (a, r) => (!a || r.time > a.time ? r : a),
    undefined,
  )
  if (!latest) return null
  return (
    <div className="protons">
      <h3 className="section-title">Solar protons at the last data update</h3>
      <p>
        GOES ≥10 MeV flux <span className="mono">{latest.flux_10mev}</span> pfu at {latest.time.slice(0, 16).replace('T', ' ')}{' '}
        UTC: <strong>{latest.storm_level === 0 ? 'no radiation storm' : `storm level S${latest.storm_level}`}</strong>.
      </p>
      <SourceLine entry={protons.entry} />
    </div>
  )
}
