// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { runScenario, scenarioById } from '../sim/scenarios'
import { diskFetcher } from '../test/diskFetcher'
import { RadiationView } from './RadiationView'
import { useVerifiedData } from './useVerifiedData'
import type { Fetcher } from '../data/loader'

const scenario = scenarioById('mars-solar-storm')
const days = runScenario(scenario)

function Harness({ fetcher, dayIndex = 15 }: { fetcher: Fetcher; dayIndex?: number }) {
  const { data } = useVerifiedData(fetcher)
  return <RadiationView scenario={scenario} days={days} dayIndex={dayIndex} data={data} />
}

const fetcher = diskFetcher()

describe('radiation view', () => {
  it('charts the real May 2024 doses for the three environments and marks the storm peaks', async () => {
    render(<Harness fetcher={fetcher} />)
    const mars = await screen.findByRole('figure', { name: 'Mars surface (Curiosity RAD)' })
    expect(within(mars).getByText('20 May')).toBeInTheDocument()
    expect(within(mars).getByRole('img')).toHaveAccessibleName(/31 days, 1 spike day/)

    const moon = screen.getByRole('figure', { name: 'Lunar orbit (CRaTER)' })
    expect(within(moon).getByText('14 May')).toBeInTheDocument()
    expect(within(moon).getByRole('img')).toHaveAccessibleName(/8 spike days/)

    const iss = screen.getByRole('figure', { name: 'ISS (DOSTEL)' })
    expect(within(iss).getByRole('img')).toHaveAccessibleName(/0 spike days/)
    expect(within(iss).getAllByRole('row')).toHaveLength(32)
  })

  it('shows the values of a day on hover', async () => {
    const { container } = render(<Harness fetcher={fetcher} />)
    const mars = await screen.findByRole('figure', { name: 'Mars surface (Curiosity RAD)' })
    const hitAreas = mars.querySelectorAll('rect[fill="transparent"]')
    fireEvent.pointerEnter(hitAreas[19]!)
    const tip = within(mars).getByRole('status')
    expect(tip).toHaveTextContent('20 May 2024')
    expect(tip).toHaveTextContent('1513.2 µGy absorbed')
    fireEvent.pointerLeave(mars.querySelector('svg')!)
    expect(within(container).queryByRole('status')).not.toBeInTheDocument()
  })

  it('cites the source with its checksum and the last solar proton reading', async () => {
    render(<Harness fetcher={fetcher} />)
    expect(await screen.findByRole('link', { name: 'NASA OSDR RadLab' })).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getAllByText(/SHA-256 verified on load/)).toHaveLength(2)
    expect(screen.getByText('no radiation storm')).toBeInTheDocument()
  })

  it('forecasts the career dose robustly after the storm day', async () => {
    render(<Harness fetcher={fetcher} />)
    const meter = screen.getByRole('meter', { name: 'Share of the career dose limit used' })
    expect(Number(meter.getAttribute('aria-valuenow'))).toBe(Math.round((days[15]!.accumulatedMsv / 600) * 100))
    // Theil-Sen keeps the daily slope near the 0.64 mSv/day background despite the 4.5 mSv storm jump.
    expect(screen.getByText(/At the current trend \(0\.6\d mSv\/day\)/)).toBeInTheDocument()
  })

  it('asks for more days before projecting a trend', () => {
    render(<Harness fetcher={fetcher} dayIndex={1} />)
    expect(screen.getByText('Trend needs at least 3 days.')).toBeInTheDocument()
  })

  it('refuses to chart data that fails the checksum', async () => {
    const tampered = diskFetcher({ '/data/radiation-may-2024.json': '{"records":[]}' })
    render(<Harness fetcher={tampered} />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('failed their integrity check'))
    expect(screen.queryByRole('figure')).not.toBeInTheDocument()
  })
})
