// Keeps the signed audit chain inside the encrypted vault. Appends are queued per vault: two saves
// started at the same moment would otherwise both read the same last entry and fork the chain.

import { createEntry, verifyChain, type AuditEntry, type AuditEntryInput, type ChainVerification } from '../security/auditLog'
import type { Vault } from './vault'

const COLLECTION = 'audit'
const queues = new WeakMap<Vault, Promise<unknown>>()

const idFor = (seq: number) => String(seq).padStart(10, '0')

export async function readAuditTrail(vault: Vault): Promise<AuditEntry[]> {
  const entries = await vault.list<AuditEntry>(COLLECTION)
  return entries.sort((a, b) => a.seq - b.seq)
}

export function appendAudit(vault: Vault, input: AuditEntryInput, now: () => Date = () => new Date()): Promise<AuditEntry> {
  const previous = queues.get(vault) ?? Promise.resolve()
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const chain = await readAuditTrail(vault)
      const entry = await createEntry(chain.at(-1), input, vault.signingKeys.privateKey, now())
      await vault.put(COLLECTION, idFor(entry.seq), entry)
      return entry
    })
  queues.set(vault, next)
  return next
}

export async function verifyAuditTrail(vault: Vault): Promise<ChainVerification> {
  return verifyChain(await readAuditTrail(vault), vault.signingKeys.publicKey)
}
