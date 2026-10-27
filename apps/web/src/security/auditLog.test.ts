import fc from 'fast-check'
import { GENESIS_HASH, createEntry, verifyChain, type AuditEntry } from './auditLog'
import { generateSigningKeyPair } from './crypto'

async function buildChain(size: number, keys: CryptoKeyPair): Promise<AuditEntry[]> {
  const chain: AuditEntry[] = []
  for (let i = 0; i < size; i++) {
    chain.push(
      await createEntry(
        chain.at(-1),
        { actor: 'crew-1', action: 'checkin.saved', detail: { index: i } },
        keys.privateKey,
        new Date(Date.UTC(2026, 10, 14, 9, i)),
      ),
    )
  }
  return chain
}

describe('audit log', () => {
  let keys: CryptoKeyPair
  beforeAll(async () => {
    keys = await generateSigningKeyPair()
  })

  it('starts from the genesis hash and links every entry to the previous one', async () => {
    const chain = await buildChain(3, keys)
    expect(chain[0]!.prevHash).toBe(GENESIS_HASH)
    expect(chain[1]!.prevHash).toBe(chain[0]!.hash)
    expect(chain[2]!.seq).toBe(2)
  })

  it('accepts an intact chain and reports its head', async () => {
    const chain = await buildChain(5, keys)
    expect(await verifyChain(chain, keys.publicKey)).toEqual({
      ok: true,
      head: chain[4]!.hash,
      length: 5,
    })
  })

  it('accepts the empty chain', async () => {
    expect(await verifyChain([], keys.publicKey)).toEqual({ ok: true, head: GENESIS_HASH, length: 0 })
  })

  it('detects an edited detail at any position', async () => {
    const chain = await buildChain(6, keys)
    await fc.assert(
      fc.asyncProperty(fc.nat({ max: 5 }), async (position) => {
        const tampered = chain.map((e) => ({ ...e }))
        tampered[position] = { ...tampered[position]!, detail: { index: 999 } }
        expect(await verifyChain(tampered, keys.publicKey)).toMatchObject({
          ok: false,
          brokenAt: position,
          reason: 'content changed',
        })
      }),
      { numRuns: 12 },
    )
  })

  it('detects a deleted entry in the middle', async () => {
    const chain = await buildChain(5, keys)
    const withoutThird = [...chain.slice(0, 2), ...chain.slice(3)]
    expect(await verifyChain(withoutThird, keys.publicKey)).toMatchObject({ ok: false, brokenAt: 2 })
  })

  it('detects reordering', async () => {
    const chain = await buildChain(4, keys)
    const swapped = [chain[0]!, chain[2]!, chain[1]!, chain[3]!]
    expect(await verifyChain(swapped, keys.publicKey)).toMatchObject({ ok: false, brokenAt: 1 })
  })

  it('detects an entry whose hash was recomputed but not re-signed', async () => {
    const chain = await buildChain(3, keys)
    const forger = await generateSigningKeyPair()
    const forged = await createEntry(
      chain[1],
      { actor: 'crew-1', action: 'consent.granted', detail: { scope: 'all' } },
      forger.privateKey,
    )
    expect(await verifyChain([chain[0]!, chain[1]!, forged], keys.publicKey)).toMatchObject({
      ok: false,
      brokenAt: 2,
      reason: 'invalid signature',
    })
  })

  it('detects truncation when the last known head is provided', async () => {
    const chain = await buildChain(5, keys)
    const knownHead = chain[4]!.hash
    expect(await verifyChain(chain.slice(0, 3), keys.publicKey, knownHead)).toMatchObject({
      ok: false,
      reason: 'known head missing (truncated chain)',
    })
    expect(await verifyChain(chain, keys.publicKey, knownHead)).toMatchObject({ ok: true })
  })
})
