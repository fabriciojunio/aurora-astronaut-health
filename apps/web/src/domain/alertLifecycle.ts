import { isAllowed, type ConsentState } from './consent'
import { severityRank, type Alert } from './riskEngine'

export type AlertStatus = 'open' | 'acknowledged' | 'resolved'

export interface TrackedAlert extends Alert {
  status: AlertStatus
  openedAt: string
  acknowledgedAt?: string
  resolvedAt?: string
  resolution?: 'cleared' | 'manual'
  escalatedAt?: string
}

export const ESCALATE_AFTER_MS = 10 * 60_000

/**
 * Merges a fresh evaluation into the tracked list. A condition that disappears is resolved as
 * "cleared"; one that gets worse after being acknowledged is reopened, so nobody misses it.
 */
export function reconcile(tracked: readonly TrackedAlert[], current: readonly Alert[], now: Date): TrackedAlert[] {
  const at = now.toISOString()
  const active = new Map(tracked.filter((t) => t.status !== 'resolved').map((t) => [t.key, t]))
  const history = tracked.filter((t) => t.status === 'resolved')
  const next: TrackedAlert[] = []

  for (const alert of current) {
    const existing = active.get(alert.key)
    if (!existing) {
      next.push({ ...alert, status: 'open', openedAt: at })
      continue
    }
    active.delete(alert.key)
    const worse = severityRank(alert.severity) > severityRank(existing.severity)
    const reopened = worse && existing.status === 'acknowledged'
    next.push({
      ...existing,
      ...alert,
      createdAt: existing.createdAt,
      status: reopened ? 'open' : existing.status,
      openedAt: reopened ? at : existing.openedAt,
      ...(reopened ? { acknowledgedAt: undefined, escalatedAt: undefined } : {}),
    })
  }
  for (const gone of active.values()) {
    next.push({ ...gone, status: 'resolved', resolvedAt: at, resolution: 'cleared' })
  }
  return [...next, ...history]
}

export function acknowledge(tracked: readonly TrackedAlert[], key: string, now: Date): TrackedAlert[] {
  return tracked.map((t) =>
    t.key === key && t.status === 'open' ? { ...t, status: 'acknowledged', acknowledgedAt: now.toISOString() } : t,
  )
}

export function resolveManually(tracked: readonly TrackedAlert[], key: string, now: Date): TrackedAlert[] {
  return tracked.map((t) =>
    t.key === key && t.status !== 'resolved'
      ? { ...t, status: 'resolved', resolvedAt: now.toISOString(), resolution: 'manual' }
      : t,
  )
}

/** A critical alert left open for 10 minutes goes to the crew medical officer, if consent allows. */
export function escalate(
  tracked: readonly TrackedAlert[],
  consent: ConsentState,
  now: Date,
): { tracked: TrackedAlert[]; escalated: TrackedAlert[] } {
  const escalated: TrackedAlert[] = []
  const allowed = isAllowed(consent, 'crewMedicalOfficer', 'alerts')
  const next = tracked.map((t) => {
    const due =
      t.severity === 'critical' &&
      t.status === 'open' &&
      !t.escalatedAt &&
      now.getTime() - Date.parse(t.openedAt) >= ESCALATE_AFTER_MS
    if (!due || !allowed) return t
    const updated = { ...t, escalatedAt: now.toISOString() }
    escalated.push(updated)
    return updated
  })
  return { tracked: next, escalated }
}
