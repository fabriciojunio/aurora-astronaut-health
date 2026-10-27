import type { Symptom } from '../domain/checkin'
import type { Severity } from '../domain/riskEngine'
import { VITAL_NAMES, type VitalKind } from '../domain/vitals'

export const VITAL_LABEL = VITAL_NAMES

export const SEVERITY_LABEL: Record<Severity, string> = {
  info: 'Info',
  watch: 'Watch',
  warning: 'Warning',
  critical: 'Critical',
}

export const ENVIRONMENT_LABEL = {
  iss: 'ISS, low Earth orbit',
  lunar_orbit: 'Lunar orbit',
  mars_transit: 'Transit to Mars',
  mars_surface: 'Mars surface',
} as const

export function featureLabel(feature: string): string {
  return feature in VITAL_LABEL ? VITAL_LABEL[feature as VitalKind] : feature
}

export function signed(value: number, digits = 1): string {
  const text = value.toFixed(digits)
  return value > 0 ? `+${text}` : text
}

export const SYMPTOM_LABEL: Record<Symptom, string> = {
  headache: 'Headache',
  nausea: 'Nausea',
  backPain: 'Back pain',
  congestion: 'Nasal congestion',
  visionChange: 'Change in vision',
  fever: 'Fever or chills',
  skinRash: 'Skin rash',
  coldSores: 'Cold sores',
  fatigue: 'Unusual fatigue',
  dizziness: 'Dizziness',
  chestPain: 'Chest pain',
  shortnessOfBreath: 'Shortness of breath',
}
