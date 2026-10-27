import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runScenario, scenarioById } from '../sim/scenarios'
import { BASELINE_DAYS, anomalyForDay } from './anomalyMonitor'
import { loadModel } from './isolationForest'

const model = loadModel(JSON.parse(readFileSync(resolve(import.meta.dirname, '../../public/models/anomaly-v1.json'), 'utf-8')))

const flagged = (scenarioId: string, crewId: string) => {
  const days = runScenario(scenarioById(scenarioId))
  return days
    .map((_, i) => anomalyForDay(model, days, crewId, i))
    .flatMap((a, i) => (a.status === 'assessed' && a.anomalous ? [i] : []))
}

describe('anomaly monitor over a mission', () => {
  it('builds the personal normal during the first days before judging anything', () => {
    const days = runScenario(scenarioById('healthy-iss'))
    expect(anomalyForDay(model, days, 'crew-1', 0)).toEqual({ status: 'baseline', daysLeft: BASELINE_DAYS })
    expect(anomalyForDay(model, days, 'crew-1', BASELINE_DAYS).status).toBe('assessed')
  })

  it('flags the fever days of the crew medical officer and no healthy day', () => {
    const days = flagged('infection', 'crew-3')
    expect(days).toEqual(expect.arrayContaining([12, 13, 14, 15]))
    expect(days.every((d) => d >= 12 && d <= 15)).toBe(true)
  })

  it('names the signals that moved as the reason', () => {
    const days = runScenario(scenarioById('infection'))
    const result = anomalyForDay(model, days, 'crew-3', 13)
    expect(result.status).toBe('assessed')
    if (result.status !== 'assessed') return
    expect(result.result.drivers.map((d) => d.feature)).toEqual(
      expect.arrayContaining(['temperature', 'heartRate']),
    )
  })

  it('never flags a crew member whose vital signs were not changed by the scenario', () => {
    const untouched = [
      ...['crew-1', 'crew-2', 'crew-3'].map((crew) => ['healthy-iss', crew]),
      ...['crew-1', 'crew-2', 'crew-3'].map((crew) => ['sleep-loss', crew]),
      ...['crew-1', 'crew-2', 'crew-3'].map((crew) => ['co2-excursion', crew]),
      ...['crew-1', 'crew-2', 'crew-3'].map((crew) => ['exercise-gap', crew]),
      ...['crew-1', 'crew-2', 'crew-3'].map((crew) => ['mars-solar-storm', crew]),
      ...['crew-1', 'crew-2', 'crew-3'].map((crew) => ['combined-transit', crew]),
      ['infection', 'crew-1'],
      ['infection', 'crew-2'],
    ]
    const falseDays = untouched.flatMap(([scenario, crew]) => flagged(scenario!, crew!).map((d) => `${scenario}/${crew}/${d}`))
    // 20 crew-scenarios x 16 judged days = 320 healthy days, none flagged.
    expect(falseDays).toEqual([])
  })

  it('reports unavailable for an unknown crew member or a day without data', () => {
    const days = runScenario(scenarioById('healthy-iss'))
    expect(anomalyForDay(model, days, 'crew-9', 10).status).toBe('unavailable')
    expect(anomalyForDay(model, days, 'crew-1', 99).status).toBe('unavailable')
  })
})
