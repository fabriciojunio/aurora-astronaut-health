import { useId, useState, type FormEvent } from 'react'
import { Bm25Index, MAX_QUESTION_LENGTH, answer, buildKnowledge, type Answer } from '../ai/assistant'
import { EVIDENCE } from '../domain/evidence'
import { PROCEDURES, type Procedure } from '../domain/procedures'
import type { Alert } from '../domain/riskEngine'

interface Props {
  alert: Alert | null
  onClearAlert: () => void
}

const INDEX = new Bm25Index(buildKnowledge())

const SUGGESTIONS = [
  'What do I do in a solar storm?',
  'How do I measure vital signs?',
  'Someone has a fever',
  'Why does CO2 cause headaches?',
]

const KIND_LABEL: Record<Answer['kind'], string> = {
  explanation: 'About this alert',
  procedure: 'Procedure',
  evidence: 'Finding',
  refusal: 'Not something AURORA can answer',
  unknown: 'No verified answer',
}

interface Exchange {
  id: number
  question: string
  answer: Answer
}

export function AssistantView({ alert, onClearAlert }: Props) {
  const [question, setQuestion] = useState('')
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const inputId = useId()

  function ask(text: string) {
    if (!text.trim()) return
    const result = answer(INDEX, text, alert ?? undefined)
    setExchanges((list) => [{ id: list.length, question: text, answer: result }, ...list])
    setQuestion('')
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    ask(question)
  }

  return (
    <div className="stack">
      <section className="card" aria-labelledby={`${inputId}-title`}>
        <h2 id={`${inputId}-title`}>Assistant</h2>

        {alert && (
          <p className="context">
            <span className="label">Asking about</span> {alert.title}{' '}
            <button type="button" className="link" onClick={onClearAlert}>
              Clear
            </button>
          </p>
        )}

        <form onSubmit={submit} className="ask">
          <label htmlFor={inputId} className="visually-hidden">
            Question
          </label>
          <input
            id={inputId}
            type="text"
            maxLength={MAX_QUESTION_LENGTH}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={alert ? 'Why did I get this alert?' : 'Ask about a symptom, procedure or risk'}
            autoComplete="off"
          />
          <button type="submit" className="primary" disabled={!question.trim()}>
            Ask
          </button>
        </form>
        <div className="suggestions">
          {(alert ? ['Why did I get this alert?', 'What should I do now?'] : SUGGESTIONS).map((s) => (
            <button key={s} type="button" onClick={() => ask(s)}>
              {s}
            </button>
          ))}
        </div>

        <ol className="exchanges" aria-live="polite">
          {exchanges.map((x) => (
            <li key={x.id}>
              <p className="question">{x.question}</p>
              <AnswerBody answer={x.answer} />
            </li>
          ))}
        </ol>
      </section>

      <section className="card" aria-labelledby={`${inputId}-procedures`}>
        <h2 id={`${inputId}-procedures`}>Procedures</h2>
        {PROCEDURES.map((p) => (
          <details key={p.id} className="procedure">
            <summary>{p.title}</summary>
            <ProcedureBody procedure={p} />
          </details>
        ))}
      </section>
    </div>
  )
}

function AnswerBody({ answer }: { answer: Answer }) {
  const procedure = answer.procedureId ? PROCEDURES.find((p) => p.id === answer.procedureId) : undefined
  return (
    <div className={`answer ${answer.kind}`}>
      <span className="label">{KIND_LABEL[answer.kind]}</span>
      {procedure ? (
        <>
          <strong>{procedure.title}</strong>
          <ProcedureBody procedure={procedure} />
        </>
      ) : (
        <>
          <p>{answer.text}</p>
          {answer.sources.length > 0 && <p className="muted small">Source: {answer.sources.join('; ')}</p>}
        </>
      )}
    </div>
  )
}

function ProcedureBody({ procedure }: { procedure: Procedure }) {
  return (
    <>
      <p>
        <span className="label">When</span>
        {procedure.when}
      </p>
      <ol className="steps">
        {procedure.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p>
        <span className="label">Escalate</span>
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
