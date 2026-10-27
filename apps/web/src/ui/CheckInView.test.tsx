// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import type { CheckIn } from '../domain/checkin'
import { readAuditTrail } from '../storage/auditTrail'
import { idbGetAllByIndex, openDatabase } from '../storage/idb'
import { Vault } from '../storage/vault'
import { CheckInView } from './CheckInView'

let n = 0

async function setup(now: () => Date = () => new Date('2026-11-14T07:00:00Z')) {
  const dbName = `checkin-ui-${++n}`
  const vault = await Vault.create('480137', { dbName, iterations: 1_000 })
  function Harness() {
    const [crewId, setCrewId] = useState('crew-1')
    return <CheckInView vault={vault} crewId={crewId} onCrewChange={setCrewId} now={now} />
  }
  const user = userEvent.setup()
  render(<Harness />)
  return { vault, user, dbName }
}

async function fill(user: ReturnType<typeof userEvent.setup>, values: { sleep: string; fluids?: string }) {
  for (const [label, value] of [
    [/Sleep last night/, values.sleep],
    [/Fluids yesterday/, values.fluids ?? '2600'],
    [/Resistance exercise/, '60'],
    [/Aerobic exercise/, '30'],
  ] as const) {
    const input = screen.getByLabelText(label)
    await user.clear(input)
    await user.type(input, value)
  }
}

describe('daily check-in', () => {
  it('refuses to save blank numbers instead of treating them as zero', async () => {
    const { vault, user } = await setup()
    await user.click(screen.getByRole('button', { name: 'Save check-in' }))
    expect(screen.getAllByText('Enter a number in the allowed range.')).toHaveLength(4)
    expect(screen.getByLabelText(/Sleep last night/)).toHaveAttribute('aria-invalid', 'true')
    expect(await vault.list('checkins')).toEqual([])
  })

  it('rejects values outside the allowed range', async () => {
    const { vault, user } = await setup()
    await fill(user, { sleep: '20' })
    await user.click(screen.getByRole('button', { name: 'Save check-in' }))
    expect(screen.getByLabelText(/Sleep last night/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/Fluids yesterday/)).not.toHaveAttribute('aria-invalid')
    expect(await vault.list('checkins')).toEqual([])
  })

  it('saves encrypted, audits without the content and raises a critical alert for chest pain', async () => {
    const { vault, user, dbName } = await setup()
    await fill(user, { sleep: '7.5' })
    await user.click(screen.getByRole('checkbox', { name: 'Chest pain' }))
    await user.type(screen.getByLabelText(/Note/), 'pressure after the treadmill')
    await user.click(screen.getByRole('button', { name: 'Save check-in' }))

    expect(await screen.findByText('Saved encrypted on this device.')).toBeInTheDocument()
    const alerts = screen.getByRole('region', { name: 'From your check-ins' })
    expect(within(alerts).getByText('Chest pain or shortness of breath reported')).toBeInTheDocument()
    expect(within(alerts).getByText('Critical')).toBeInTheDocument()

    const [saved] = await vault.list<CheckIn>('checkins')
    expect(saved).toMatchObject({ crewId: 'crew-1', sleepHours: 7.5, symptoms: ['chestPain'], note: 'pressure after the treadmill' })

    const audit = await readAuditTrail(vault)
    expect(audit.map((e) => e.action)).toEqual(['checkin.saved'])
    expect(JSON.stringify(audit)).not.toContain('treadmill')

    const db = await openDatabase(dbName)
    const raw = JSON.stringify(await idbGetAllByIndex(db, 'records', 'byCollection', 'checkins'))
    db.close()
    expect(raw).not.toContain('treadmill')
    expect(raw).not.toContain('chestPain')

    expect(screen.getByLabelText(/Sleep last night/)).toHaveValue(null)
    expect(screen.getByText('1 check-in stored for A. Rivera.')).toBeInTheDocument()
  })

  it('warns about sleep debt after several short nights', async () => {
    let day = 10
    const { user } = await setup(() => new Date(`2026-11-${day}T07:00:00Z`))
    for (; day < 14; day++) {
      await fill(user, { sleep: '5' })
      await user.click(screen.getByRole('button', { name: 'Save check-in' }))
      await screen.findByText(`${day - 9} ${day === 10 ? 'check-in' : 'check-ins'} stored for A. Rivera.`)
    }
    expect(screen.getByText('Sleep averaging 5 h')).toBeInTheDocument()
  })

  it('keeps each crew member’s check-ins apart', async () => {
    const { user } = await setup()
    await fill(user, { sleep: '7' })
    await user.click(screen.getByRole('button', { name: 'Save check-in' }))
    await screen.findByText('1 check-in stored for A. Rivera.')
    await user.selectOptions(screen.getByLabelText('Recording for'), 'crew-3')
    expect(await screen.findByText('0 check-ins stored for M. Okafor.')).toBeInTheDocument()
  })
})
