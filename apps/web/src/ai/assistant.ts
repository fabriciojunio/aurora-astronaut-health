// Onboard assistant. It retrieves verified passages (BM25) from AURORA's own knowledge base and
// composes the answer only from them, always with the source. It never generates free text, so it
// cannot invent facts, and the user's text is only ever a search query, never an instruction.

import { EVIDENCE, type Evidence, type EvidenceId } from '../domain/evidence'
import { PROCEDURES, type Procedure } from '../domain/procedures'
import type { Alert } from '../domain/riskEngine'

export const MAX_QUESTION_LENGTH = 300
const K1 = 1.2
const B = 0.75

export interface KnowledgeDoc {
  id: string
  kind: 'procedure' | 'evidence'
  title: string
  text: string
  source: string
}

export interface Answer {
  kind: 'explanation' | 'procedure' | 'refusal' | 'unknown' | 'evidence'
  text: string
  sources: string[]
  /** Set when the answer is a procedure, so the UI can show it as numbered steps. */
  procedureId?: string
}

const STOP = {
  en: new Set('a an and are as at be by do does for from how i in is it me my of on or should the this to what when why with you your'.split(' ')),
  pt: new Set('a o e as os ao aos de da do das dos em no na nos nas um uma uns umas para pra por com como que se eu meu minha seu sua ha esta este isso isto qual quais quando onde ser sobre devo fazer faco tem tenho estou'.split(' ')),
}

/** Lower case without accents, so "Saúde" and "saude" are the same word. */
export function fold(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '')
}

export function tokenize(text: string, lang: 'en' | 'pt' = 'en'): string[] {
  return fold(text)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP[lang].has(t))
}

/** The language of the answers and the content they are built from. English is the domain's own. */
export interface Localization {
  lang: 'en' | 'pt'
  procedures: readonly Procedure[]
  finding: (id: EvidenceId) => string
}

export const ENGLISH: Localization = { lang: 'en', procedures: PROCEDURES, finding: (id) => EVIDENCE[id].finding }

export function buildKnowledge(loc: Localization = ENGLISH): KnowledgeDoc[] {
  const procedures = loc.procedures.map((p: Procedure) => ({
    id: `procedure:${p.id}`,
    kind: 'procedure' as const,
    title: p.title,
    text: [p.title, p.when, ...p.steps, p.escalate, p.areas.join(' ')].join(' '),
    source: p.evidence.map((e) => EVIDENCE[e].citation).join('; '),
  }))
  const evidence = Object.values(EVIDENCE).map((e: Evidence) => ({
    id: `evidence:${e.id}`,
    kind: 'evidence' as const,
    title: e.citation,
    text: `${e.citation} ${loc.finding(e.id as EvidenceId)}`,
    source: e.citation,
  }))
  return [...procedures, ...evidence]
}

export class Bm25Index {
  private readonly docs: { doc: KnowledgeDoc; terms: Map<string, number>; length: number }[]
  private readonly df = new Map<string, number>()
  private readonly avgLength: number

  private readonly lang: 'en' | 'pt'

  constructor(docs: readonly KnowledgeDoc[], lang: 'en' | 'pt' = 'en') {
    this.lang = lang
    this.docs = docs.map((doc) => {
      const tokens = tokenize(doc.text, lang)
      const terms = new Map<string, number>()
      for (const t of tokens) terms.set(t, (terms.get(t) ?? 0) + 1)
      for (const t of terms.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1)
      return { doc, terms, length: tokens.length }
    })
    this.avgLength = this.docs.reduce((a, d) => a + d.length, 0) / Math.max(this.docs.length, 1)
  }

  search(query: string, limit = 3): { doc: KnowledgeDoc; score: number }[] {
    const terms = [...new Set(tokenize(query, this.lang))]
    const n = this.docs.length
    return this.docs
      .map(({ doc, terms: tf, length }) => {
        let score = 0
        for (const term of terms) {
          const f = tf.get(term)
          if (!f) continue
          const df = this.df.get(term) ?? 0
          const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5))
          score += (idf * f * (K1 + 1)) / (f + K1 * (1 - B + (B * length) / this.avgLength))
        }
        return { doc, score }
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }
}

// Matched on folded text (lower case, no accents), so "diagnóstico" and "diagnostico" both count.
const DIAGNOSIS = {
  en: /\b(do i have|diagnos\w*|am i sick|is it cancer|what disease|prescri\w*|which (drug|medicine|pill)|dose of)\b/,
  pt: /\b(eu tenho|estou doente|diagnost\w*|e cancer|que doenca|qual doenca|receit\w*|prescrev\w*|qual (remedio|medicamento|comprimido)|dose de|devo tomar)\b/,
}
const WHY = { en: /\b(why|reason|explain)\b/, pt: /\b(por que|porque|motivo|expli\w*)\b/ }

const TEXT = {
  en: {
    empty: 'Ask a question about an alert, a procedure or a health risk.',
    refusal:
      'AURORA cannot diagnose or prescribe. Contact the crew medical officer; if they are unavailable, follow the procedure for your symptoms and contact the flight surgeon.',
    whatToDo: 'What to do:',
    unknown: 'I do not have verified information on that. Ask the crew medical officer.',
    when: 'When:',
    steps: 'Steps:',
  },
  pt: {
    empty: 'Pergunte sobre um alerta, um procedimento ou um risco à saúde.',
    refusal:
      'O AURORA não diagnostica nem receita. Chame o oficial médico; se ele não estiver disponível, siga o procedimento para os seus sintomas e contate o médico de voo.',
    whatToDo: 'O que fazer:',
    unknown: 'Não tenho informação verificada sobre isso. Pergunte ao oficial médico.',
    when: 'Quando:',
    steps: 'Passos:',
  },
}

/**
 * `alert` is the alert the astronaut is looking at, if any, already worded in `loc.lang`; its text
 * comes from AURORA's own rules, never from the user. Free-text notes are never passed here.
 */
export function answer(index: Bm25Index, question: string, alert?: Alert, loc: Localization = ENGLISH): Answer {
  const text = TEXT[loc.lang]
  const q = question.slice(0, MAX_QUESTION_LENGTH).trim()
  if (!q) return { kind: 'unknown', text: text.empty, sources: [] }
  const folded = fold(q)

  if (DIAGNOSIS[loc.lang].test(folded) || DIAGNOSIS.en.test(folded)) {
    return { kind: 'refusal', text: text.refusal, sources: [] }
  }

  if (alert && (WHY[loc.lang].test(folded) || WHY.en.test(folded))) {
    return {
      kind: 'explanation',
      text: `${alert.title}. ${alert.why} ${text.whatToDo} ${alert.action}`,
      sources: alert.evidence.map((e) => EVIDENCE[e].citation),
    }
  }

  const results = index.search(alert ? `${q} ${alert.area} ${alert.title}` : q)
  const best = results[0]
  if (!best) return { kind: 'unknown', text: text.unknown, sources: [] }
  if (best.doc.kind === 'procedure') {
    const procedure = loc.procedures.find((p) => `procedure:${p.id}` === best.doc.id)!
    const steps = procedure.steps.map((s, i) => `${i + 1}. ${s}`).join(' ')
    return {
      kind: 'procedure',
      text: `${procedure.title}. ${text.when} ${procedure.when} ${text.steps} ${steps} ${procedure.escalate}`,
      sources: procedure.evidence.map((e) => EVIDENCE[e].citation),
      procedureId: procedure.id,
    }
  }
  const evidence = Object.values(EVIDENCE).find((e) => `evidence:${e.id}` === best.doc.id)!
  return { kind: 'evidence', text: loc.finding(evidence.id as EvidenceId), sources: [evidence.citation] }
}
