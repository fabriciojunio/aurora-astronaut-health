// Privacy by default: nothing leaves the astronaut's device unless they allowed that category for
// that audience. Every change is recorded in the audit log by the caller.

export const DATA_CATEGORIES = ['alerts', 'vitals', 'checkins', 'cognition', 'radiation', 'notes'] as const
export type DataCategory = (typeof DATA_CATEGORIES)[number]

export const AUDIENCES = ['crewMedicalOfficer', 'ground'] as const
export type Audience = (typeof AUDIENCES)[number]

export type ConsentState = Record<Audience, Record<DataCategory, boolean>>

export function defaultConsent(): ConsentState {
  const none = () => Object.fromEntries(DATA_CATEGORIES.map((c) => [c, false])) as Record<DataCategory, boolean>
  return { crewMedicalOfficer: none(), ground: none() }
}

export function setConsent(
  state: ConsentState,
  audience: Audience,
  category: DataCategory,
  allowed: boolean,
): ConsentState {
  return { ...state, [audience]: { ...state[audience], [category]: allowed } }
}

export function isAllowed(state: ConsentState, audience: Audience, category: DataCategory): boolean {
  return state[audience]?.[category] === true
}

/** Keeps only what the audience may see. Free-text notes are dropped unless explicitly allowed. */
export function shareable<T extends { category: DataCategory }>(
  items: readonly T[],
  state: ConsentState,
  audience: Audience,
): T[] {
  return items.filter((item) => isAllowed(state, audience, item.category))
}
