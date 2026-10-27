// Onboard assistant. It retrieves verified passages (BM25) from AURORA's own knowledge base and
// composes the answer only from them, always with the source. It never generates free text, so it
// cannot invent facts, and the user's text is only ever a search query, never an instruction.

import { EVIDENCE, type Evidence } from '../domain/evidence'
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
}

const STOP = new Set('a an and are as at be by do does for from how i in is it me my of on or should the this to what when why with you your'.split(' '))

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
}

export function buildKnowledge(): KnowledgeDoc[] {
  const procedures = PROCEDURES.map((p: Procedure) => ({
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
    text: `${e.citation} ${e.finding}`,
    source: e.citation,
  }))
  return [...procedures, ...evidence]
}

export class Bm25Index {
  private readonly docs: { doc: KnowledgeDoc; terms: Map<string, number>; length: number }[]
  private readonly df = new Map<string, number>()
  private readonly avgLength: number

  constructor(docs: readonly KnowledgeDoc[]) {
    this.docs = docs.map((doc) => {
      const tokens = tokenize(doc.text)
      const terms = new Map<string, number>()
      for (const t of tokens) terms.set(t, (terms.get(t) ?? 0) + 1)
      for (const t of terms.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1)
      return { doc, terms, length: tokens.length }
    })
    this.avgLength = this.docs.reduce((a, d) => a + d.length, 0) / Math.max(this.docs.length, 1)
  }

  search(query: string, limit = 3): { doc: KnowledgeDoc; score: number }[] {
    const terms = [...new Set(tokenize(query))]
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

const DIAGNOSIS = /\b(do i have|diagnos\w*|am i sick|is it cancer|what disease|prescri\w*|which (drug|medicine|pill)|dose of)\b/i
const WHY = /\b(why|reason|explain)\b/i

/**
 * `alert` is the alert the astronaut is looking at, if any; its text comes from AURORA's own rules,
 * never from the user. Free-text notes from check-ins are never passed here.
 */
export function answer(index: Bm25Index, question: string, alert?: Alert): Answer {
  const q = question.slice(0, MAX_QUESTION_LENGTH).trim()
  if (!q) return { kind: 'unknown', text: 'Ask a question about an alert, a procedure or a health risk.', sources: [] }

  if (DIAGNOSIS.test(q)) {
    return {
      kind: 'refusal',
      text: 'AURORA cannot diagnose or prescribe. Contact the crew medical officer; if they are unavailable, follow the procedure for your symptoms and contact the flight surgeon.',
      sources: [],
    }
  }

  if (alert && WHY.test(q)) {
    const sources = alert.evidence.map((e) => EVIDENCE[e].citation)
    return {
      kind: 'explanation',
      text: `${alert.title}. ${alert.why} What to do: ${alert.action}`,
      sources,
    }
  }

  const results = index.search(alert ? `${q} ${alert.area} ${alert.title}` : q)
  const best = results[0]
  if (!best) {
    return {
      kind: 'unknown',
      text: 'I do not have verified information on that. Ask the crew medical officer.',
      sources: [],
    }
  }
  if (best.doc.kind === 'procedure') {
    const procedure = PROCEDURES.find((p) => `procedure:${p.id}` === best.doc.id)!
    const steps = procedure.steps.map((s, i) => `${i + 1}. ${s}`).join(' ')
    return {
      kind: 'procedure',
      text: `${procedure.title}. When: ${procedure.when} Steps: ${steps} ${procedure.escalate}`,
      sources: procedure.evidence.map((e) => EVIDENCE[e].citation),
    }
  }
  const evidence = Object.values(EVIDENCE).find((e) => `evidence:${e.id}` === best.doc.id)!
  return { kind: 'evidence', text: evidence.finding, sources: [evidence.citation] }
}
