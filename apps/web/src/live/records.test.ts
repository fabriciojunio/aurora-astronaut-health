import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { anomalyForReadings } from '../ai/liveAnomaly'
import { loadModel } from '../ai/isolationForest'
import { readAuditTrail } from '../storage/auditTrail'
import { Vault } from '../storage/vault'
import { SEED_DAYS, loadSnapshots, saveSnapshot, seedBaseline, toReadings } from './records'

const model = loadModel(JSON.parse(readFileSync(resolve(import.meta.dirname, '../../public/models/anomaly-v1.json'), 'utf-8')))
const NOW = new Date('2026-11-14T12:00:00.000Z')
const USUAL = { heartRate: 52, hrv: 68, spo2: 98, systolic: 114, diastolic: 72, temperature: 36.6, respiratoryRate: 13 }
const FEVER = { ...USUAL, heartRate: 78, temperature: 38.6, respiratoryRate: 20 }

let n = 0
const newVault = () => Vault.create('480137', { dbName: `live-${++n}`, iterations: 1_000 })
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString()

async function readings(vault: Vault) {
  return (await loadSnapshots(vault, 'crew-1')).flatMap(toReadings)
}

describe('live records', () => {
  it('stores a full set of readings encrypted and audits it without the values', async () => {
    const vault = await newVault()
    await saveSnapshot(vault, { crewId: 'crew-1', at: minutesAgo(5), source: 'manual', values: USUAL })
    const [stored] = await loadSnapshots(vault, 'crew-1')
    expect(stored!.values).toEqual(USUAL)
    const audit = await readAuditTrail(vault)
    expect(audit.map((e) => e.action)).toEqual(['vitals.saved'])
    expect(JSON.stringify(audit)).not.toContain('36.6')
  })

  it('refuses impossible values, missing signals and unknown fields', async () => {
    const vault = await newVault()
    const base = { crewId: 'crew-1', at: minutesAgo(5), source: 'manual' }
    await expect(saveSnapshot(vault, { ...base, values: { ...USUAL, heartRate: 900 } })).rejects.toThrow()
    await expect(saveSnapshot(vault, { ...base, values: { ...USUAL, spo2: Number.NaN } })).rejects.toThrow()
    const { hrv: _hrv, ...missing } = USUAL
    await expect(saveSnapshot(vault, { ...base, values: missing })).rejects.toThrow()
    await expect(saveSnapshot(vault, { ...base, values: USUAL, note: '<script>' })).rejects.toThrow()
    await expect(saveSnapshot(vault, { ...base, crewId: '../admin', values: USUAL })).rejects.toThrow()
    expect(await loadSnapshots(vault, 'crew-1')).toEqual([])
  })

  it('keeps crew members apart', async () => {
    const vault = await newVault()
    await saveSnapshot(vault, { crewId: 'crew-2', at: minutesAgo(5), source: 'manual', values: USUAL })
    expect(await loadSnapshots(vault, 'crew-1')).toEqual([])
    expect(await loadSnapshots(vault, 'crew-2')).toHaveLength(1)
  })

  it('seeds five labelled days that end yesterday', async () => {
    const vault = await newVault()
    expect(await seedBaseline(vault, 'crew-1', NOW)).toBe(SEED_DAYS * 4)
    const snapshots = await loadSnapshots(vault, 'crew-1')
    expect(snapshots.every((s) => s.source === 'simulated')).toBe(true)
    expect(new Set(snapshots.map((s) => s.at.slice(0, 10)))).toEqual(
      new Set(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']),
    )
    expect((await readAuditTrail(vault)).map((e) => e.action)).toEqual(['vitals.seeded'])
  })
})

describe('pattern check over live readings', () => {
  it('asks for more days before judging', async () => {
    const vault = await newVault()
    await saveSnapshot(vault, { crewId: 'crew-1', at: minutesAgo(5), source: 'manual', values: USUAL })
    expect(anomalyForReadings(model, await readings(vault), NOW)).toEqual({ status: 'baseline', daysLeft: SEED_DAYS })
  })

  it('sees a usual reading as usual once the normal is learned', async () => {
    const vault = await newVault()
    await seedBaseline(vault, 'crew-1', NOW)
    await saveSnapshot(vault, { crewId: 'crew-1', at: minutesAgo(5), source: 'manual', values: USUAL })
    expect(anomalyForReadings(model, await readings(vault), NOW)).toMatchObject({ status: 'assessed', anomalous: false })
  })

  it('flags two fever readings and names the signals that moved', async () => {
    const vault = await newVault()
    await seedBaseline(vault, 'crew-1', NOW)
    await saveSnapshot(vault, { crewId: 'crew-1', at: minutesAgo(60), source: 'manual', values: FEVER })
    const one = anomalyForReadings(model, await readings(vault), NOW)
    expect(one).toMatchObject({ status: 'assessed', anomalous: false, anomalousReadings: 1 })

    await saveSnapshot(vault, { crewId: 'crew-1', at: minutesAgo(5), source: 'manual', values: FEVER })
    const two = anomalyForReadings(model, await readings(vault), NOW)
    expect(two).toMatchObject({ status: 'assessed', anomalous: true, anomalousReadings: 2 })
    if (two.status !== 'assessed') return
    expect(two.result.drivers.map((d) => d.feature)).toContain('temperature')
  })

  it('ignores readings older than a day when judging today', async () => {
    const vault = await newVault()
    await seedBaseline(vault, 'crew-1', NOW)
    const nextDay = new Date(NOW.getTime() + 86_400_000)
    expect(anomalyForReadings(model, await readings(vault), nextDay)).toEqual({ status: 'unavailable' })
  })
})
