// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import type { CheckIn } from '../domain/checkin'
import type { RadiationEnvironment } from '../domain/radiation'
import type { AuditEntry } from '../security/auditLog'
import { readAuditTrail } from '../storage/auditTrail'
import { Vault } from '../storage/vault'
import { PrivacyView } from './PrivacyView'
import { useGroundLink } from './useGroundLink'

let n = 0

const checkIn: CheckIn = {
  crewId: 'crew-1', at: '2026-11-14T07:00:00.000Z', sleepHours: 7, sleepQuality: 4, mood: 4, stress: 2,
  symptoms: [], hydrationMl: 2600, resistanceMin: 60, aerobicMin: 30, prescribedResistanceMin: 60,
  prescribedAerobicMin: 30, note: 'private words',
}

async function setup(environment: RadiationEnvironment = 'iss') {
  const vault = await Vault.create('480137', { dbName: `privacy-ui-${++n}`, iterations: 1_000 })
  await vault.put('checkins', `crew-1:${checkIn.at}`, checkIn)
  function Harness() {
    const [crewId, setCrewId] = useState('crew-1')
    const link = useGroundLink(vault.signingKeys.publicKey)
    return <PrivacyView vault={vault} crewId={crewId} onCrewChange={setCrewId} environment={environment} link={link} />
  }
  const user = userEvent.setup()
  render(<Harness />)
  await screen.findAllByRole('checkbox')
  return { vault, user }
}

const groundValue = (label: string) => screen.getByText(label).nextSibling as HTMLElement

describe('privacy and sync', () => {
  it('starts with nothing shared and sends nothing', async () => {
    const { user } = await setup()
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes).toHaveLength(12)
    expect(boxes.every((b) => !(b as HTMLInputElement).checked)).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Send allowed data' }))
    expect(await screen.findByText(/Nothing to send/)).toBeInTheDocument()
    expect(groundValue('Records received')).toHaveTextContent('0')
  })

  it('sends allowed data, which the ground verifies, and audits every step', async () => {
    const { user, vault } = await setup()
    await user.click(screen.getByRole('checkbox', { name: 'Share Check-ins with Flight surgeon (ground)' }))
    await user.click(screen.getByRole('button', { name: 'Send allowed data' }))
    await waitFor(() => expect(groundValue('Records received')).toHaveTextContent('1'))
    expect(groundValue('Batches rejected')).toHaveTextContent('0')
    expect(groundValue('Last audit head')).toHaveTextContent(/^[0-9a-f]{12}…$/)

    expect((await readAuditTrail(vault)).map((e) => e.action)).toEqual(['consent.changed', 'sync.sent'])
    await user.click(screen.getByRole('button', { name: 'Verify the chain' }))
    expect(await screen.findByText('Chain intact: 2 entries, every signature valid.')).toBeInTheDocument()
  })

  it('discards a batch altered in transit', async () => {
    const { user } = await setup()
    await user.click(screen.getByRole('checkbox', { name: 'Share Check-ins with Flight surgeon (ground)' }))
    await user.click(screen.getByRole('button', { name: 'Send and alter it in transit (demo)' }))
    await waitFor(() => expect(groundValue('Batches rejected')).toHaveTextContent('1'))
    expect(groundValue('Records received')).toHaveTextContent('0')
    expect(screen.getByText(/failed its signature check and was discarded/)).toBeInTheDocument()
  })

  it('holds Mars traffic for the light delay, with a training-mode skip', async () => {
    const { user } = await setup('mars_surface')
    expect(screen.getByText('12 min (Mars)')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Earth to Mars distance today'), '22')
    expect(screen.getByText('22 min (Mars)')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Share Check-ins with Flight surgeon (ground)' }))
    await user.click(screen.getByRole('button', { name: 'Send allowed data' }))
    expect(await screen.findByText(/1 record, arrives \d\d:\d\d:\d\d UTC/)).toBeInTheDocument()
    expect(groundValue('Records received')).toHaveTextContent('0')
    await user.click(screen.getByRole('button', { name: 'Skip the wait (training mode)' }))
    await waitFor(() => expect(groundValue('Records received')).toHaveTextContent('1'))
  })

  it('shows when an audit entry was edited inside the vault', async () => {
    const { user, vault } = await setup()
    await user.click(screen.getByRole('checkbox', { name: 'Share Vital signs with Crew medical officer' }))
    await waitFor(async () => expect(await readAuditTrail(vault)).toHaveLength(1))
    const [entry] = await readAuditTrail(vault)
    await vault.put('audit', '0000000000', { ...entry!, detail: { allowed: false } } satisfies AuditEntry)
    await user.click(screen.getByRole('button', { name: 'Verify the chain' }))
    expect(await screen.findByText('Chain broken at entry 0: content changed.')).toBeInTheDocument()
    const table = screen.getByRole('columnheader', { name: 'What' }).closest('table')!
    expect(within(table).getByText('consent.changed')).toBeInTheDocument()
  })
})
