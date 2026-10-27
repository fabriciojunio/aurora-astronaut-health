import { IntegrityError } from '../security/crypto'
import { idbGet, openDatabase } from './idb'
import {
  PinPolicyError,
  Vault,
  VaultLockedError,
  WrongPinError,
  checkPinPolicy,
  lockoutDelay,
} from './vault'

const FAST = { iterations: 1_000 }
let dbName: string
let counter = 0

beforeEach(() => {
  dbName = `aurora-test-${counter++}`
})

describe('PIN policy', () => {
  it.each(['12345', 'abcdef', '12345a', '1234567890123'])('rejects badly formed PIN %s', (pin) => {
    expect(() => checkPinPolicy(pin)).toThrow(PinPolicyError)
  })

  it.each(['000000', '111111', '123456', '654321', '012345', '98765432'])(
    'rejects trivial PIN %s',
    (pin) => {
      expect(() => checkPinPolicy(pin)).toThrow(PinPolicyError)
    },
  )

  it.each(['482913', '730154', '1029384756'])('accepts PIN %s', (pin) => {
    expect(() => checkPinPolicy(pin)).not.toThrow()
  })
})

describe('lockout delay', () => {
  it('allows the first attempts freely, then doubles, then caps at 30 minutes', () => {
    expect(lockoutDelay(4)).toBe(0)
    expect(lockoutDelay(5)).toBe(30_000)
    expect(lockoutDelay(6)).toBe(60_000)
    expect(lockoutDelay(7)).toBe(120_000)
    expect(lockoutDelay(50)).toBe(30 * 60_000)
  })
})

describe('vault', () => {
  it('reports whether the device already has a vault', async () => {
    expect(await Vault.isInitialized(dbName)).toBe(false)
    const vault = await Vault.create('482913', { ...FAST, dbName })
    vault.lock()
    expect(await Vault.isInitialized(dbName)).toBe(true)
  })

  it('refuses to create a second vault over an existing one', async () => {
    ;(await Vault.create('482913', { ...FAST, dbName })).lock()
    await expect(Vault.create('730154', { ...FAST, dbName })).rejects.toThrow('already exists')
  })

  it('refuses to unlock a device without a vault', async () => {
    await expect(Vault.unlock('482913', { dbName })).rejects.toThrow('No vault')
  })

  it('stores records encrypted and reads them back after unlocking again', async () => {
    const vault = await Vault.create('482913', { ...FAST, dbName })
    await vault.put('checkins', 'c1', { sleepHours: 6.1, symptoms: ['headache'] })
    await vault.put('checkins', 'c2', { sleepHours: 7.0, symptoms: [] })
    await vault.put('vitals', 'v1', { hr: 61 })
    vault.lock()

    const reopened = await Vault.unlock('482913', { dbName })
    expect(await reopened.get('checkins', 'c1')).toEqual({ sleepHours: 6.1, symptoms: ['headache'] })
    expect(await reopened.list('checkins')).toHaveLength(2)
    expect(await reopened.list('vitals')).toEqual([{ hr: 61 }])
    expect(await reopened.get('checkins', 'missing')).toBeUndefined()
    reopened.lock()
  })

  it('never writes plaintext health data to IndexedDB', async () => {
    const vault = await Vault.create('482913', { ...FAST, dbName })
    await vault.put('checkins', 'c1', { note: 'blurred vision in the left eye' })
    vault.lock()
    const db = await openDatabase(dbName)
    const raw = await idbGet(db, 'records', ['checkins', 'c1'])
    db.close()
    expect(JSON.stringify(raw)).not.toContain('blurred')
  })

  it('detects a record swapped into another slot in the database', async () => {
    const vault = await Vault.create('482913', { ...FAST, dbName })
    await vault.put('checkins', 'mine', { owner: 'crew-1' })
    vault.lock()
    const db = await openDatabase(dbName)
    const stored = (await idbGet<{ payload: unknown }>(db, 'records', ['checkins', 'mine']))!
    const tx = db.transaction('records', 'readwrite')
    tx.objectStore('records').put({ collection: 'checkins', id: 'other', payload: stored.payload })
    await new Promise((resolve) => (tx.oncomplete = resolve))
    db.close()

    const reopened = await Vault.unlock('482913', { dbName })
    await expect(reopened.get('checkins', 'other')).rejects.toThrow(IntegrityError)
    reopened.lock()
  })

  it('keeps the signing private key non-extractable across sessions', async () => {
    ;(await Vault.create('482913', { ...FAST, dbName })).lock()
    const vault = await Vault.unlock('482913', { dbName })
    expect(vault.signingKeys.privateKey.extractable).toBe(false)
    vault.lock()
  })

  it('locks out progressively after repeated wrong PINs and survives a page reload', async () => {
    ;(await Vault.create('482913', { ...FAST, dbName })).lock()
    const t0 = 1_000_000
    for (let i = 0; i < 5; i++) {
      await expect(Vault.unlock('000001', { dbName, now: t0 })).rejects.toThrow(WrongPinError)
    }
    // The fifth failure starts a 30 s lockout: even the right PIN is refused meanwhile.
    await expect(Vault.unlock('482913', { dbName, now: t0 + 1_000 })).rejects.toThrow(
      VaultLockedError,
    )
    const afterLockout = await Vault.unlock('482913', { dbName, now: t0 + 31_000 })
    afterLockout.lock()
    // A successful unlock resets the counter.
    await expect(Vault.unlock('000001', { dbName, now: t0 + 32_000 })).rejects.toThrow(WrongPinError)
    const again = await Vault.unlock('482913', { dbName, now: t0 + 33_000 })
    again.lock()
  })

  it('reports how long the user has to wait', async () => {
    ;(await Vault.create('482913', { ...FAST, dbName })).lock()
    for (let i = 0; i < 5; i++) {
      await Vault.unlock('000001', { dbName, now: 0 }).catch(() => undefined)
    }
    const error = await Vault.unlock('482913', { dbName, now: 10_000 }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(VaultLockedError)
    expect((error as VaultLockedError).retryAfterMs).toBe(20_000)
  })
})
