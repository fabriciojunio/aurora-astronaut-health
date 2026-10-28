// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadModel } from '../ai/isolationForest'
import { appendAudit } from '../storage/auditTrail'
import { Vault } from '../storage/vault'
import { diskFetcher } from '../test/diskFetcher'
import { checkCsp, checkData, checkModel, runSelfTest } from './selfTest'

const root = resolve(import.meta.dirname, '../../../..')
const model = loadModel(JSON.parse(readFileSync(resolve(root, 'apps/web/public/models/anomaly-v1.json'), 'utf-8')))
let n = 0
const newVault = () => Vault.create('480137', { dbName: `selftest-${++n}`, iterations: 1_000 })

describe('system self-test', () => {
  it('publishes the same parity vectors the training produced', () => {
    const published = readFileSync(resolve(root, 'apps/web/public/models/anomaly-v1-parity.json'), 'utf-8')
    const trained = readFileSync(resolve(root, 'ml/data/parity.json'), 'utf-8')
    expect(published).toBe(trained)
  })

  it('passes every check that a development build can prove', async () => {
    const vault = await newVault()
    await appendAudit(vault, { actor: 'crew-1', action: 'checkin.saved', detail: {} })
    const results = await runSelfTest({ vault, fetcher: diskFetcher(), model, kdfIterations: 1_000, production: false })
    const byId = Object.fromEntries(results.map((r) => [r.id, r]))
    for (const id of ['crypto', 'kdf', 'data', 'model', 'audit', 'sync'] as const) {
      expect(byId[id], `${id}: ${JSON.stringify(byId[id])}`).toMatchObject({ status: 'pass' })
    }
    expect(byId.data!.vars).toEqual({ files: 3 })
    expect(Number(byId.model!.vars!.n)).toBeGreaterThan(30)
    expect(byId.audit!.vars).toEqual({ n: 1 })
    // jsdom has no CSP and no service worker: both are reported as notes, not as passes.
    expect(byId.csp).toMatchObject({ status: 'warn', message: 'cspDev' })
    expect(byId.offline).toMatchObject({ status: 'warn', message: 'offlineWait' })
  })

  it('fails the CSP check in a production build where eval still runs', () => {
    expect(checkCsp(true)).toMatchObject({ status: 'fail' })
  })

  it('fails when the model is missing or its scores drift', async () => {
    expect(await checkModel(diskFetcher(), undefined)).toMatchObject({ status: 'fail' })
    const drifted = { ...model, threshold: model.threshold, trees: model.trees.slice(1) }
    expect(await checkModel(diskFetcher(), drifted)).toMatchObject({ status: 'fail' })
  })

  it('fails when a data file was replaced', async () => {
    const tampered = diskFetcher({ '/data/osdr-studies.json': '{"records":[]}' })
    expect(await checkData(tampered)).toMatchObject({ status: 'fail' })
  })

  it('fails the audit check when an entry was edited', async () => {
    const vault = await newVault()
    const entry = await appendAudit(vault, { actor: 'crew-1', action: 'consent.changed', detail: { allowed: false } })
    await vault.put('audit', '0000000000', { ...entry, detail: { allowed: true } })
    const results = await runSelfTest({ vault, fetcher: diskFetcher(), model, kdfIterations: 1_000, production: false })
    expect(results.find((r) => r.id === 'audit')).toMatchObject({ status: 'fail' })
  })
})
