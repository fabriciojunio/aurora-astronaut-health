// Checks that run in the reader's own browser, so a judge or a crew member can see the security
// and the model working instead of taking the README's word for it. Each check uses the same code
// the app uses; none of them changes stored data.

import { z } from 'zod'
import { anomalyScore, type AnomalyModel } from '../ai/isolationForest'
import { hourlyDoseSchema, loadJson, loadManifest, loadSnapshot, type Fetcher } from '../data/loader'
import {
  IntegrityError,
  PBKDF2_ITERATIONS,
  decryptJson,
  deriveEncryptionKey,
  encryptJson,
  randomBytes,
} from '../security/crypto'
import { verifyAuditTrail } from '../storage/auditTrail'
import type { Vault } from '../storage/vault'
import { signBatch, verifyBatch } from '../sync/outbox'

export const PARITY_PATH = '/models/anomaly-v1-parity.json'

export type CheckStatus = 'pass' | 'fail' | 'warn'
export interface CheckResult {
  id: 'crypto' | 'kdf' | 'data' | 'model' | 'audit' | 'sync' | 'csp' | 'offline'
  status: CheckStatus
  /** Message key suffix and the values it needs; the screen words it. */
  message: string
  vars?: Record<string, string | number>
}

export interface SelfTestContext {
  vault: Vault
  fetcher: Fetcher
  model: AnomalyModel | undefined
  /** Lower in tests; the app measures the real cost. */
  kdfIterations?: number
  production?: boolean
}

const failed = (id: CheckResult['id'], error: unknown): CheckResult => ({
  id,
  status: 'fail',
  message: 'failed',
  vars: { detail: error instanceof Error ? error.message : String(error) },
})

async function refuses(promise: Promise<unknown>): Promise<boolean> {
  try {
    await promise
    return false
  } catch (error) {
    return error instanceof IntegrityError
  }
}

export async function checkCrypto(): Promise<CheckResult> {
  try {
    const key = await deriveEncryptionKey('self-test', randomBytes(16), 1_000)
    const payload = await encryptJson(key, { probe: 'aurora' }, 'selftest:a')
    const back = await decryptJson<{ probe: string }>(key, payload, 'selftest:a')
    const flipped = { ...payload, ciphertext: payload.ciphertext.slice(0, -4) + (payload.ciphertext.endsWith('AAAA') ? 'BBBB' : 'AAAA') }
    const altered = await refuses(decryptJson(key, flipped, 'selftest:a'))
    const moved = await refuses(decryptJson(key, payload, 'selftest:b'))
    if (back.probe !== 'aurora' || !altered || !moved) throw new Error('tampering was not detected')
    return { id: 'crypto', status: 'pass', message: 'cryptoPass' }
  } catch (error) {
    return failed('crypto', error)
  }
}

export async function checkKdf(iterations = PBKDF2_ITERATIONS): Promise<CheckResult> {
  try {
    const started = performance.now()
    await deriveEncryptionKey('self-test', randomBytes(16), iterations)
    const ms = Math.round(performance.now() - started)
    return { id: 'kdf', status: 'pass', message: 'kdfPass', vars: { n: iterations.toLocaleString('en-US'), ms } }
  } catch (error) {
    return failed('kdf', error)
  }
}

export async function checkData(fetcher: Fetcher): Promise<CheckResult> {
  try {
    const manifest = await loadManifest(fetcher)
    for (const entry of manifest.snapshots) {
      await loadSnapshot(fetcher, manifest, entry.file, z.unknown())
    }
    // The same file with one byte changed must be refused before it is parsed.
    const target = 'radiation-may-2024.json'
    const tampering: Fetcher = async (path) => {
      const response = await fetcher(path)
      if (!path.endsWith(target)) return response
      const bytes = new Uint8Array(await response.arrayBuffer())
      bytes[bytes.length - 2] = bytes[bytes.length - 2] === 0x20 ? 0x09 : 0x20
      return { ok: true, arrayBuffer: async () => bytes.buffer }
    }
    let refused = false
    try {
      await loadSnapshot(tampering, manifest, target, hourlyDoseSchema)
    } catch {
      refused = true
    }
    if (!refused) throw new Error('an altered file was accepted')
    return { id: 'data', status: 'pass', message: 'dataPass', vars: { files: manifest.snapshots.length } }
  } catch (error) {
    return failed('data', error)
  }
}

const paritySchema = z.array(z.strictObject({ x: z.array(z.number().finite()), score: z.number().finite() })).min(1)

export async function checkModel(fetcher: Fetcher, model: AnomalyModel | undefined): Promise<CheckResult> {
  try {
    if (!model) throw new Error('the model file did not load')
    const vectors = paritySchema.parse(await loadJson(fetcher, PARITY_PATH))
    const diff = Math.max(...vectors.map((v) => Math.abs(anomalyScore(model, v.x) - v.score)))
    if (!(diff < 1e-9)) throw new Error(`scores differ by ${diff}`)
    return { id: 'model', status: 'pass', message: 'modelPass', vars: { n: vectors.length, diff: diff.toExponential(1) } }
  } catch (error) {
    return failed('model', error)
  }
}

export async function checkAudit(vault: Vault): Promise<CheckResult> {
  try {
    const result = await verifyAuditTrail(vault)
    if (!result.ok) throw new Error(`chain broken at entry ${result.brokenAt}: ${result.reason}`)
    return { id: 'audit', status: 'pass', message: 'auditPass', vars: { n: result.length } }
  } catch (error) {
    return failed('audit', error)
  }
}

export async function checkSync(vault: Vault): Promise<CheckResult> {
  try {
    const batch = await signBatch(
      {
        batchId: 'self-test',
        crewId: 'crew-1',
        createdAt: new Date().toISOString(),
        auditHead: '0'.repeat(64),
        records: [{ id: 'self-test:1', seq: 0, crewId: 'crew-1', category: 'alerts', createdAt: new Date().toISOString(), payload: { level: 1 } }],
      },
      vault.signingKeys.privateKey,
    )
    const valid = await verifyBatch(batch, vault.signingKeys.publicKey)
    const altered = await verifyBatch({ ...batch, records: [{ ...batch.records[0]!, payload: { level: 9 } }] }, vault.signingKeys.publicKey)
    if (!valid || altered) throw new Error('signature check did not behave')
    return { id: 'sync', status: 'pass', message: 'syncPass' }
  } catch (error) {
    return failed('sync', error)
  }
}

/** Under the published CSP, eval and raw HTML writes throw. In a development build they do not. */
export function checkCsp(production: boolean): CheckResult {
  let evalBlocked = false
  let htmlBlocked = false
  try {
    new Function('return 1')()
  } catch {
    evalBlocked = true
  }
  try {
    document.createElement('div').innerHTML = '<b>probe</b>'
  } catch {
    htmlBlocked = true
  }
  if (evalBlocked && htmlBlocked) return { id: 'csp', status: 'pass', message: 'cspPass' }
  if (!production) return { id: 'csp', status: 'warn', message: 'cspDev' }
  return { id: 'csp', status: 'fail', message: 'failed', vars: { detail: `eval ${evalBlocked ? 'blocked' : 'allowed'}, innerHTML ${htmlBlocked ? 'blocked' : 'allowed'}` } }
}

export async function checkOffline(): Promise<CheckResult> {
  try {
    if (typeof caches === 'undefined' || !('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
      return { id: 'offline', status: 'warn', message: 'offlineWait' }
    }
    const names = (await caches.keys()).filter((k) => k.startsWith('aurora-'))
    let n = 0
    for (const name of names) n += (await (await caches.open(name)).keys()).length
    return n > 0 ? { id: 'offline', status: 'pass', message: 'offlinePass', vars: { n } } : { id: 'offline', status: 'warn', message: 'offlineWait' }
  } catch (error) {
    return failed('offline', error)
  }
}

export async function runSelfTest(ctx: SelfTestContext): Promise<CheckResult[]> {
  return [
    await checkCrypto(),
    await checkKdf(ctx.kdfIterations),
    await checkData(ctx.fetcher),
    await checkModel(ctx.fetcher, ctx.model),
    await checkAudit(ctx.vault),
    await checkSync(ctx.vault),
    checkCsp(ctx.production ?? import.meta.env.PROD),
    await checkOffline(),
  ]
}
