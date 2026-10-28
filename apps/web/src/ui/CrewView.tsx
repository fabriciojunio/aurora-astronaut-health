import { anomalyForDay } from '../ai/anomalyMonitor'
import type { AnomalyModel } from '../ai/isolationForest'
import type { Alert } from '../domain/riskEngine'
import type { ScenarioDay } from '../sim/scenarios'
import { HealthCard } from './HealthCard'
import type { Loadable } from './useVerifiedData'

interface Props {
  days: readonly ScenarioDay[]
  dayIndex: number
  model: Loadable<AnomalyModel>
  onAsk?: (alert: Alert) => void
}

export function CrewView({ days, dayIndex, model, onAsk }: Props) {
  const day = days[dayIndex]
  if (!day) return null
  return (
    <div className="crew-grid">
      {day.crew.map((crewDay) => (
        <HealthCard
          key={crewDay.crewId}
          crewId={crewDay.crewId}
          vitals={crewDay.vitals}
          alerts={crewDay.alerts}
          anomaly={model.status === 'ready' ? anomalyForDay(model.value, days, crewDay.crewId, dayIndex) : undefined}
          model={model}
          onAsk={onAsk}
        />
      ))}
    </div>
  )
}
