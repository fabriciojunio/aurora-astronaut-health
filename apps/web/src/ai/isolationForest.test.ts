import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import fc from 'fast-check'
import { FEATURES, featureVector, personalBaselines } from './features'
import { anomalyScore, assess, averagePathLength, loadModel } from './isolationForest'
import { CREW, randomFor, simulateDay } from '../sim/crew'
import type { VitalReading } from '../domain/vitals'

const root = resolve(import.meta.dirname, '../../../..')
const model = loadModel(JSON.parse(readFileSync(resolve(root, 'apps/web/public/models/anomaly-v1.json'), 'utf-8')))
const parity = JSON.parse(readFileSync(resolve(root, 'ml/data/parity.json'), 'utf-8')) as { x: number[]; score: number }[]

describe('Isolation Forest in TypeScript', () => {
  it('matches the scikit-learn formula for c(n)', () => {
    expect(averagePathLength(1)).toBe(0)
    expect(averagePathLength(2)).toBe(1)
    expect(averagePathLength(256)).toBeCloseTo(10.2448, 3)
  })

  it('gives exactly the same scores as scikit-learn for the exported test vectors', () => {
    expect(parity.length).toBeGreaterThan(30)
    for (const { x, score } of parity) expect(anomalyScore(model, x)).toBeCloseTo(score, 10)
  })

  it('uses the model features in the same order as the app computes them', () => {
    expect(model.features).toEqual([...FEATURES])
  })

  it('rejects inputs of the wrong size or with non-finite values', () => {
    expect(() => anomalyScore(model, [1, 2])).toThrow(RangeError)
    expect(() => anomalyScore(model, Array(FEATURES.length).fill(Number.NaN))).toThrow(RangeError)
  })

  it('always returns a score between 0 and 1', () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: -10, max: 10, noNaN: true }), { minLength: FEATURES.length, maxLength: FEATURES.length }), (x) => {
        const s = anomalyScore(model, x)
        expect(s).toBeGreaterThan(0)
        expect(s).toBeLessThan(1)
      }),
      { numRuns: 300 },
    )
  })

  it('refuses a tampered or malformed model file', () => {
    const good = JSON.parse(readFileSync(resolve(root, 'apps/web/public/models/anomaly-v1.json'), 'utf-8'))
    expect(() => loadModel({ ...good, kind: 'neural-net' })).toThrow()
    const badTree = structuredClone(good)
    badTree.trees[0].left[0] = 999_999
    expect(() => loadModel(badTree)).toThrow('malformed')
    const badFeature = structuredClone(good)
    badFeature.trees[0].feature[0] = 99
    expect(() => loadModel(badFeature)).toThrow('malformed')
  })
})

describe('anomaly model on simulated crew data', () => {
  const profile = CREW[1]!
  const history: VitalReading[] = []
  for (let d = 0; d < 5; d++) history.push(...simulateDay(profile, new Date(Date.UTC(2026, 0, 1 + d)), {}, randomFor(profile.id, d, 900)).vitals)
  const baselines = personalBaselines(history)!

  const snapshotFor = (shift: Parameters<typeof simulateDay>[2]['vitalShift']) => {
    const { vitals } = simulateDay(profile, new Date(Date.UTC(2026, 3, 1)), { vitalShift: shift }, randomFor(profile.id, 1, 901))
    const first = vitals.filter((v) => v.at === vitals[0]!.at)
    return Object.fromEntries(first.map((v) => [v.kind, v.value]))
  }

  it('does not flag a normal moment', () => {
    expect(assess(model, featureVector(snapshotFor({}), baselines)!).anomalous).toBe(false)
  })

  it('flags hypoxia and names oxygen saturation among the drivers', () => {
    const result = assess(model, featureVector(snapshotFor({ spo2: -5, respiratoryRate: 7, heartRate: 14 }), baselines)!)
    expect(result.anomalous).toBe(true)
    expect(result.drivers.map((d) => d.feature)).toContain('spo2')
  })

  it('needs every signal: a missing vital gives no vector instead of a guess', () => {
    const { spo2: _spo2, ...partial } = snapshotFor({})
    expect(featureVector(partial, baselines)).toBeUndefined()
  })
})
