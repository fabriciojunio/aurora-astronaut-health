// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { readAuditTrail } from '../storage/auditTrail'
import { Vault } from '../storage/vault'
import type { SavedPvt } from './PvtView'
import { PvtView } from './PvtView'

// random 0.5 gives a fixed 3.5 s wait between stimuli: 8 stimuli in a 30 s run, 51 in the full test.
const WAIT_MS = 3_500
let n = 0

async function setup(durationMs: number) {
  const vault = await Vault.create('480137', { dbName: `pvt-ui-${++n}`, iterations: 1_000 })
  function Harness() {
    const [crewId, setCrewId] = useState('crew-2')
    return <PvtView vault={vault} crewId={crewId} onCrewChange={setCrewId} durationMs={durationMs} random={() => 0.5} />
  }
  render(<Harness />)
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  fireEvent.click(screen.getByRole('button', { name: 'Start test' }))
  return vault
}

function respondAfter(ms: number) {
  act(() => vi.advanceTimersByTime(WAIT_MS))
  expect(screen.getByRole('button', { name: 'Response button' })).toHaveTextContent('Press now')
  act(() => vi.advanceTimersByTime(ms))
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Response button' }))
}

async function finishWithRealTimers() {
  vi.useRealTimers()
  return screen.findByText('Saved encrypted on this device.')
}

afterEach(() => vi.useRealTimers())

describe('vigilance test', () => {
  it('measures each reaction, scores the full test and stores it encrypted with an audit entry', async () => {
    const vault = await setup(180_000)
    respondAfter(250)
    expect(screen.getByText('250 ms')).toBeInTheDocument()
    for (let i = 1; i < 51; i++) respondAfter(250)
    await finishWithRealTimers()

    expect(screen.getByText('Vigilance within the normal range.')).toBeInTheDocument()
    const saved = await vault.list<SavedPvt>('pvt')
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ crewId: 'crew-2', result: { trials: 51, lapses: 0, medianRtMs: 250, valid: true } })
    const audit = await readAuditTrail(vault)
    expect(audit.map((e) => e.action)).toEqual(['pvt.saved'])
  })

  it('flags slow reactions as lapses, like after nights of short sleep', async () => {
    await setup(180_000)
    for (let i = 0; i < 51; i++) respondAfter(i % 4 === 0 ? 420 : 260)
    await finishWithRealTimers()
    expect(screen.getByText(/Vigilance below normal/)).toBeInTheDocument()
    expect(screen.getByText('Lapses').nextSibling).toHaveTextContent('13')
  })

  it('counts a press with nothing on screen as a false start', async () => {
    await setup(30_000)
    act(() => vi.advanceTimersByTime(1_000))
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Response button' }))
    expect(screen.getByText('Too early')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(WAIT_MS - 1_000))
    act(() => vi.advanceTimersByTime(300))
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Response button' }))
    for (let i = 1; i < 8; i++) respondAfter(300)
    await finishWithRealTimers()
    expect(screen.getByText('False starts').nextSibling).toHaveTextContent('1')
  })

  it('answers with the space bar and ignores a held key', async () => {
    await setup(30_000)
    act(() => vi.advanceTimersByTime(WAIT_MS + 200))
    fireEvent.keyDown(window, { code: 'Space' })
    fireEvent.keyDown(window, { code: 'Space', repeat: true })
    expect(screen.getByText('200 ms')).toBeInTheDocument()
    for (let i = 1; i < 8; i++) respondAfter(300)
    await finishWithRealTimers()
    expect(screen.getByText('False starts').nextSibling).toHaveTextContent('0')
  })

  it('closes an unanswered stimulus after 30 s as a lapse and refuses to interpret a short run', async () => {
    await setup(30_000)
    act(() => vi.advanceTimersByTime(WAIT_MS))
    act(() => vi.advanceTimersByTime(30_000))
    expect(screen.getByText('No response')).toBeInTheDocument()
    for (let i = 1; i < 8; i++) respondAfter(250)
    await finishWithRealTimers()
    expect(screen.getByText('Lapses').nextSibling).toHaveTextContent('1')
    expect(screen.getByText(/Only 8 trials: too few to interpret/)).toBeInTheDocument()
  })

  it('stops without saving anything', async () => {
    const vault = await setup(180_000)
    respondAfter(250)
    fireEvent.click(screen.getByRole('button', { name: 'Stop without saving' }))
    act(() => vi.advanceTimersByTime(60_000))
    vi.useRealTimers()
    expect(screen.getByRole('button', { name: 'Start test' })).toBeInTheDocument()
    expect(await vault.list('pvt')).toEqual([])
  })
})
