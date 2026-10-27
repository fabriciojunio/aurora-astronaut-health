import { useEffect, useId, useState } from 'react'
import { AUDIENCES, DATA_CATEGORIES, setConsent, type Audience, type ConsentState, type DataCategory } from '../domain/consent'
import type { RadiationEnvironment } from '../domain/radiation'
import type { AuditEntry, ChainVerification } from '../security/auditLog'
import { appendAudit, readAuditTrail, verifyAuditTrail } from '../storage/auditTrail'
import type { Vault } from '../storage/vault'
import { oneWayDelayMs, orderedRecords, type Batch, type MissionLink } from '../sync/outbox'
import { buildGroundBatch, consentId, loadConsent } from '../sync/outgoing'
import { CrewPicker } from './CrewPicker'
import type { GroundLink } from './useGroundLink'

interface Props {
  vault: Vault
  crewId: string
  onCrewChange: (crewId: string) => void
  environment: RadiationEnvironment
  link: GroundLink
}

const AUDIENCE_LABEL: Record<Audience, string> = {
  crewMedicalOfficer: 'Crew medical officer',
  ground: 'Flight surgeon (ground)',
}

const CATEGORY_LABEL: Record<DataCategory, string> = {
  alerts: 'Alerts',
  vitals: 'Vital signs',
  checkins: 'Check-ins',
  cognition: 'Vigilance tests',
  radiation: 'Radiation dose',
  notes: 'Free-text notes',
}

const LINK_OF: Record<RadiationEnvironment, MissionLink> = {
  iss: 'iss',
  lunar_orbit: 'moon',
  mars_transit: 'mars',
  mars_surface: 'mars',
}

const MARS_DELAYS = [3, 12, 22]

const clock = (ms: number) => new Date(ms).toISOString().slice(11, 19)
const records = (count: number) => `${count} ${count === 1 ? 'record' : 'records'}`

export function PrivacyView({ vault, crewId, onCrewChange, environment, link }: Props) {
  const [consent, setConsentState] = useState<ConsentState | null>(null)
  const [trail, setTrail] = useState<AuditEntry[]>([])
  const [verification, setVerification] = useState<ChainVerification | null>(null)
  const [marsMinutes, setMarsMinutes] = useState(12)
  const [message, setMessage] = useState('')
  const ids = useId()
  const missionLink = LINK_OF[environment]
  const delayMs = oneWayDelayMs(missionLink, marsMinutes)

  useEffect(() => {
    let active = true
    loadConsent(vault, crewId).then((c) => active && setConsentState(c))
    return () => {
      active = false
    }
  }, [vault, crewId])

  useEffect(() => {
    let active = true
    readAuditTrail(vault).then((t) => active && setTrail(t))
    return () => {
      active = false
    }
  }, [vault, consent, link.pending.length])

  async function toggle(audience: Audience, category: DataCategory, allowed: boolean) {
    if (!consent) return
    const previous = consent
    const next = setConsent(consent, audience, category, allowed)
    // The box changes at once; if the encrypted save fails it goes back, so the screen never claims
    // a permission that was not stored.
    setConsentState(next)
    setVerification(null)
    try {
      await vault.put('settings', consentId(crewId), next)
      await appendAudit(vault, { actor: crewId, action: 'consent.changed', detail: { audience, category, allowed } })
    } catch {
      setConsentState(previous)
      setMessage('The change could not be saved. Nothing was shared.')
    }
  }

  async function send(tamper: boolean) {
    setMessage('')
    const batch = await buildGroundBatch(vault, crewId)
    if (!batch) {
      setMessage('Nothing to send: no stored record is allowed for the ground.')
      return
    }
    await appendAudit(vault, { actor: crewId, action: 'sync.sent', detail: { batchId: batch.batchId, records: batch.records.length } })
    link.send(tamper ? tamperInTransit(batch) : batch, delayMs)
    setMessage(`Sent ${records(batch.records.length)}${tamper ? ', and one was altered in transit' : ''}.`)
  }

  async function verify() {
    setTrail(await readAuditTrail(vault))
    setVerification(await verifyAuditTrail(vault))
  }

  const received = orderedRecords(link.ground)

  return (
    <div className="stack">
      <section className="card" aria-labelledby={`${ids}-consent`}>
        <h2 id={`${ids}-consent`}>Who can see your data</h2>
        <CrewPicker crewId={crewId} onChange={onCrewChange} />
        <p className="muted small">
          Everything starts private. Nothing leaves this device unless you allow that category for that person. Each
          change is written to the signed audit trail.
        </p>
        {consent && (
          <table className="consent">
            <thead>
              <tr>
                <th scope="col">Data</th>
                {AUDIENCES.map((a) => (
                  <th key={a} scope="col">
                    {AUDIENCE_LABEL[a]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DATA_CATEGORIES.map((c) => (
                <tr key={c}>
                  <th scope="row">{CATEGORY_LABEL[c]}</th>
                  {AUDIENCES.map((a) => (
                    <td key={a}>
                      <input
                        type="checkbox"
                        aria-label={`Share ${CATEGORY_LABEL[c]} with ${AUDIENCE_LABEL[a]}`}
                        checked={consent[a][c]}
                        onChange={(e) => void toggle(a, c, e.target.checked)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card" aria-labelledby={`${ids}-sync`}>
        <h2 id={`${ids}-sync`}>Send to the ground</h2>
        <p className="muted small">
          Batches are signed on this device with ECDSA P-256. The ground checks the signature and ignores duplicates,
          so a batch that arrives twice or out of order changes nothing.
        </p>
        <p>
          One-way delay for this mission: <strong>{delayLabel(missionLink, delayMs)}</strong>
        </p>
        {missionLink === 'mars' && (
          <div className="field inline">
            <label htmlFor={`${ids}-mars`}>Earth to Mars distance today</label>
            <select id={`${ids}-mars`} value={marsMinutes} onChange={(e) => setMarsMinutes(Number(e.target.value))}>
              {MARS_DELAYS.map((m) => (
                <option key={m} value={m}>
                  {m} minutes one way
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="button-row">
          <button type="button" className="primary" onClick={() => void send(false)}>
            Send allowed data
          </button>
          <button type="button" onClick={() => void send(true)}>
            Send and alter it in transit (demo)
          </button>
        </div>
        <p className="form-status" role="status">
          {message}
        </p>

        {link.pending.length > 0 && (
          <>
            <h3 className="section-title">In transit</h3>
            <ul className="plain">
              {link.pending.map((d) => (
                <li key={d.batch.batchId} className="mono small">
                  {records(d.batch.records.length)}, arrives {clock(d.arrivesAt)} UTC
                </li>
              ))}
            </ul>
            <button type="button" className="link" onClick={link.deliverAllNow}>
              Skip the wait (training mode)
            </button>
          </>
        )}

        <h3 className="section-title">Ground station</h3>
        <dl className="readouts">
          <div>
            <dt>Records received</dt>
            <dd>{received.length}</dd>
          </div>
          <div>
            <dt>Batches rejected</dt>
            <dd className={link.ground.rejectedBatches.length > 0 ? 'high' : undefined}>
              {link.ground.rejectedBatches.length}
            </dd>
          </div>
          <div>
            <dt>Last audit head</dt>
            <dd>{link.ground.lastAuditHead ? `${link.ground.lastAuditHead.slice(0, 12)}…` : 'none'}</dd>
          </div>
        </dl>
        {link.ground.rejectedBatches.length > 0 && (
          <p className="small">A batch failed its signature check and was discarded. The ground never stores data it cannot verify.</p>
        )}
      </section>

      <section className="card" aria-labelledby={`${ids}-audit`}>
        <h2 id={`${ids}-audit`}>Audit trail</h2>
        <p className="muted small">
          Every save, consent change and transmission, chained by SHA-256 and signed. Content is never written here, only
          that something happened.
        </p>
        <button type="button" onClick={() => void verify()}>
          Verify the chain
        </button>
        {verification && (
          <p role="status" className={verification.ok ? 'ok-text' : 'bad-text'}>
            {verification.ok
              ? `Chain intact: ${verification.length} entries, every signature valid.`
              : `Chain broken at entry ${verification.brokenAt}: ${verification.reason}.`}
          </p>
        )}
        <table className="audit">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Time (UTC)</th>
              <th scope="col">Who</th>
              <th scope="col">What</th>
            </tr>
          </thead>
          <tbody>
            {[...trail].reverse().map((e) => (
              <tr key={e.seq}>
                <td>{e.seq}</td>
                <td>{e.at.slice(0, 19).replace('T', ' ')}</td>
                <td>{e.actor}</td>
                <td>{e.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function delayLabel(link: MissionLink, ms: number): string {
  if (link === 'iss') return 'none (continuous coverage from low Earth orbit)'
  if (link === 'moon') return `${(ms / 1000).toFixed(1)} s (Moon)`
  return `${Math.round(ms / 60_000)} min (Mars)`
}

/** Changes one value after signing, the way a corrupted or forged relay would. */
function tamperInTransit(batch: Batch): Batch {
  const [first, ...rest] = batch.records
  if (!first) return batch
  return { ...batch, records: [{ ...first, payload: { altered: true } }, ...rest] }
}
