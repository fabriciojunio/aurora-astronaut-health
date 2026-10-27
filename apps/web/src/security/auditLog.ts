import { canonicalJson, sha256Hex, signText, verifyText } from './crypto'

export const GENESIS_HASH = '0'.repeat(64)

export interface AuditEntryInput {
  actor: string
  action: string
  detail: Record<string, unknown>
}

export interface AuditEntry extends AuditEntryInput {
  seq: number
  at: string
  prevHash: string
  hash: string
  signature: string
}

export type ChainVerification =
  | { ok: true; head: string; length: number }
  | { ok: false; brokenAt: number; reason: string }

function hashableFields(entry: Omit<AuditEntry, 'hash' | 'signature'>) {
  const { seq, at, actor, action, detail, prevHash } = entry
  return { seq, at, actor, action, detail, prevHash }
}

export async function createEntry(
  previous: AuditEntry | undefined,
  input: AuditEntryInput,
  signingKey: CryptoKey,
  now: Date = new Date(),
): Promise<AuditEntry> {
  const base = {
    ...input,
    seq: previous ? previous.seq + 1 : 0,
    at: now.toISOString(),
    prevHash: previous ? previous.hash : GENESIS_HASH,
  }
  const hash = await sha256Hex(canonicalJson(hashableFields(base)))
  const signature = await signText(signingKey, hash)
  return { ...base, hash, signature }
}

/**
 * Detects edits, deletions, insertions and reordering anywhere in the chain. Cutting entries off
 * the end cannot be detected from the chain alone; that is why the head hash is sent to the ground
 * station with every sync, which then knows the last valid head it has seen.
 */
export async function verifyChain(
  chain: readonly AuditEntry[],
  publicKey: CryptoKey,
  expectedHead?: string,
): Promise<ChainVerification> {
  let prevHash = GENESIS_HASH
  for (const [index, entry] of chain.entries()) {
    if (entry.seq !== index) return { ok: false, brokenAt: index, reason: 'sequence gap or reorder' }
    if (entry.prevHash !== prevHash) return { ok: false, brokenAt: index, reason: 'broken link' }
    const recomputed = await sha256Hex(canonicalJson(hashableFields(entry)))
    if (recomputed !== entry.hash) return { ok: false, brokenAt: index, reason: 'content changed' }
    if (!(await verifyText(publicKey, entry.hash, entry.signature))) {
      return { ok: false, brokenAt: index, reason: 'invalid signature' }
    }
    prevHash = entry.hash
  }
  if (expectedHead !== undefined && !chain.some((e) => e.hash === expectedHead)) {
    return { ok: false, brokenAt: chain.length, reason: 'known head missing (truncated chain)' }
  }
  return { ok: true, head: prevHash, length: chain.length }
}
