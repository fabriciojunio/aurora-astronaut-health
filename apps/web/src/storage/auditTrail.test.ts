import { appendAudit, readAuditTrail, verifyAuditTrail } from './auditTrail'
import { Vault } from './vault'

let n = 0
const newVault = () => Vault.create('480137', { dbName: `audit-trail-${++n}`, iterations: 1_000 })

describe('audit trail in the vault', () => {
  it('keeps a valid chain across many appends', async () => {
    const vault = await newVault()
    for (let i = 0; i < 5; i++) await appendAudit(vault, { actor: 'crew-1', action: 'checkin.saved', detail: { i } })
    const chain = await readAuditTrail(vault)
    expect(chain.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4])
    expect(await verifyAuditTrail(vault)).toEqual({ ok: true, head: chain[4]!.hash, length: 5 })
  })

  it('does not fork the chain when appends start at the same time', async () => {
    const vault = await newVault()
    await Promise.all(
      Array.from({ length: 8 }, (_, i) => appendAudit(vault, { actor: 'crew-2', action: 'pvt.saved', detail: { i } })),
    )
    const chain = await readAuditTrail(vault)
    expect(chain).toHaveLength(8)
    expect(chain.map((e) => e.detail.i)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect((await verifyAuditTrail(vault)).ok).toBe(true)
  })

  it('detects an entry edited inside the vault', async () => {
    const vault = await newVault()
    await appendAudit(vault, { actor: 'crew-1', action: 'consent.changed', detail: { allowed: false } })
    await appendAudit(vault, { actor: 'crew-1', action: 'checkin.saved', detail: {} })
    const [first] = await readAuditTrail(vault)
    await vault.put('audit', '0000000000', { ...first!, detail: { allowed: true } })
    expect(await verifyAuditTrail(vault)).toMatchObject({ ok: false, brokenAt: 0, reason: 'content changed' })
  })

  it('keeps working after a failed append', async () => {
    const vault = await newVault()
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    await expect(appendAudit(vault, { actor: 'crew-1', action: 'bad', detail: cyclic })).rejects.toThrow()
    await appendAudit(vault, { actor: 'crew-1', action: 'checkin.saved', detail: {} })
    expect(await readAuditTrail(vault)).toHaveLength(1)
  })
})
