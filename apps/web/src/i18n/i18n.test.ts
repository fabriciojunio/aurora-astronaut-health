import { ENGLISH, Bm25Index, answer, buildKnowledge, type Localization } from '../ai/assistant'
import type { CheckIn } from '../domain/checkin'
import { scorePvt } from '../domain/cognition'
import { PROCEDURES } from '../domain/procedures'
import { evaluate, type Alert, type RiskContext } from '../domain/riskEngine'
import { VITAL_KINDS, type VitalKind, type VitalReading } from '../domain/vitals'
import { SCENARIOS, runScenario } from '../sim/scenarios'
import { alertText, finding, localProcedures } from './content'
import { MESSAGES } from './messages'

const NOW = new Date('2026-11-14T12:00:00.000Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString()
const NORMAL: Record<VitalKind, number> = {
  heartRate: 62, hrv: 55, spo2: 98, systolic: 118, diastolic: 76, temperature: 36.7, respiratoryRate: 14,
}
const vitals = (o: Partial<Record<VitalKind, number>> = {}): VitalReading[] =>
  VITAL_KINDS.map((kind) => ({ crewId: 'crew-1', kind, value: o[kind] ?? NORMAL[kind], at: hoursAgo(1), source: 'simulated' }))
const checkIn = (daysAgo: number, o: Partial<CheckIn> = {}): CheckIn => ({
  crewId: 'crew-1', at: hoursAgo(daysAgo * 24 + 2), sleepHours: 7.5, sleepQuality: 4, mood: 4, stress: 2, symptoms: [],
  hydrationMl: 2700, resistanceMin: 60, aerobicMin: 30, prescribedResistanceMin: 60, prescribedAerobicMin: 30, note: '', ...o,
})
const week = (o: Partial<CheckIn> = {}) => [0, 1, 2, 3, 4, 5].map((d) => checkIn(d, o))
const ctx = (o: Partial<RiskContext> = {}): RiskContext => ({ crewId: 'crew-1', now: NOW, vitals: vitals(), checkIns: week(), pvt: [], ...o })

/** Every rule the engine has, produced at least once: the scenarios plus the cases they do not reach. */
function everyAlert(): Alert[] {
  const fromScenarios = SCENARIOS.flatMap((s) => runScenario(s).flatMap((d) => d.crew.flatMap((c) => c.alerts)))
  const slowPvt = scorePvt(Array.from({ length: 40 }, (_, i) => ({ reactionMs: i % 3 === 0 ? 600 : 280 })))
  const extra = [
    ctx({ vitals: vitals().filter((v) => v.kind !== 'spo2') }),
    ctx({ vitals: vitals({ spo2: 90, heartRate: 135, respiratoryRate: 26 }) }),
    ctx({ checkIns: week({ symptoms: ['chestPain', 'visionChange', 'dizziness', 'coldSores'] }) }),
    ctx({ sensorimotor: 'not-ready', radiation: { environment: 'mars_transit', protonStormLevel: 2, accumulatedMsv: 590 } }),
    ctx({ pvt: [{ at: hoursAgo(2), result: slowPvt }], checkIns: week({ sleepHours: 5 }) }),
    ctx({ checkIns: week({ resistanceMin: 10, hydrationMl: 1500, stress: 5 }), cabin: { co2Mmhg: 6, at: hoursAgo(1) } }),
  ].flatMap((c) => evaluate(c))
  return [...fromScenarios, ...extra]
}

const RULES = [
  'news2-incomplete', 'news2', 'baseline-heartRate', 'proton-storm', 'career-dose', 'sleep', 'vigilance', 'exercise',
  'hydration', 'co2', 'cardiopulmonary-symptom', 'vision', 'immune', 'dizziness', 'sensorimotor', 'combined',
]

describe('Portuguese alerts', () => {
  const alerts = everyAlert()
  const rules = new Set(alerts.map((a) => a.key.slice(a.key.indexOf(':') + 1)))

  it('reaches every rule of the engine in this test', () => {
    for (const rule of RULES) expect(rules, rule).toContain(rule)
  })

  it('words every alert in Portuguese with its values filled in', () => {
    for (const alert of alerts) {
      const pt = alertText(alert, 'pt')
      for (const field of [pt.title, pt.why, pt.action]) {
        expect(field, alert.key).toBeTruthy()
        expect(field, alert.key).not.toMatch(/\{|undefined|NaN/)
      }
      expect(pt.title, `${alert.key} still in English`).not.toBe(alert.title)
    }
  })

  it('keeps English as the domain’s own text', () => {
    for (const alert of alerts.slice(0, 20)) expect(alertText(alert, 'en')).toMatchObject({ title: alert.title, why: alert.why })
  })

  it('writes decimals with a comma and times in UTC', () => {
    const sleep = alerts.find((a) => a.key.endsWith(':sleep'))!
    expect(alertText(sleep, 'pt').title).toMatch(/^Sono com média de \d+(,\d+)? h$/)
    const baseline = alerts.find((a) => a.key.includes(':baseline-'))!
    expect(alertText(baseline, 'pt').why).toMatch(/desde \d{1,2} [a-z]{3}, \d\d:\d\d UTC/)
  })
})

describe('Portuguese dictionary and content', () => {
  const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

  it('has every key with the same placeholders as English', () => {
    for (const [key, en] of Object.entries(MESSAGES.en)) {
      const pt = MESSAGES.pt[key as keyof typeof MESSAGES.en]
      expect(pt, key).toBeTruthy()
      expect(placeholders(pt), key).toEqual(placeholders(en))
    }
  })

  it('translates every procedure step by step', () => {
    const pt = localProcedures('pt')
    expect(pt).toHaveLength(PROCEDURES.length)
    pt.forEach((p, i) => {
      expect(p.steps).toHaveLength(PROCEDURES[i]!.steps.length)
      expect(p.title).not.toBe(PROCEDURES[i]!.title)
      expect(p.evidence).toEqual(PROCEDURES[i]!.evidence)
    })
  })
})

describe('assistant in Portuguese', () => {
  const loc: Localization = { lang: 'pt', procedures: localProcedures('pt'), finding: (id) => finding(id, 'pt') }
  const index = new Bm25Index(buildKnowledge(loc), 'pt')

  it('finds the procedure for a question in Portuguese, with or without accents', () => {
    for (const q of ['O que faço numa tempestade solar?', 'o que faco numa tempestade solar']) {
      const a = answer(index, q, undefined, loc)
      expect(a.procedureId, q).toBe('solar-storm-shelter')
      expect(a.text).toMatch(/^Evento de partículas solares/)
    }
    expect(answer(index, 'Alguém está com febre', undefined, loc).procedureId).toBe('fever-protocol')
  })

  it('refuses to diagnose or prescribe in Portuguese', () => {
    for (const q of ['Eu tenho uma infecção?', 'Qual remédio devo tomar?', 'Me dá um diagnóstico', 'dose de ibuprofeno']) {
      const a = answer(index, q, undefined, loc)
      expect(a.kind, q).toBe('refusal')
      expect(a.text).toMatch(/não diagnostica nem receita/)
    }
  })

  it('explains the viewed alert in Portuguese', () => {
    const alert = everyAlert().find((a) => a.key.endsWith(':co2'))!
    const viewed = { ...alert, ...alertText(alert, 'pt') }
    const a = answer(index, 'Por que recebi este alerta?', viewed, loc)
    expect(a.kind).toBe('explanation')
    expect(a.text).toMatch(/^CO2 na cabine em .* O que fazer:/)
  })

  it('keeps the English assistant unchanged', () => {
    const en = new Bm25Index(buildKnowledge())
    expect(answer(en, 'there is a solar storm, where do I go?', undefined, ENGLISH).procedureId).toBe('solar-storm-shelter')
  })
})
