import type { DataCategory } from '../domain/consent'
import { canonicalJson, signText, verifyText } from '../security/crypto'

export type MissionLink = 'iss' | 'moon' | 'mars'

/** One-way signal delay. Mars varies with orbital geometry from about 3 to 22 minutes. */
export function oneWayDelayMs(link: MissionLink, marsMinutes = 12): number {
  if (link === 'iss') return 0
  if (link === 'moon') return 1_300
  if (!(marsMinutes >= 3 && marsMinutes <= 22)) throw new RangeError('Mars delay must be 3 to 22 minutes')
  return Math.round(marsMinutes * 60_000)
}

export interface SyncRecord {
  id: string
  seq: number
  crewId: string
  category: DataCategory
  createdAt: string
  payload: unknown
}

export interface Batch {
  batchId: string
  crewId: string
  createdAt: string
  auditHead: string
  records: SyncRecord[]
  signature: string
}

type UnsignedBatch = Omit<Batch, 'signature'>

export async function signBatch(batch: UnsignedBatch, privateKey: CryptoKey): Promise<Batch> {
  if (batch.records.some((r) => r.crewId !== batch.crewId)) {
    throw new Error('A batch must only carry records of its own crew member')
  }
  return { ...batch, signature: await signText(privateKey, canonicalJson(batch)) }
}

export async function verifyBatch(batch: Batch, publicKey: CryptoKey): Promise<boolean> {
  const { signature, ...unsigned } = batch
  return verifyText(publicKey, canonicalJson(unsigned), signature)
}

export interface Delivery {
  batch: Batch
  sentAt: number
  arrivesAt: number
}

export function schedule(batch: Batch, sentAt: number, delayMs: number): Delivery {
  return { batch, sentAt, arrivesAt: sentAt + delayMs }
}

export function arrived(queue: readonly Delivery[], now: number): { delivered: Delivery[]; pending: Delivery[] } {
  return {
    delivered: queue.filter((d) => d.arrivesAt <= now),
    pending: queue.filter((d) => d.arrivesAt > now),
  }
}

export interface GroundState {
  records: Map<string, SyncRecord>
  rejectedBatches: string[]
  lastAuditHead?: string
  highestSeq: number
}

export function emptyGround(): GroundState {
  return { records: new Map(), rejectedBatches: [], highestSeq: -1 }
}

/**
 * Idempotent and order-independent: duplicates are ignored by record id, so a batch that arrives
 * twice or out of order leaves the ground state exactly as if it had arrived once, in order.
 */
export async function applyBatch(state: GroundState, batch: Batch, publicKey: CryptoKey): Promise<GroundState> {
  if (!(await verifyBatch(batch, publicKey))) {
    return { ...state, rejectedBatches: [...state.rejectedBatches, batch.batchId] }
  }
  const records = new Map(state.records)
  for (const record of batch.records) {
    if (!records.has(record.id)) records.set(record.id, record)
  }
  // The known audit head only moves forward: an older batch arriving late must not rewind it.
  const batchSeq = Math.max(-1, ...batch.records.map((r) => r.seq))
  const newer = batchSeq > state.highestSeq
  return {
    ...state,
    records,
    highestSeq: newer ? batchSeq : state.highestSeq,
    ...(newer ? { lastAuditHead: batch.auditHead } : {}),
  }
}

export function orderedRecords(state: GroundState): SyncRecord[] {
  return [...state.records.values()].sort((a, b) => a.seq - b.seq)
}
