import { useId, useState, type FormEvent } from 'react'
import { Bm25Index, MAX_QUESTION_LENGTH, answer, buildKnowledge, type Answer, type Localization } from '../ai/assistant'
import { EVIDENCE } from '../domain/evidence'
import type { Procedure } from '../domain/procedures'
import type { Alert } from '../domain/riskEngine'
import { alertText, finding, localProcedures } from '../i18n/content'
import type { Lang, MessageKey } from '../i18n/messages'
import { useI18n } from '../i18n/useI18n'

interface Props {
  alert: Alert | null
  onClearAlert: () => void
}

// One index per language, built on first use: the knowledge base is fixed, so it never changes.
const indexes = new Map<Lang, { loc: Localization; index: Bm25Index }>()

function knowledge(lang: Lang) {
  let entry = indexes.get(lang)
  if (!entry) {
    const loc: Localization = { lang, procedures: localProcedures(lang), finding: (id) => finding(id, lang) }
    entry = { loc, index: new Bm25Index(buildKnowledge(loc), lang) }
    indexes.set(lang, entry)
  }
  return entry
}

const SUGGESTIONS: MessageKey[] = ['assistant.s1', 'assistant.s2', 'assistant.s3', 'assistant.s4']

const KIND: Record<Answer['kind'], MessageKey> = {
  explanation: 'kind.explanation',
  procedure: 'kind.procedure',
  evidence: 'kind.evidence',
  refusal: 'kind.refusal',
  unknown: 'kind.unknown',
}

interface Exchange {
  id: number
  question: string
  answer: Answer
  lang: Lang
}

export function AssistantView({ alert, onClearAlert }: Props) {
  const { t, lang } = useI18n()
  const [question, setQuestion] = useState('')
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const inputId = useId()
  const viewed = alert ? { ...alert, ...alertText(alert, lang) } : undefined

  function ask(text: string) {
    if (!text.trim()) return
    const { loc, index } = knowledge(lang)
    const result = answer(index, text, viewed, loc)
    setExchanges((list) => [{ id: list.length, question: text, answer: result, lang }, ...list])
    setQuestion('')
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    ask(question)
  }

  const suggestions: MessageKey[] = alert ? ['assistant.whyAlert', 'assistant.whatNow'] : SUGGESTIONS

  return (
    <div className="stack">
      <section className="card" aria-labelledby={`${inputId}-title`}>
        <h2 id={`${inputId}-title`}>{t('assistant.title')}</h2>

        {viewed && (
          <p className="context">
            <span className="label">{t('assistant.askingAbout')}</span> {viewed.title}{' '}
            <button type="button" className="link" onClick={onClearAlert}>
              {t('assistant.clear')}
            </button>
          </p>
        )}

        <form onSubmit={submit} className="ask">
          <label htmlFor={inputId} className="visually-hidden">
            {t('assistant.question')}
          </label>
          <input
            id={inputId}
            type="text"
            maxLength={MAX_QUESTION_LENGTH}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={alert ? t('assistant.placeholderAlert') : t('assistant.placeholder')}
            autoComplete="off"
          />
          <button type="submit" className="primary" disabled={!question.trim()}>
            {t('assistant.ask')}
          </button>
        </form>
        <div className="suggestions">
          {suggestions.map((key) => (
            <button key={key} type="button" onClick={() => ask(t(key))}>
              {t(key)}
            </button>
          ))}
        </div>

        <ol className="exchanges" aria-live="polite">
          {exchanges.map((x) => (
            <li key={x.id} lang={x.lang === 'pt' ? 'pt-BR' : 'en'}>
              <p className="question">{x.question}</p>
              <AnswerBody answer={x.answer} lang={x.lang} />
            </li>
          ))}
        </ol>
      </section>

      <section className="card" aria-labelledby={`${inputId}-procedures`}>
        <h2 id={`${inputId}-procedures`}>{t('assistant.procedures')}</h2>
        {localProcedures(lang).map((p) => (
          <details key={p.id} className="procedure">
            <summary>{p.title}</summary>
            <ProcedureBody procedure={p} />
          </details>
        ))}
      </section>
    </div>
  )
}

function AnswerBody({ answer, lang }: { answer: Answer; lang: Lang }) {
  const { t } = useI18n()
  const procedure = answer.procedureId ? localProcedures(lang).find((p) => p.id === answer.procedureId) : undefined
  return (
    <div className={`answer ${answer.kind}`}>
      <span className="label">{t(KIND[answer.kind])}</span>
      {procedure ? (
        <>
          <strong>{procedure.title}</strong>
          <ProcedureBody procedure={procedure} />
        </>
      ) : (
        <>
          <p>{answer.text}</p>
          {answer.sources.length > 0 && (
            <p className="muted small">
              {t('assistant.source')} {answer.sources.join('; ')}
            </p>
          )}
        </>
      )}
    </div>
  )
}

function ProcedureBody({ procedure }: { procedure: Procedure }) {
  const { t } = useI18n()
  return (
    <>
      <p>
        <span className="label">{t('assistant.when')}</span>
        {procedure.when}
      </p>
      <ol className="steps">
        {procedure.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p>
        <span className="label">{t('assistant.escalate')}</span>
        {procedure.escalate}
      </p>
      <ul className="sources small">
        {procedure.evidence.map((id) => (
          <li key={id}>
            <a href={EVIDENCE[id].url} target="_blank" rel="noopener noreferrer">
              {EVIDENCE[id].citation}
            </a>
          </li>
        ))}
      </ul>
    </>
  )
}
