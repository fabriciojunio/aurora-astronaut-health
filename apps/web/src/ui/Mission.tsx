import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import type { Fetcher } from '../data/loader'
import type { Alert } from '../domain/riskEngine'
import { CREW } from '../sim/crew'
import { SCENARIOS, runScenario, scenarioById } from '../sim/scenarios'
import type { Vault } from '../storage/vault'
import { AssistantView } from './AssistantView'
import { CheckInView } from './CheckInView'
import { CrewView } from './CrewView'
import { focusDay } from './focusDay'
import { ENVIRONMENT_LABEL } from './labels'
import { Brand } from './LockScreen'
import { PrivacyView } from './PrivacyView'
import { PvtView } from './PvtView'
import { RadiationView } from './RadiationView'
import { useGroundLink } from './useGroundLink'
import { useIdleLock } from './useIdleLock'
import { useVerifiedData } from './useVerifiedData'

interface Props {
  vault: Vault
  fetcher: Fetcher
  onLock: () => void
}

const TABS = [
  { id: 'crew', label: 'Crew' },
  { id: 'radiation', label: 'Radiation' },
  { id: 'checkin', label: 'Check-in' },
  { id: 'pvt', label: 'Vigilance test' },
  { id: 'assistant', label: 'Assistant' },
  { id: 'privacy', label: 'Privacy and sync' },
] as const
type Tab = (typeof TABS)[number]['id']

export function Mission({ vault, fetcher, onLock }: Props) {
  const { model, data } = useVerifiedData(fetcher)
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0]!.id)
  const scenario = scenarioById(scenarioId)
  const days = useMemo(() => runScenario(scenarioById(scenarioId)), [scenarioId])
  const [dayIndex, setDayIndex] = useState(() => focusDay(scenario))
  const [tab, setTab] = useState<Tab>('crew')
  const [recorder, setRecorder] = useState(CREW[0]!.id)
  const [askAbout, setAskAbout] = useState<Alert | null>(null)
  const link = useGroundLink(vault.signingKeys.publicKey)
  const ids = { scenario: useId(), day: useId(), tabs: useId() }
  const day = days[dayIndex]

  useIdleLock(onLock)

  function chooseScenario(id: string) {
    setScenarioId(id)
    setDayIndex(focusDay(scenarioById(id)))
  }

  function askAssistant(alert: Alert) {
    setAskAbout(alert)
    setTab('assistant')
  }

  function onTabKey(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((t) => t.id === tab)
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    const next = TABS[(index + step + TABS.length) % TABS.length]!
    setTab(next.id)
    document.getElementById(`${ids.tabs}-${next.id}`)?.focus()
  }

  return (
    <div className="app">
      <header className="topbar">
        <Brand />
        <span className="sim-badge" title="No real astronaut data is used">
          Simulated crew data
        </span>
        <button type="button" className="ghost" onClick={onLock}>
          Lock
        </button>
      </header>

      <section className="mission-bar" aria-label="Mission">
        <div className="field">
          <label htmlFor={ids.scenario}>Scenario</label>
          <select id={ids.scenario} value={scenarioId} onChange={(e) => chooseScenario(e.target.value)}>
            {SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          <p className="muted small">{scenario.description}</p>
        </div>
        <div className="field">
          <label htmlFor={ids.day}>
            Mission day {dayIndex + 1} of {days.length} <span className="muted">{day?.date}</span>
          </label>
          <input
            id={ids.day}
            type="range"
            min={0}
            max={days.length - 1}
            value={dayIndex}
            onChange={(e) => setDayIndex(Number(e.target.value))}
          />
        </div>
        {day && (
          <dl className="readouts">
            <div>
              <dt>Environment</dt>
              <dd>{ENVIRONMENT_LABEL[scenario.environment]}</dd>
            </div>
            <div>
              <dt>Cabin CO2</dt>
              <dd className={day.cabinCo2Mmhg > 4 ? 'high' : undefined}>{day.cabinCo2Mmhg} mmHg</dd>
            </div>
            <div>
              <dt>Solar storm</dt>
              <dd className={day.protonStormLevel > 0 ? 'high' : undefined}>
                {day.protonStormLevel > 0 ? `S${day.protonStormLevel}` : 'None'}
              </dd>
            </div>
            <div>
              <dt>Career dose</dt>
              <dd>{day.accumulatedMsv} mSv</dd>
            </div>
          </dl>
        )}
      </section>

      <div role="tablist" aria-label="Views" className="tabs" onKeyDown={onTabKey}>
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`${ids.tabs}-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`${ids.tabs}-${t.id}-panel`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <main id={`${ids.tabs}-${tab}-panel`} role="tabpanel" aria-labelledby={`${ids.tabs}-${tab}`} className="panel">
        {tab === 'crew' && <CrewView days={days} dayIndex={dayIndex} model={model} onAsk={askAssistant} />}
        {tab === 'radiation' && <RadiationView scenario={scenario} days={days} dayIndex={dayIndex} data={data} />}
        {tab === 'checkin' && <CheckInView vault={vault} crewId={recorder} onCrewChange={setRecorder} />}
        {tab === 'pvt' && <PvtView vault={vault} crewId={recorder} onCrewChange={setRecorder} />}
        {tab === 'assistant' && <AssistantView alert={askAbout} onClearAlert={() => setAskAbout(null)} />}
        {tab === 'privacy' && (
          <PrivacyView
            vault={vault}
            crewId={recorder}
            onCrewChange={setRecorder}
            environment={scenario.environment}
            link={link}
          />
        )}
      </main>
    </div>
  )
}
