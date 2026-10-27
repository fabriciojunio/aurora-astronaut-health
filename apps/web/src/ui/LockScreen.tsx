import { useEffect, useId, useState, type FormEvent } from 'react'
import { LanguageSwitch } from '../i18n/LanguageSwitch'
import type { MessageKey } from '../i18n/messages'
import { useI18n } from '../i18n/useI18n'
import { PinPolicyError, Vault, VaultLockedError, WrongPinError, checkPinPolicy } from '../storage/vault'

interface Props {
  onUnlock: (vault: Vault) => void
  dbName?: string
  /** Tests pass a low value; the app uses the OWASP default from the crypto module. */
  iterations?: number
}

type Mode = 'checking' | 'setup' | 'unlock' | 'unavailable'

// The vault reports policy problems in English; the screen shows them in the reader's language.
function policyKey(message: string): MessageKey {
  if (message.includes('repeat')) return 'lock.policyRepeat'
  if (message.includes('sequence')) return 'lock.policySequence'
  return 'lock.policyLength'
}

export function LockScreen({ onUnlock, dbName, iterations }: Props) {
  const { t } = useI18n()
  const [mode, setMode] = useState<Mode>('checking')
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<MessageKey | null>(null)
  const [busy, setBusy] = useState(false)
  const [lockedUntil, setLockedUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const pinId = useId()
  const confirmId = useId()

  useEffect(() => {
    let active = true
    Vault.isInitialized(dbName).then(
      (exists) => active && setMode(exists ? 'unlock' : 'setup'),
      () => active && setMode('unavailable'),
    )
    return () => {
      active = false
    }
  }, [dbName])

  const waitSeconds = Math.max(0, Math.ceil((lockedUntil - now) / 1000))
  useEffect(() => {
    if (waitSeconds === 0) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [waitSeconds])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'setup') {
        try {
          checkPinPolicy(pin)
        } catch (err) {
          if (err instanceof PinPolicyError) throw new PinPolicyError(policyKey(err.message))
          throw err
        }
        if (pin !== confirm) throw new PinPolicyError('lock.mismatch')
      }
      const vault =
        mode === 'setup' ? await Vault.create(pin, { dbName, iterations }) : await Vault.unlock(pin, { dbName })
      onUnlock(vault)
    } catch (err) {
      if (err instanceof PinPolicyError) {
        setError(err.message as MessageKey)
      } else if (err instanceof WrongPinError) {
        setError('lock.wrong')
      } else if (err instanceof VaultLockedError) {
        setLockedUntil(Date.now() + err.retryAfterMs)
        setNow(Date.now())
        setError('lock.tooMany')
      } else {
        setError('lock.failed')
      }
    } finally {
      // The PIN never stays in memory longer than the attempt.
      setPin('')
      setConfirm('')
      setBusy(false)
    }
  }

  if (mode === 'checking') return <main className="lock" aria-busy="true" />

  if (mode === 'unavailable') {
    return (
      <main className="lock">
        <LockBar />
        <section className="lock-form">
          <h1>{t('lock.blocked')}</h1>
          <p role="alert">{t('lock.blockedText')}</p>
        </section>
        <StatusLine vault="status.unavailable" />
      </main>
    )
  }

  const setup = mode === 'setup'
  return (
    <main className="lock">
      <LockBar />
      <form className="lock-form" onSubmit={submit} noValidate>
        <h1>{setup ? t('lock.create') : t('lock.unlock')}</h1>

        <label htmlFor={pinId}>{t('lock.pin')}</label>
        <input
          id={pinId}
          className="pin"
          type="password"
          inputMode="numeric"
          autoComplete={setup ? 'new-password' : 'current-password'}
          maxLength={12}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          disabled={busy || waitSeconds > 0}
          required
        />

        {setup && (
          <>
            <label htmlFor={confirmId}>{t('lock.repeat')}</label>
            <input
              id={confirmId}
              className="pin"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={12}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))}
              disabled={busy}
              required
            />
            <p className="hint">{t('lock.noRecovery')}</p>
          </>
        )}

        <p className="form-error" role="alert">
          {error && t(error)}
          {waitSeconds > 0 && ` ${t('lock.retryIn', { s: waitSeconds })}`}
        </p>

        <button type="submit" className="primary" disabled={busy || waitSeconds > 0 || pin.length === 0}>
          {busy ? t('lock.deriving') : setup ? t('lock.createVault') : t('lock.unlock')}
        </button>
      </form>
      <StatusLine vault={setup ? 'status.notCreated' : waitSeconds > 0 ? 'status.lockedOut' : 'status.locked'} />
    </main>
  )
}

function LockBar() {
  const { t } = useI18n()
  return (
    <header className="lock-bar">
      <Brand />
      <span className="sim-badge">{t('sim.badge')}</span>
      <LanguageSwitch />
    </header>
  )
}

function StatusLine({ vault }: { vault: MessageKey }) {
  const { t } = useI18n()
  return (
    <footer className="status-line" aria-label={t('status.label')}>
      <span>
        <b>{t('status.vault')}</b> {t(vault)}
      </span>
      <span>
        <b>{t('status.storage')}</b> {t('status.local')}
      </span>
      <span>
        <b>{t('status.link')}</b> {t('status.notRequired')}
      </span>
    </footer>
  )
}

export function Brand() {
  const { t } = useI18n()
  return (
    <div className="brand">
      <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M3 22a13 13 0 0 1 26 0" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M7 13c5-4 13-4 18 0" fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="square" />
        <line x1="1" y1="26" x2="31" y2="26" stroke="currentColor" strokeWidth="2" />
      </svg>
      <span>
        <strong>AURORA</strong>
        <small>{t('brand.tagline')}</small>
      </span>
    </div>
  )
}
