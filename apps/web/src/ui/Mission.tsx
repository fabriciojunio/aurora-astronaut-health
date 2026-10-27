import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import type { Fetcher } from '../data/loader'
import { environmentName, localNumber, scenarioText } from '../i18n/content'
import { LanguageSwitch } from '../i18n/LanguageSwitch'
import type { MessageKey } from '../i18n/messages'
import { useI18n } from '../i18n/useI18n'
import type { Alert } from '../domain/riskEngine'
import { CREW } from '../sim/crew'
import { SCENARIOS, runScenario, scenarioById } from '../sim/scenarios'
import type { Vault } from '../storage/vault'
import { AssistantView } from './AssistantView'
import { CheckInView } from './CheckInView'
import { CrewView } from './CrewView'
import { focusDay } from './focusDay'
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
  { id: 'crew', label: 'tab.crew' },
  { id: 'radiation', label: 'tab.radiation' },
  { id: 'checkin', label: 'tab.checkin' },
  { id: 'pvt', label: 'tab.pvt' },
  { id: 'assistant', label: 'tab.assistant' },
  { id: 'privacy', label: 'tab.privacy' },
] as const satisfies readonly { id: string; label: MessageKey }[]
type Tab = (typeof TABS)[number]['id']

export function Mission({ vault, fetcher, onLock }: Props) {
  const { t, lang } = useI18n()
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
        <span className="sim-badge">{t('sim.badge')}</span>
        <LanguageSwitch />
        <button type="button" className="ghost" onClick={onLock}>
          {t('mission.lock')}
        </button>
      </header>

      <section className="mission-bar" aria-label={t('mission.region')}>
        <div className="field">
          <label htmlFor={ids.scenario}>{t('mission.scenario')}</label>
          <select id={ids.scenario} value={scenarioId} onChange={(e) => chooseScenario(e.target.value)}>
            {SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {scenarioText(s, lang).title}
              </option>
            ))}
          </select>
          <p className="muted small">{scenarioText(scenario, lang).description}</p>
        </div>
        <div className="field">
          <label htmlFor={ids.day}>
            {t('mission.day', { n: dayIndex + 1, total: days.length })} <span className="muted">{day?.date}</span>
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
              <dt>{t('mission.environment')}</dt>
              <dd>{environmentName(scenario.environment, lang)}</dd>
            </div>
            <div>
              <dt>{t('mission.co2')}</dt>
              <dd className={day.cabinCo2Mmhg > 4 ? 'high' : undefined}>{localNumber(day.cabinCo2Mmhg, lang)} mmHg</dd>
            </div>
            <div>
              <dt>{t('mission.storm')}</dt>
              <dd className={day.protonStormLevel > 0 ? 'high' : undefined}>
                {day.protonStormLevel > 0 ? `S${day.protonStormLevel}` : t('mission.none')}
              </dd>
            </div>
            <div>
              <dt>{t('mission.dose')}</dt>
              <dd>{localNumber(day.accumulatedMsv, lang)} mSv</dd>
            </div>
          </dl>
        )}
      </section>

      <div role="tablist" aria-label={t('tabs.label')} className="tabs" onKeyDown={onTabKey}>
        {TABS.map((item) => (
          <button
            key={item.id}
            id={`${ids.tabs}-${item.id}`}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`${ids.tabs}-${item.id}-panel`}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => setTab(item.id)}
          >
            {t(item.label)}
          </button>
        ))}
      </div>

      <main id={`${ids.tabs}-${tab}-panel`} role="tabpanel" aria-labelledby={`${ids.tabs}-${tab}`} className="panel">
        {tab === 'crew' && <CrewView days={days} dayIndex={dayIndex} model={model} onAsk={askAssistant} />}
        {tab === 'radiation' && <RadiationView days={days} dayIndex={dayIndex} data={data} />}
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
