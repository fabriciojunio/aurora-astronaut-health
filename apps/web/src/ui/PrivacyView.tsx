import { useEffect, useId, useState } from 'react'
import { AUDIENCES, DATA_CATEGORIES, setConsent, type Audience, type ConsentState, type DataCategory } from '../domain/consent'
import type { RadiationEnvironment } from '../domain/radiation'
import type { AuditEntry, ChainVerification } from '../security/auditLog'
import { appendAudit, readAuditTrail, verifyAuditTrail } from '../storage/auditTrail'
import type { Vault } from '../storage/vault'
import { oneWayDelayMs, orderedRecords, type Batch, type MissionLink } from '../sync/outbox'
import { buildGroundBatch, consentId, loadConsent } from '../sync/outgoing'
import type { Lang, MessageKey } from '../i18n/messages'
import { useI18n } from '../i18n/useI18n'
import { CrewPicker } from './CrewPicker'
import type { GroundLink } from './useGroundLink'

interface Props {
  vault: Vault
  crewId: string
  onCrewChange: (crewId: string) => void
  environment: RadiationEnvironment
  link: GroundLink
}

const AUDIENCE_LABEL: Record<Audience, MessageKey> = {
  crewMedicalOfficer: 'audience.crewMedicalOfficer',
  ground: 'audience.ground',
}

const CATEGORY_LABEL: Record<DataCategory, MessageKey> = {
  alerts: 'category.alerts',
  vitals: 'category.vitals',
  checkins: 'category.checkins',
  cognition: 'category.cognition',
  radiation: 'category.radiation',
  notes: 'category.notes',
}

// The audit chain reports why it broke in English; the screen words it for the reader.
const REASON_PT: Record<string, string> = {
  'sequence gap or reorder': 'lacuna ou reordenação na sequência',
  'broken link': 'elo rompido',
  'content changed': 'conteúdo alterado',
  'invalid signature': 'assinatura inválida',
  'known head missing (truncated chain)': 'cabeça conhecida ausente (cadeia truncada)',
}

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string

const LINK_OF: Record<RadiationEnvironment, MissionLink> = {
  iss: 'iss',
  lunar_orbit: 'moon',
  mars_transit: 'mars',
  mars_surface: 'mars',
}

const MARS_DELAYS = [3, 12, 22]

const clock = (ms: number) => new Date(ms).toISOString().slice(11, 19)

export function PrivacyView({ vault, crewId, onCrewChange, environment, link }: Props) {
  const [consent, setConsentState] = useState<ConsentState | null>(null)
  const [trail, setTrail] = useState<AuditEntry[]>([])
  const [verification, setVerification] = useState<ChainVerification | null>(null)
  const [marsMinutes, setMarsMinutes] = useState(12)
  const { t, lang } = useI18n()
  const [message, setMessage] = useState<{ key: MessageKey; n?: number } | null>(null)
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
    readAuditTrail(vault).then((entries) => active && setTrail(entries))
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
      setMessage({ key: 'privacy.saveFailed' })
    }
  }

  async function send(tamper: boolean) {
    setMessage(null)
    const batch = await buildGroundBatch(vault, crewId)
    if (!batch) {
      setMessage({ key: 'privacy.nothing' })
      return
    }
    await appendAudit(vault, { actor: crewId, action: 'sync.sent', detail: { batchId: batch.batchId, records: batch.records.length } })
    link.send(tamper ? tamperInTransit(batch) : batch, delayMs)
    const n = batch.records.length
    if (tamper) setMessage({ key: n === 1 ? 'privacy.sentTamperedOne' : 'privacy.sentTampered', n })
    else setMessage({ key: n === 1 ? 'privacy.sentOne' : 'privacy.sent', n })
  }

  async function verify() {
    setTrail(await readAuditTrail(vault))
    setVerification(await verifyAuditTrail(vault))
  }

  const received = orderedRecords(link.ground)

  return (
    <div className="stack">
      <section className="card" aria-labelledby={`${ids}-consent`}>
        <h2 id={`${ids}-consent`}>{t('privacy.who')}</h2>
        <CrewPicker crewId={crewId} onChange={onCrewChange} />
        {consent && (
          <table className="consent">
            <thead>
              <tr>
                <th scope="col">{t('privacy.data')}</th>
                {AUDIENCES.map((a) => (
                  <th key={a} scope="col">
                    {t(AUDIENCE_LABEL[a])}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DATA_CATEGORIES.map((c) => (
                <tr key={c}>
                  <th scope="row">{t(CATEGORY_LABEL[c])}</th>
                  {AUDIENCES.map((a) => (
                    <td key={a}>
                      <input
                        type="checkbox"
                        aria-label={t('privacy.share', { category: t(CATEGORY_LABEL[c]), audience: t(AUDIENCE_LABEL[a]) })}
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
        <h2 id={`${ids}-sync`}>{t('privacy.send')}</h2>
        <p>
          {t('privacy.delay')} <strong>{delayLabel(missionLink, delayMs, t, lang)}</strong>
        </p>
        {missionLink === 'mars' && (
          <div className="field inline">
            <label htmlFor={`${ids}-mars`}>{t('privacy.marsDistance')}</label>
            <select id={`${ids}-mars`} value={marsMinutes} onChange={(e) => setMarsMinutes(Number(e.target.value))}>
              {MARS_DELAYS.map((m) => (
                <option key={m} value={m}>
                  {t('privacy.marsOption', { min: m })}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="button-row">
          <button type="button" className="primary" onClick={() => void send(false)}>
            {t('privacy.sendAllowed')}
          </button>
          <button type="button" onClick={() => void send(true)}>
            {t('privacy.sendTampered')}
          </button>
        </div>
        <p className="form-status" role="status">
          {message && t(message.key, { n: message.n ?? 0 })}
        </p>

        {link.pending.length > 0 && (
          <>
            <h3 className="section-title">{t('privacy.inTransit')}</h3>
            <ul className="plain">
              {link.pending.map((d) => (
                <li key={d.batch.batchId} className="mono small">
                  {d.batch.records.length === 1
                    ? t('privacy.arrivesOne', { time: clock(d.arrivesAt) })
                    : t('privacy.arrives', { n: d.batch.records.length, time: clock(d.arrivesAt) })}
                </li>
              ))}
            </ul>
            <button type="button" className="link" onClick={link.deliverAllNow}>
              {t('privacy.skip')}
            </button>
          </>
        )}

        <h3 className="section-title">{t('privacy.ground')}</h3>
        <dl className="readouts">
          <div>
            <dt>{t('privacy.received')}</dt>
            <dd>{received.length}</dd>
          </div>
          <div>
            <dt>{t('privacy.rejected')}</dt>
            <dd className={link.ground.rejectedBatches.length > 0 ? 'high' : undefined}>
              {link.ground.rejectedBatches.length}
            </dd>
          </div>
          <div>
            <dt>{t('privacy.head')}</dt>
            <dd>{link.ground.lastAuditHead ? `${link.ground.lastAuditHead.slice(0, 12)}…` : t('privacy.noHead')}</dd>
          </div>
        </dl>
        {link.ground.rejectedBatches.length > 0 && (
          <p className="small">{t('privacy.rejectedNote')}</p>
        )}
      </section>

      <section className="card" aria-labelledby={`${ids}-audit`}>
        <h2 id={`${ids}-audit`}>{t('privacy.audit')}</h2>
        <button type="button" onClick={() => void verify()}>
          {t('privacy.verify')}
        </button>
        {verification && (
          <p role="status" className={verification.ok ? 'ok-text' : 'bad-text'}>
            {verification.ok
              ? t('privacy.intact', { n: verification.length })
              : t('privacy.broken', {
                  at: verification.brokenAt,
                  reason: lang === 'pt' ? (REASON_PT[verification.reason] ?? verification.reason) : verification.reason,
                })}
          </p>
        )}
        <table className="audit">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">{t('privacy.colTime')}</th>
              <th scope="col">{t('privacy.colWho')}</th>
              <th scope="col">{t('privacy.colWhat')}</th>
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

function delayLabel(link: MissionLink, ms: number, t: Translate, lang: Lang): string {
  if (link === 'iss') return t('privacy.delayIss')
  if (link === 'moon') {
    const s = (ms / 1000).toFixed(1)
    return t('privacy.delayMoon', { s: lang === 'pt' ? s.replace('.', ',') : s })
  }
  return t('privacy.delayMars', { min: Math.round(ms / 60_000) })
}

/** Changes one value after signing, the way a corrupted or forged relay would. */
function tamperInTransit(batch: Batch): Batch {
  const [first, ...rest] = batch.records
  if (!first) return batch
  return { ...batch, records: [{ ...first, payload: { altered: true } }, ...rest] }
}
