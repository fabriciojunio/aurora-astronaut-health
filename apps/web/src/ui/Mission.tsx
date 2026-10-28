import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import type { Fetcher } from '../data/loader'
import type { Alert } from '../domain/riskEngine'
import { environmentName, localNumber, scenarioText } from '../i18n/content'
import { LanguageSwitch } from '../i18n/LanguageSwitch'
import type { MessageKey } from '../i18n/messages'
import { useI18n } from '../i18n/useI18n'
import { CREW } from '../sim/crew'
import { SCENARIOS, runScenario, scenarioById } from '../sim/scenarios'
import type { Vault } from '../storage/vault'
import { AssistantView } from './AssistantView'
import { CheckInView } from './CheckInView'
import { CrewView } from './CrewView'
import { focusDay } from './focusDay'
import { Brand } from './LockScreen'
import { MyHealthView } from './MyHealthView'
import { PrivacyView } from './PrivacyView'
import { PvtView } from './PvtView'
import { RadiationView } from './RadiationView'
import { SystemCheckView } from './SystemCheckView'
import { useGroundLink } from './useGroundLink'
import { useIdleLock } from './useIdleLock'
import { useVerifiedData } from './useVerifiedData'

interface Props {
  vault: Vault
  fetcher: Fetcher
  onLock: () => void
  /** Tests pass a low value so the key-derivation check stays fast. */
  kdfIterations?: number
}

type Mode = 'sim' | 'live'
const MODES: { id: Mode; label: MessageKey }[] = [
  { id: 'sim', label: 'mode.sim' },
  { id: 'live', label: 'mode.live' },
]

const SHARED = [
  { id: 'radiation', label: 'tab.radiation' },
  { id: 'checkin', label: 'tab.checkin' },
  { id: 'pvt', label: 'tab.pvt' },
  { id: 'assistant', label: 'tab.assistant' },
  { id: 'privacy', label: 'tab.privacy' },
  { id: 'check', label: 'tab.check' },
] as const
const TABS = {
  sim: [{ id: 'crew', label: 'tab.crew' }, ...SHARED],
  live: [{ id: 'health', label: 'tab.health' }, ...SHARED],
} as const satisfies Record<Mode, readonly { id: string; label: MessageKey }[]>
type Tab = (typeof TABS)[Mode][number]['id']

export function Mission({ vault, fetcher, onLock, kdfIterations }: Props) {
  const { t, lang } = useI18n()
  const { model, data } = useVerifiedData(fetcher)
  const [mode, setMode] = useState<Mode>('sim')
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
  const tabs: readonly { id: Tab; label: MessageKey }[] = TABS[mode]

  useIdleLock(onLock)

  function chooseMode(next: Mode) {
    setMode(next)
    if (tab === 'crew' || tab === 'health') setTab(next === 'sim' ? 'crew' : 'health')
  }

  function chooseScenario(id: string) {
    setScenarioId(id)
    setDayIndex(focusDay(scenarioById(id)))
  }

  function askAssistant(alert: Alert) {
    setAskAbout(alert)
    setTab('assistant')
  }

  function onTabKey(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((item) => item.id === tab)
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    const next = tabs[(index + step + tabs.length) % tabs.length]!
    setTab(next.id)
    document.getElementById(`${ids.tabs}-${next.id}`)?.focus()
  }

  return (
    <div className="app">
      <header className="topbar">
        <Brand />
        <span className="sim-badge">{mode === 'sim' ? t('sim.badge') : t('live.badge')}</span>
        <LanguageSwitch />
        <button type="button" className="ghost" onClick={onLock}>
          {t('mission.lock')}
        </button>
      </header>

      <section className="mission-bar" aria-label={t('mission.region')}>
        <div className="mode-switch" role="group" aria-label={t('mode.label')}>
          {MODES.map((m) => (
            <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => chooseMode(m.id)}>
              {t(m.label)}
            </button>
          ))}
        </div>
        {mode === 'sim' && (
          <>
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
          </>
        )}
      </section>

      <div role="tablist" aria-label={t('tabs.label')} className="tabs" onKeyDown={onTabKey}>
        {tabs.map((item) => (
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
        {tab === 'health' && (
          <MyHealthView vault={vault} crewId={recorder} onCrewChange={setRecorder} model={model} onAsk={askAssistant} />
        )}
        {tab === 'radiation' && <RadiationView days={mode === 'sim' ? days : undefined} dayIndex={dayIndex} data={data} />}
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
        {tab === 'check' && <SystemCheckView vault={vault} fetcher={fetcher} model={model} kdfIterations={kdfIterations} />}
      </main>
    </div>
  )
}
