import { useState } from 'react'
import type { AnomalyModel } from '../ai/isolationForest'
import type { Fetcher } from '../data/loader'
import type { MessageKey } from '../i18n/messages'
import { useI18n } from '../i18n/useI18n'
import { runSelfTest, type CheckResult } from '../selftest/selfTest'
import type { Vault } from '../storage/vault'
import type { Loadable } from './useVerifiedData'

interface Props {
  vault: Vault
  fetcher: Fetcher
  model: Loadable<AnomalyModel>
  kdfIterations?: number
  production?: boolean
}

const STATUS: Record<CheckResult['status'], MessageKey> = { pass: 'check.pass', fail: 'check.fail', warn: 'check.warn' }
const PILL: Record<CheckResult['status'], string> = { pass: 'ok', fail: 'critical', warn: 'watch' }

export function SystemCheckView({ vault, fetcher, model, kdfIterations, production }: Props) {
  const { t } = useI18n()
  const [results, setResults] = useState<CheckResult[] | null>(null)
  const [running, setRunning] = useState(false)

  async function run() {
    setRunning(true)
    setResults(null)
    try {
      setResults(
        await runSelfTest({
          vault,
          fetcher,
          model: model.status === 'ready' ? model.value : undefined,
          kdfIterations,
          production,
        }),
      )
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className="card" aria-labelledby="check-title">
      <h2 id="check-title">{t('check.title')}</h2>
      <button type="button" className="primary" onClick={() => void run()} disabled={running || model.status === 'loading'}>
        {running ? t('check.running') : t('check.run')}
      </button>
      {results && (
        <ul className="checks" aria-label={t('check.title')}>
          {results.map((r) => (
            <li key={r.id}>
              <span className={`pill ${PILL[r.status]}`}>{t(STATUS[r.status])}</span>
              <strong>{t(`check.${r.id}` as MessageKey)}</strong>
              <p>{t(`check.${r.message}` as MessageKey, r.vars)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
