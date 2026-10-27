import { useEffect, useId, useState, type FormEvent } from 'react'
import { PinPolicyError, Vault, VaultLockedError, WrongPinError, checkPinPolicy } from '../storage/vault'

interface Props {
  onUnlock: (vault: Vault) => void
  dbName?: string
  /** Tests pass a low value; the app uses the OWASP default from the crypto module. */
  iterations?: number
}

type Mode = 'checking' | 'setup' | 'unlock' | 'unavailable'

export function LockScreen({ onUnlock, dbName, iterations }: Props) {
  const [mode, setMode] = useState<Mode>('checking')
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
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
    setError('')
    setBusy(true)
    try {
      if (mode === 'setup') {
        checkPinPolicy(pin)
        if (pin !== confirm) throw new PinPolicyError('The two PINs do not match.')
      }
      const vault =
        mode === 'setup' ? await Vault.create(pin, { dbName, iterations }) : await Vault.unlock(pin, { dbName })
      onUnlock(vault)
    } catch (err) {
      if (err instanceof PinPolicyError || err instanceof WrongPinError) {
        setError(err.message)
      } else if (err instanceof VaultLockedError) {
        setLockedUntil(Date.now() + err.retryAfterMs)
        setNow(Date.now())
        setError('Too many wrong PINs. Wait before trying again.')
      } else {
        setError('The vault could not be opened on this device.')
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
          <h1>Storage blocked</h1>
          <p role="alert">Encrypted local storage is blocked in this browser. Private mode can cause this.</p>
        </section>
        <StatusLine vault="unavailable" />
      </main>
    )
  }

  const setup = mode === 'setup'
  return (
    <main className="lock">
      <LockBar />
      <form className="lock-form" onSubmit={submit} noValidate>
        <h1>{setup ? 'Create your PIN' : 'Unlock'}</h1>

        <label htmlFor={pinId}>PIN (6 to 12 digits)</label>
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
            <label htmlFor={confirmId}>Repeat the PIN</label>
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
            <p className="hint">A forgotten PIN cannot be recovered.</p>
          </>
        )}

        <p className="form-error" role="alert">
          {error}
          {waitSeconds > 0 && ` Try again in ${waitSeconds} s.`}
        </p>

        <button type="submit" className="primary" disabled={busy || waitSeconds > 0 || pin.length === 0}>
          {busy ? 'Deriving key…' : setup ? 'Create vault' : 'Unlock'}
        </button>
      </form>
      <StatusLine vault={setup ? 'not created' : waitSeconds > 0 ? 'locked out' : 'locked'} />
    </main>
  )
}

function LockBar() {
  return (
    <header className="lock-bar">
      <Brand />
      <span className="sim-badge">Simulated crew data</span>
    </header>
  )
}

function StatusLine({ vault }: { vault: string }) {
  return (
    <footer className="status-line" aria-label="System status">
      <span>
        <b>Vault</b> {vault}
      </span>
      <span>
        <b>Storage</b> local, AES-256
      </span>
      <span>
        <b>Link</b> not required
      </span>
    </footer>
  )
}

export function Brand() {
  return (
    <div className="brand">
      <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M3 22a13 13 0 0 1 26 0" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M7 13c5-4 13-4 18 0" fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="square" />
        <line x1="1" y1="26" x2="31" y2="26" stroke="currentColor" strokeWidth="2" />
      </svg>
      <span>
        <strong>AURORA</strong>
        <small>Crew health system</small>
      </span>
    </div>
  )
}
