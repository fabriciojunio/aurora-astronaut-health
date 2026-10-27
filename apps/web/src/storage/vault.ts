import {
  IntegrityError,
  PBKDF2_ITERATIONS,
  decryptJson,
  deriveEncryptionKey,
  encryptJson,
  fromBase64,
  generateSigningKeyPair,
  randomBytes,
  toBase64,
  type EncryptedPayload,
} from '../security/crypto'
import { idbGet, idbGetAllByIndex, idbPut, openDatabase } from './idb'

const VERIFIER_TEXT = 'aurora-vault-v1'
const MAX_FREE_ATTEMPTS = 5
const BASE_LOCKOUT_MS = 30_000
const MAX_LOCKOUT_MS = 30 * 60_000

export class PinPolicyError extends Error {}
export class VaultLockedError extends Error {
  readonly retryAfterMs: number
  constructor(retryAfterMs: number) {
    super(`Too many wrong PINs. Try again in ${Math.ceil(retryAfterMs / 1000)} s.`)
    this.retryAfterMs = retryAfterMs
  }
}
export class WrongPinError extends Error {}

interface VaultMeta {
  salt: string
  iterations: number
  verifier: EncryptedPayload
}

interface AttemptState {
  failures: number
  lockedUntil: number
}

interface StoredRecord {
  collection: string
  id: string
  payload: EncryptedPayload
}

/** Rejects short PINs and the patterns people pick first. */
export function checkPinPolicy(pin: string): void {
  if (!/^\d{6,12}$/.test(pin)) throw new PinPolicyError('The PIN must have 6 to 12 digits.')
  if (/^(\d)\1+$/.test(pin)) throw new PinPolicyError('The PIN cannot repeat a single digit.')
  const ascending = '01234567890123'
  const descending = '98765432109876'
  if (ascending.includes(pin) || descending.includes(pin)) {
    throw new PinPolicyError('The PIN cannot be a simple sequence.')
  }
}

export function lockoutDelay(failures: number): number {
  if (failures < MAX_FREE_ATTEMPTS) return 0
  return Math.min(BASE_LOCKOUT_MS * 2 ** (failures - MAX_FREE_ATTEMPTS), MAX_LOCKOUT_MS)
}

export class Vault {
  private readonly db: IDBDatabase
  private readonly encryptionKey: CryptoKey
  readonly signingKeys: CryptoKeyPair

  private constructor(db: IDBDatabase, encryptionKey: CryptoKey, signingKeys: CryptoKeyPair) {
    this.db = db
    this.encryptionKey = encryptionKey
    this.signingKeys = signingKeys
  }

  static async isInitialized(dbName?: string): Promise<boolean> {
    const db = await openDatabase(dbName)
    try {
      return (await idbGet<VaultMeta>(db, 'meta', 'vault')) !== undefined
    } finally {
      db.close()
    }
  }

  static async create(pin: string, options: { dbName?: string; iterations?: number } = {}) {
    checkPinPolicy(pin)
    const db = await openDatabase(options.dbName)
    if (await idbGet(db, 'meta', 'vault')) {
      db.close()
      throw new Error('Vault already exists on this device.')
    }
    const iterations = options.iterations ?? PBKDF2_ITERATIONS
    const salt = randomBytes(16)
    const key = await deriveEncryptionKey(pin, salt, iterations)
    const meta: VaultMeta = {
      salt: toBase64(salt),
      iterations,
      verifier: await encryptJson(key, VERIFIER_TEXT, 'vault:verifier'),
    }
    const signingKeys = await generateSigningKeyPair()
    await idbPut(db, 'keys', signingKeys, 'signing')
    await idbPut(db, 'meta', meta, 'vault')
    await idbPut(db, 'meta', { failures: 0, lockedUntil: 0 } satisfies AttemptState, 'attempts')
    return new Vault(db, key, signingKeys)
  }

  static async unlock(pin: string, options: { dbName?: string; now?: number } = {}) {
    const now = options.now ?? Date.now()
    const db = await openDatabase(options.dbName)
    const meta = await idbGet<VaultMeta>(db, 'meta', 'vault')
    if (!meta) {
      db.close()
      throw new Error('No vault on this device.')
    }
    const attempts = (await idbGet<AttemptState>(db, 'meta', 'attempts')) ?? {
      failures: 0,
      lockedUntil: 0,
    }
    if (attempts.lockedUntil > now) {
      db.close()
      throw new VaultLockedError(attempts.lockedUntil - now)
    }
    const key = await deriveEncryptionKey(pin, fromBase64(meta.salt), meta.iterations)
    try {
      await decryptJson<string>(key, meta.verifier, 'vault:verifier')
    } catch (error) {
      if (!(error instanceof IntegrityError)) throw error
      const failures = attempts.failures + 1
      await idbPut(db, 'meta', { failures, lockedUntil: now + lockoutDelay(failures) }, 'attempts')
      db.close()
      throw new WrongPinError('Wrong PIN.')
    }
    await idbPut(db, 'meta', { failures: 0, lockedUntil: 0 } satisfies AttemptState, 'attempts')
    const signingKeys = await idbGet<CryptoKeyPair>(db, 'keys', 'signing')
    if (!signingKeys) throw new Error('Signing keys are missing from the vault.')
    return new Vault(db, key, signingKeys)
  }

  async put(collection: string, id: string, value: unknown): Promise<void> {
    const payload = await encryptJson(this.encryptionKey, value, `${collection}:${id}`)
    await idbPut(this.db, 'records', { collection, id, payload } satisfies StoredRecord)
  }

  async get<T>(collection: string, id: string): Promise<T | undefined> {
    const stored = await idbGet<StoredRecord>(this.db, 'records', [collection, id])
    return stored ? decryptJson<T>(this.encryptionKey, stored.payload, `${collection}:${id}`) : undefined
  }

  async list<T>(collection: string): Promise<T[]> {
    const stored = await idbGetAllByIndex<StoredRecord>(this.db, 'records', 'byCollection', collection)
    return Promise.all(
      stored.map((r) => decryptJson<T>(this.encryptionKey, r.payload, `${r.collection}:${r.id}`)),
    )
  }

  lock(): void {
    this.db.close()
  }
}
