import { z } from 'zod'

export const SYMPTOMS = [
  'headache',
  'nausea',
  'backPain',
  'congestion',
  'visionChange',
  'fever',
  'skinRash',
  'coldSores',
  'fatigue',
  'dizziness',
  'chestPain',
  'shortnessOfBreath',
] as const
export type Symptom = (typeof SYMPTOMS)[number]

const score1to5 = z.number().int().min(1).max(5)

export const checkInSchema = z
  .object({
    crewId: z.string().regex(/^[a-z0-9-]{1,32}$/),
    at: z.iso.datetime(),
    sleepHours: z.number().min(0).max(16),
    sleepQuality: score1to5,
    mood: score1to5,
    stress: score1to5,
    symptoms: z.array(z.enum(SYMPTOMS)).max(SYMPTOMS.length),
    hydrationMl: z.number().int().min(0).max(8000),
    resistanceMin: z.number().int().min(0).max(300),
    aerobicMin: z.number().int().min(0).max(300),
    prescribedResistanceMin: z.number().int().min(0).max(300),
    prescribedAerobicMin: z.number().int().min(0).max(300),
    // Free text is stored encrypted and never fed to rules or to the assistant as instructions.
    note: z.string().max(500).default(''),
  })
  .strict()
  .refine((c) => new Set(c.symptoms).size === c.symptoms.length, {
    message: 'Symptoms must not repeat',
    path: ['symptoms'],
  })

export type CheckIn = z.infer<typeof checkInSchema>

export function lastDays<T extends { at: string }>(items: readonly T[], now: Date, days: number): T[] {
  const from = now.getTime() - days * 86_400_000
  return items.filter((item) => {
    const t = Date.parse(item.at)
    return t > from && t <= now.getTime()
  })
}
