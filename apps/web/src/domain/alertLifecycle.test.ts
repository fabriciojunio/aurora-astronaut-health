import { ESCALATE_AFTER_MS, acknowledge, escalate, reconcile, resolveManually } from './alertLifecycle'
import { defaultConsent, setConsent } from './consent'
import type { Alert } from './riskEngine'

const t0 = new Date('2026-11-14T10:00:00.000Z')
const later = (ms: number) => new Date(t0.getTime() + ms)

const alert = (key: string, severity: Alert['severity'] = 'warning'): Alert => ({
  key: `crew-1:${key}`, crewId: 'crew-1', area: 'clinical', severity, title: key, why: 'why', action: 'do', evidence: ['news2'], createdAt: t0.toISOString(),
})

describe('alert lifecycle', () => {
  it('opens new alerts and keeps the same alert open across evaluations', () => {
    const first = reconcile([], [alert('spo2')], t0)
    expect(first).toMatchObject([{ status: 'open', openedAt: t0.toISOString() }])
    const second = reconcile(first, [alert('spo2')], later(60_000))
    expect(second).toHaveLength(1)
    expect(second[0]!.openedAt).toBe(t0.toISOString())
  })

  it('resolves an alert automatically when the condition clears, and keeps it as history', () => {
    const open = reconcile([], [alert('spo2')], t0)
    const cleared = reconcile(open, [], later(1000))
    expect(cleared).toMatchObject([{ status: 'resolved', resolution: 'cleared' }])
    expect(reconcile(cleared, [], later(2000))).toHaveLength(1)
  })

  it('acknowledges, then reopens if the same condition gets worse', () => {
    const acked = acknowledge(reconcile([], [alert('spo2', 'warning')], t0), 'crew-1:spo2', later(1000))
    expect(acked[0]).toMatchObject({ status: 'acknowledged' })
    const worse = reconcile(acked, [alert('spo2', 'critical')], later(2000))
    expect(worse[0]).toMatchObject({ status: 'open', severity: 'critical', openedAt: later(2000).toISOString() })
    expect(worse[0]!.acknowledgedAt).toBeUndefined()
  })

  it('does not reopen an acknowledged alert that stays the same or improves', () => {
    const acked = acknowledge(reconcile([], [alert('spo2', 'critical')], t0), 'crew-1:spo2', later(1000))
    expect(reconcile(acked, [alert('spo2', 'warning')], later(2000))[0]!.status).toBe('acknowledged')
  })

  it('opens a new alert if a resolved condition comes back', () => {
    const resolved = resolveManually(reconcile([], [alert('spo2')], t0), 'crew-1:spo2', later(1000))
    const again = reconcile(resolved, [alert('spo2')], later(2000))
    expect(again.map((a) => a.status).sort()).toEqual(['open', 'resolved'])
  })

  it('escalates an unacknowledged critical alert after 10 minutes, only with consent, only once', () => {
    const open = reconcile([], [alert('chest', 'critical'), alert('sleep', 'watch')], t0)
    const noConsent = escalate(open, defaultConsent(), later(ESCALATE_AFTER_MS))
    expect(noConsent.escalated).toEqual([])

    const consent = setConsent(defaultConsent(), 'crewMedicalOfficer', 'alerts', true)
    expect(escalate(open, consent, later(ESCALATE_AFTER_MS - 1)).escalated).toEqual([])
    const due = escalate(open, consent, later(ESCALATE_AFTER_MS))
    expect(due.escalated.map((a) => a.key)).toEqual(['crew-1:chest'])
    expect(escalate(due.tracked, consent, later(2 * ESCALATE_AFTER_MS)).escalated).toEqual([])
  })

  it('does not escalate once the astronaut has acknowledged the alert', () => {
    const consent = setConsent(defaultConsent(), 'crewMedicalOfficer', 'alerts', true)
    const acked = acknowledge(reconcile([], [alert('chest', 'critical')], t0), 'crew-1:chest', later(1000))
    expect(escalate(acked, consent, later(ESCALATE_AFTER_MS * 2)).escalated).toEqual([])
  })
})
