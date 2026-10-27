import type { Scenario } from '../sim/scenarios'

/** Opens each scenario on the last day of its first event, where there is something to see. */
export function focusDay(scenario: Scenario): number {
  const first = [...scenario.events].sort((a, b) => a.fromDay - b.fromDay)[0]
  return Math.min(first ? first.toDay : scenario.days - 1, scenario.days - 1)
}
