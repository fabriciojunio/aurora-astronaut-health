// The astronaut's own vital signs, entered by hand or from a sensor, kept encrypted in the vault.
// Every value is checked against the physically possible range before it is stored: a reading
// outside it is a typing or sensor error, never data.

import { z } from 'zod'
import { PLAUSIBLE, VITAL_KINDS, type VitalKind, type VitalReading } from '../domain/vitals'
import { CREW, randomFor, simulateDay } from '../sim/crew'
import { appendAudit } from '../storage/auditTrail'
import type { Vault } from '../storage/vault'

const COLLECTION = 'vitals'
export const SEED_DAYS = 5
const SEED = 9001

const value = (kind: VitalKind) => z.number().finite().min(PLAUSIBLE[kind][0]).max(PLAUSIBLE[kind][1])

export const vitalSnapshotSchema = z.strictObject({
  crewId: z.string().regex(/^[a-z0-9-]{1,32}$/),
  at: z.iso.datetime(),
  source: z.enum(['manual', 'simulated']),
  values: z.strictObject({
    heartRate: value('heartRate'),
    hrv: value('hrv'),
    spo2: value('spo2'),
    systolic: value('systolic'),
    diastolic: value('diastolic'),
    temperature: value('temperature'),
    respiratoryRate: value('respiratoryRate'),
  }),
})

export type VitalSnapshot = z.infer<typeof vitalSnapshotSchema>

export function toReadings(snapshot: VitalSnapshot): VitalReading[] {
  return VITAL_KINDS.map((kind) => ({
    crewId: snapshot.crewId,
    kind,
    value: snapshot.values[kind],
    at: snapshot.at,
    source: snapshot.source,
  }))
}

/** Validates and stores one set of readings. The audit entry records that it happened, not the values. */
export async function saveSnapshot(vault: Vault, input: unknown): Promise<VitalSnapshot> {
  const snapshot = vitalSnapshotSchema.parse(input)
  await vault.put(COLLECTION, `${snapshot.crewId}:${snapshot.at}`, snapshot)
  await appendAudit(vault, { actor: snapshot.crewId, action: 'vitals.saved', detail: { at: snapshot.at, source: snapshot.source } })
  return snapshot
}

export async function loadSnapshots(vault: Vault, crewId: string): Promise<VitalSnapshot[]> {
  const all = await vault.list<VitalSnapshot>(COLLECTION)
  return all.filter((s) => s.crewId === crewId).sort((a, b) => a.at.localeCompare(b.at))
}

/**
 * Stores five days of simulated readings for the crew member's profile, ending yesterday, so the
 * pattern check has a personal normal to compare a new reading with. They stay labelled simulated.
 */
export async function seedBaseline(vault: Vault, crewId: string, now: Date = new Date()): Promise<number> {
  const profile = CREW.find((p) => p.id === crewId)
  if (!profile) throw new Error(`Unknown crew member: ${crewId}`)
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  let stored = 0
  for (let daysAgo = SEED_DAYS; daysAgo >= 1; daysAgo--) {
    const day = new Date(today - daysAgo * 86_400_000)
    const { vitals } = simulateDay(profile, day, {}, randomFor(crewId, daysAgo, SEED))
    const byTime = new Map<string, Partial<Record<VitalKind, number>>>()
    for (const r of vitals) byTime.set(r.at, { ...byTime.get(r.at), [r.kind]: r.value })
    for (const [at, values] of byTime) {
      const snapshot = vitalSnapshotSchema.parse({ crewId, at, source: 'simulated', values })
      await vault.put(COLLECTION, `${crewId}:${at}`, snapshot)
      stored++
    }
  }
  await appendAudit(vault, { actor: crewId, action: 'vitals.seeded', detail: { days: SEED_DAYS, snapshots: stored } })
  return stored
}
