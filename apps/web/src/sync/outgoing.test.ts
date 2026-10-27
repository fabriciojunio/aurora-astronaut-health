import type { CheckIn } from '../domain/checkin'
import { defaultConsent, setConsent } from '../domain/consent'
import { appendAudit } from '../storage/auditTrail'
import { Vault } from '../storage/vault'
import { applyBatch, emptyGround, orderedRecords, verifyBatch } from './outbox'
import { buildGroundBatch, consentId } from './outgoing'

let n = 0
const newVault = () => Vault.create('480137', { dbName: `outgoing-${++n}`, iterations: 1_000 })

const checkIn = (crewId: string, at: string, note = 'felt dizzy after the run'): CheckIn => ({
  crewId, at, sleepHours: 7, sleepQuality: 4, mood: 4, stress: 2, symptoms: [], hydrationMl: 2600,
  resistanceMin: 60, aerobicMin: 30, prescribedResistanceMin: 60, prescribedAerobicMin: 30, note,
})

async function seed(vault: Vault) {
  await vault.put('checkins', 'crew-1:a', checkIn('crew-1', '2026-11-10T07:00:00.000Z'))
  await vault.put('checkins', 'crew-1:b', checkIn('crew-1', '2026-11-11T07:00:00.000Z'))
  await vault.put('checkins', 'crew-2:a', checkIn('crew-2', '2026-11-10T07:00:00.000Z'))
  await vault.put('pvt', 'crew-1:a', {
    crewId: 'crew-1', at: '2026-11-10T08:00:00.000Z',
    result: { trials: 50, meanRtMs: 260, medianRtMs: 255, lapses: 1, falseStarts: 0, performance: 0.98, valid: true },
  })
  await appendAudit(vault, { actor: 'crew-1', action: 'checkin.saved', detail: {} })
}

async function allow(vault: Vault, crewId: string, ...categories: ('checkins' | 'cognition' | 'notes')[]) {
  let consent = defaultConsent()
  for (const c of categories) consent = setConsent(consent, 'ground', c, true)
  await vault.put('settings', consentId(crewId), consent)
}

describe('batch for the ground', () => {
  it('sends nothing until the crew member allows it', async () => {
    const vault = await newVault()
    await seed(vault)
    expect(await buildGroundBatch(vault, 'crew-1')).toBeUndefined()
  })

  it('sends only the allowed categories of that crew member, signed, without notes', async () => {
    const vault = await newVault()
    await seed(vault)
    await allow(vault, 'crew-1', 'checkins')
    const batch = (await buildGroundBatch(vault, 'crew-1'))!
    expect(batch.records.map((r) => r.category)).toEqual(['checkins', 'checkins'])
    expect(batch.records.every((r) => r.crewId === 'crew-1')).toBe(true)
    expect(JSON.stringify(batch)).not.toContain('dizzy')
    expect(await verifyBatch(batch, vault.signingKeys.publicKey)).toBe(true)
  })

  it('includes notes only when notes are allowed too', async () => {
    const vault = await newVault()
    await seed(vault)
    await allow(vault, 'crew-1', 'checkins', 'notes')
    expect(JSON.stringify(await buildGroundBatch(vault, 'crew-1'))).toContain('dizzy')
  })

  it('carries the audit head and lands idempotently on the ground', async () => {
    const vault = await newVault()
    await seed(vault)
    await allow(vault, 'crew-1', 'checkins', 'cognition')
    const first = (await buildGroundBatch(vault, 'crew-1'))!
    const again = (await buildGroundBatch(vault, 'crew-1'))!
    expect(first.batchId).not.toBe(again.batchId)

    let ground = await applyBatch(emptyGround(), first, vault.signingKeys.publicKey)
    ground = await applyBatch(ground, again, vault.signingKeys.publicKey)
    expect(orderedRecords(ground).map((r) => r.category)).toEqual(['checkins', 'cognition', 'checkins'])
    expect(ground.lastAuditHead).toMatch(/^[0-9a-f]{64}$/)
  })
})
