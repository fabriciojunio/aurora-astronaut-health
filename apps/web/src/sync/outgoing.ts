// Builds the batch a crew member's device sends to the ground. Only categories the crew member
// allowed for the ground leave the device, and free-text notes are removed unless "notes" is allowed.

import type { CheckIn } from '../domain/checkin'
import type { PvtResult } from '../domain/cognition'
import { defaultConsent, shareable, type ConsentState, type DataCategory } from '../domain/consent'
import { GENESIS_HASH } from '../security/auditLog'
import { randomBytes, toBase64 } from '../security/crypto'
import { readAuditTrail } from '../storage/auditTrail'
import type { Vault } from '../storage/vault'
import { signBatch, type Batch, type SyncRecord } from './outbox'

export const consentId = (crewId: string) => `consent:${crewId}`

export async function loadConsent(vault: Vault, crewId: string): Promise<ConsentState> {
  return (await vault.get<ConsentState>('settings', consentId(crewId))) ?? defaultConsent()
}

interface Candidate {
  category: DataCategory
  createdAt: string
  payload: unknown
}

export async function buildGroundBatch(vault: Vault, crewId: string, now: Date = new Date()): Promise<Batch | undefined> {
  const consent = await loadConsent(vault, crewId)
  const includeNotes = consent.ground.notes
  const checkIns = (await vault.list<CheckIn>('checkins')).filter((c) => c.crewId === crewId)
  const pvt = (await vault.list<{ crewId: string; at: string; result: PvtResult }>('pvt')).filter((p) => p.crewId === crewId)

  const candidates: Candidate[] = [
    ...checkIns.map((c) => ({
      category: 'checkins' as const,
      createdAt: c.at,
      payload: includeNotes ? c : { ...c, note: '' },
    })),
    ...pvt.map((p) => ({ category: 'cognition' as const, createdAt: p.at, payload: p.result })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  const allowed = shareable(candidates, consent, 'ground')
  if (allowed.length === 0) return undefined

  // Ids are stable, so sending the same record twice is a duplicate the ground ignores.
  const records: SyncRecord[] = allowed.map((c, seq) => ({
    id: `${crewId}:${c.category}:${c.createdAt}`,
    seq,
    crewId,
    category: c.category,
    createdAt: c.createdAt,
    payload: c.payload,
  }))
  const audit = await readAuditTrail(vault)
  return signBatch(
    {
      batchId: toBase64(randomBytes(12)),
      crewId,
      createdAt: now.toISOString(),
      auditHead: audit.at(-1)?.hash ?? GENESIS_HASH,
      records,
    },
    vault.signingKeys.privateKey,
  )
}
