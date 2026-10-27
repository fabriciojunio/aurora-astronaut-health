import fc from 'fast-check'
import { defaultConsent, setConsent, shareable } from '../domain/consent'
import { generateSigningKeyPair } from '../security/crypto'
import {
  applyBatch,
  arrived,
  emptyGround,
  oneWayDelayMs,
  orderedRecords,
  schedule,
  signBatch,
  verifyBatch,
  type SyncRecord,
} from './outbox'

const record = (seq: number, category: SyncRecord['category'] = 'alerts'): SyncRecord => ({
  id: `crew-1-${seq}`,
  seq,
  crewId: 'crew-1',
  category,
  createdAt: new Date(Date.UTC(2026, 10, 14, 9, seq)).toISOString(),
  payload: { value: seq },
})

async function batch(keys: CryptoKeyPair, seqs: number[], id = `b-${seqs.join('-')}`) {
  return signBatch(
    { batchId: id, crewId: 'crew-1', createdAt: '2026-11-14T10:00:00.000Z', auditHead: `head-${Math.max(...seqs)}`, records: seqs.map((s) => record(s)) },
    keys.privateKey,
  )
}

describe('signal delay', () => {
  it('uses no delay for the ISS, 1.3 s for the Moon and 3 to 22 min for Mars', () => {
    expect(oneWayDelayMs('iss')).toBe(0)
    expect(oneWayDelayMs('moon')).toBe(1_300)
    expect(oneWayDelayMs('mars', 22)).toBe(22 * 60_000)
    expect(() => oneWayDelayMs('mars', 40)).toThrow(RangeError)
  })

  it('delivers a batch only after the delay has passed', async () => {
    const keys = await generateSigningKeyPair()
    const delivery = schedule(await batch(keys, [0]), 1_000, oneWayDelayMs('mars', 12))
    expect(arrived([delivery], 1_000 + 11 * 60_000).delivered).toHaveLength(0)
    expect(arrived([delivery], 1_000 + 12 * 60_000).delivered).toHaveLength(1)
  })
})

describe('signed batches', () => {
  let keys: CryptoKeyPair
  beforeAll(async () => {
    keys = await generateSigningKeyPair()
  })

  it('verifies an untouched batch', async () => {
    expect(await verifyBatch(await batch(keys, [0, 1]), keys.publicKey)).toBe(true)
  })

  it('rejects a batch whose content was changed in transit', async () => {
    const original = await batch(keys, [0, 1])
    const tampered = { ...original, records: [{ ...original.records[0]!, payload: { value: 999 } }, original.records[1]!] }
    const ground = await applyBatch(emptyGround(), tampered, keys.publicKey)
    expect(ground.records.size).toBe(0)
    expect(ground.rejectedBatches).toEqual([original.batchId])
  })

  it('rejects a batch signed by someone else', async () => {
    const forger = await generateSigningKeyPair()
    expect(await verifyBatch(await batch(forger, [0]), keys.publicKey)).toBe(false)
  })

  it('refuses to sign a batch that mixes crew members', async () => {
    await expect(
      signBatch(
        { batchId: 'x', crewId: 'crew-1', createdAt: 'now', auditHead: 'h', records: [{ ...record(0), crewId: 'crew-2' }] },
        keys.privateKey,
      ),
    ).rejects.toThrow('own crew member')
  })

  it('is idempotent: duplicates and replays change nothing', async () => {
    const b = await batch(keys, [0, 1, 2])
    const once = await applyBatch(emptyGround(), b, keys.publicKey)
    const twice = await applyBatch(once, b, keys.publicKey)
    expect(orderedRecords(twice)).toEqual(orderedRecords(once))
  })

  it('gives the same result whatever the arrival order, and never rewinds the audit head', async () => {
    const batches = [await batch(keys, [0, 1]), await batch(keys, [2, 3]), await batch(keys, [4])]
    const inOrder = await batches.reduce(async (s, b) => applyBatch(await s, b, keys.publicKey), Promise.resolve(emptyGround()))
    await fc.assert(
      fc.asyncProperty(fc.shuffledSubarray(batches, { minLength: 3, maxLength: 3 }), async (order) => {
        const state = await order.reduce(async (s, b) => applyBatch(await s, b, keys.publicKey), Promise.resolve(emptyGround()))
        expect(orderedRecords(state).map((r) => r.seq)).toEqual(orderedRecords(inOrder).map((r) => r.seq))
        expect(state.lastAuditHead).toBe('head-4')
      }),
      { numRuns: 20 },
    )
  })
})

describe('consent before sync', () => {
  it('sends nothing by default', () => {
    expect(shareable([record(0, 'vitals'), record(1, 'notes')], defaultConsent(), 'ground')).toEqual([])
  })

  it('sends only the categories allowed for that audience', () => {
    const consent = setConsent(setConsent(defaultConsent(), 'ground', 'alerts', true), 'crewMedicalOfficer', 'vitals', true)
    const items = [record(0, 'alerts'), record(1, 'vitals'), record(2, 'notes')]
    expect(shareable(items, consent, 'ground').map((r) => r.category)).toEqual(['alerts'])
    expect(shareable(items, consent, 'crewMedicalOfficer').map((r) => r.category)).toEqual(['vitals'])
  })

  it('stops sharing as soon as consent is revoked', () => {
    const granted = setConsent(defaultConsent(), 'ground', 'vitals', true)
    const revoked = setConsent(granted, 'ground', 'vitals', false)
    expect(shareable([record(0, 'vitals')], revoked, 'ground')).toEqual([])
  })
})
