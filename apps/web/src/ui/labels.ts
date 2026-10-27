import type { Severity } from '../domain/riskEngine'
import type { VitalKind } from '../domain/vitals'

export const VITAL_LABEL: Record<VitalKind, string> = {
  heartRate: 'Heart rate',
  hrv: 'HRV',
  spo2: 'SpO2',
  systolic: 'Systolic BP',
  diastolic: 'Diastolic BP',
  temperature: 'Temperature',
  respiratoryRate: 'Respiratory rate',
}

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
