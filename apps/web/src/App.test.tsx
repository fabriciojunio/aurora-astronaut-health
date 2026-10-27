// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { diskFetcher } from './test/diskFetcher'

// Real WebCrypto and a real (in-memory) IndexedDB; only the PBKDF2 cost is lowered to keep tests fast.
const ITERATIONS = 1_000
const PIN = '480137'
let dbCount = 0

function renderApp(fetcher = diskFetcher()) {
  const dbName = `aurora-ui-${++dbCount}`
  const user = userEvent.setup()
  const view = render(<App dbName={dbName} iterations={ITERATIONS} fetcher={fetcher} />)
  return { user, dbName, ...view }
}

async function createVault(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText(/^PIN/), PIN)
  await user.type(screen.getByLabelText(/Repeat the PIN/), PIN)
  await user.click(screen.getByRole('button', { name: 'Create vault' }))
  await screen.findByRole('tablist', { name: 'Views' })
}

async function chooseScenario(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.selectOptions(screen.getByLabelText('Scenario'), title)
}

describe('first use and PIN', () => {
  it('rejects weak and mismatched PINs before creating the vault', async () => {
    const { user } = renderApp()
    expect(await screen.findByRole('heading', { name: 'Create your PIN' })).toBeInTheDocument()

    await user.type(screen.getByLabelText(/^PIN/), '123456')
    await user.type(screen.getByLabelText(/Repeat the PIN/), '123456')
    await user.click(screen.getByRole('button', { name: 'Create vault' }))
    expect(await screen.findByText(/simple sequence/)).toHaveAttribute('role', 'alert')

    await user.type(screen.getByLabelText(/^PIN/), PIN)
    await user.type(screen.getByLabelText(/Repeat the PIN/), '480138')
    await user.click(screen.getByRole('button', { name: 'Create vault' }))
    expect(await screen.findByText(/do not match/)).toBeInTheDocument()
  })

  it('clears the PIN fields after every attempt and ignores non-digits', async () => {
    const { user } = renderApp()
    const pin = await screen.findByLabelText(/^PIN/)
    await user.type(pin, '12ab34')
    expect(pin).toHaveValue('1234')
    await user.click(screen.getByRole('button', { name: 'Create vault' }))
    expect(await screen.findByText(/must have 6 to 12 digits/)).toBeInTheDocument()
    expect(pin).toHaveValue('')
  })

  it('creates the vault, locks, refuses a wrong PIN and unlocks with the right one', async () => {
    const { user } = renderApp()
    await createVault(user)
    expect(screen.getByText('Simulated crew data')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Lock' }))
    expect(await screen.findByRole('heading', { name: 'Unlock' })).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText(/^PIN/), '999111')
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(await screen.findByText('Wrong PIN.')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/^PIN/), PIN)
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(await screen.findByRole('tablist', { name: 'Views' })).toBeInTheDocument()
  })

  it('blocks further attempts after five wrong PINs', async () => {
    const { user } = renderApp()
    await createVault(user)
    await user.click(screen.getByRole('button', { name: 'Lock' }))
    await screen.findByRole('heading', { name: 'Unlock' })

    for (let i = 0; i < 6; i++) {
      await user.type(screen.getByLabelText(/^PIN/), '999111')
      await user.click(screen.getByRole('button', { name: 'Unlock' }))
      await screen.findByText(/Wrong PIN|Too many wrong PINs/)
    }
    expect(screen.getByRole('alert')).toHaveTextContent(/Too many wrong PINs.*Try again in \d+ s/)
    expect(screen.getByLabelText(/^PIN/)).toBeDisabled()
  })
})

describe('mission view', () => {
  it('shows the fever of the crew medical officer as an unusual pattern, with the signals that moved', async () => {
    const { user } = renderApp()
    await createVault(user)
    await chooseScenario(user, 'Fever in the crew medical officer')

    const okafor = screen.getByRole('article', { name: 'M. Okafor' })
    expect(await within(okafor).findByText('Unusual pattern')).toBeInTheDocument()
    const drivers = within(okafor).getByRole('list', { name: 'Signals furthest from normal' })
    expect(drivers).toHaveTextContent(/Temperature \+\d/)
    expect(drivers).toHaveTextContent(/Heart rate \+\d/)
    expect(within(okafor).getByText('Possible immune-related symptom')).toBeInTheDocument()

    const rivera = screen.getByRole('article', { name: 'A. Rivera' })
    expect(within(rivera).getByText('Within this person’s usual pattern.')).toBeInTheDocument()
  })

  it('explains that the model is still learning during the first days', async () => {
    const { user } = renderApp()
    await createVault(user)
    fireEvent.change(screen.getByLabelText(/Mission day/), { target: { value: '0' } })
    expect(screen.getByLabelText(/Mission day 1 of 21/)).toBeInTheDocument()
    expect(await screen.findAllByText(/Learning this person’s normal: 5 days left/)).toHaveLength(3)
  })

  it('keeps the rules working and says so when the model file was tampered with', async () => {
    const { user } = renderApp(diskFetcher({ '/models/anomaly-v1.json': '{"kind":"isolation-forest","trees":[]}' }))
    await createVault(user)
    await chooseScenario(user, 'Solar storm on Mars (May 2024 pattern)')
    expect(await screen.findAllByText(/failed its integrity check/)).toHaveLength(3)
    expect(screen.getAllByText('Solar radiation storm S3').length).toBe(3)
    expect(screen.getAllByText('Go to the storm shelter now and stay until the alert ends.').length).toBe(3)
  })

  it('opens each scenario on the day its first event ends', async () => {
    const { user } = renderApp()
    await createVault(user)
    await chooseScenario(user, 'Cabin CO2 excursion')
    expect(screen.getByLabelText(/Mission day 12 of 21/)).toBeInTheDocument()
    expect(screen.getAllByText('Cabin CO2 at 6 mmHg').length).toBe(3)
  })

  it('moves between views with the arrow keys, as a tab list should', async () => {
    const { user } = renderApp()
    await createVault(user)
    const crewTab = screen.getByRole('tab', { name: 'Crew' })
    expect(crewTab).toHaveAttribute('aria-selected', 'true')
    crewTab.focus()
    await user.keyboard('{ArrowRight}')
    const radiationTab = screen.getByRole('tab', { name: 'Radiation' })
    expect(radiationTab).toHaveAttribute('aria-selected', 'true')
    expect(radiationTab).toHaveFocus()
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Radiation')
    expect(screen.getByRole('heading', { name: 'Career dose in this scenario' })).toBeInTheDocument()
  })

  it('takes an alert to the assistant and explains it with its source', async () => {
    const { user } = renderApp()
    await createVault(user)
    await chooseScenario(user, 'Fever in the crew medical officer')
    const okafor = screen.getByRole('article', { name: 'M. Okafor' })
    const alert = within(okafor).getByText('Possible immune-related symptom').closest('li')!
    await user.click(within(alert).getByRole('button', { name: 'Ask the assistant about this alert' }))

    expect(screen.getByRole('tab', { name: 'Assistant' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Possible immune-related symptom')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Why did I get this alert?' }))
    expect(screen.getByText('About this alert')).toBeInTheDocument()
    expect(screen.getByText(/61% of ISS astronauts shed reactivated herpes viruses/)).toBeInTheDocument()
    expect(screen.getByText(/^Source: Mehta, Crucian et al/)).toBeInTheDocument()
  })
})
