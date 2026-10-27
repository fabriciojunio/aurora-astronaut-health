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
        <section className="lock-panel">
          <Brand />
          <p role="alert">
            This browser does not allow encrypted local storage (private mode blocks it in some browsers). AURORA
            stores health data only on this device, so it cannot run here.
          </p>
        </section>
      </main>
    )
  }

  const setup = mode === 'setup'
  return (
    <main className="lock">
      <form className="lock-panel" onSubmit={submit} noValidate>
        <Brand />
        <h1>{setup ? 'Create your PIN' : 'Unlock'}</h1>
        <p className="muted">
          {setup
            ? 'Your health records are encrypted on this device with a key derived from this PIN. There is no recovery: the key never leaves the device.'
            : 'Enter your PIN to decrypt your records.'}
        </p>

        <label htmlFor={pinId}>PIN (6 to 12 digits)</label>
        <input
          id={pinId}
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
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={12}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))}
              disabled={busy}
              required
            />
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
    </main>
  )
}

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true" />
      <span>
        <strong>AURORA</strong>
        <small>Astronaut health monitor</small>
      </span>
    </div>
  )
}
