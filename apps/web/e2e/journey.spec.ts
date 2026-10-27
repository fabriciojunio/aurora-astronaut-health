import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { createVault, expect, test, unlock } from './fixtures'

async function expectAccessible(page: Page, screen: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(violations.map((v) => `${screen}: ${v.id} (${v.nodes.length})`)).toEqual([])
}

test('a full mission day, accessible on every screen', async ({ page }) => {
  await page.goto('/')
  await expectAccessible(page, 'create PIN')
  await createVault(page)
  await expectAccessible(page, 'crew')

  await page.getByLabel('Scenario').selectOption({ label: 'Fever in the crew medical officer' })
  const okafor = page.getByRole('article', { name: 'M. Okafor' })
  await expect(okafor.getByText('Unusual pattern')).toBeVisible()
  await expect(okafor.getByRole('list', { name: 'Signals furthest from normal' })).toContainText('Temperature')
  await expect(page.getByRole('article', { name: 'A. Rivera' }).getByText('Within this person’s usual pattern.')).toBeVisible()

  await page.getByRole('tab', { name: 'Radiation' }).click()
  await expect(page.getByRole('figure', { name: 'Mars surface (Curiosity RAD)' }).getByText('20 May')).toBeVisible()
  await expectAccessible(page, 'radiation')

  await page.getByRole('tab', { name: 'Check-in' }).click()
  await page.getByLabel(/Sleep last night/).fill('5')
  await page.getByLabel(/Fluids yesterday/).fill('1800')
  await page.getByLabel(/Resistance exercise/).fill('20')
  await page.getByLabel(/Aerobic exercise/).fill('30')
  await page.getByRole('checkbox', { name: 'Headache' }).check()
  await page.getByRole('button', { name: 'Save check-in' }).click()
  await expect(page.getByText('Saved encrypted on this device.')).toBeVisible()
  await expectAccessible(page, 'check-in')

  await page.getByRole('tab', { name: 'Vigilance test' }).click()
  await expectAccessible(page, 'vigilance test')

  await page.getByRole('tab', { name: 'Assistant' }).click()
  await page.getByRole('button', { name: 'What do I do in a solar storm?' }).click()
  await expect(page.getByText('Solar particle event: go to the storm shelter').first()).toBeVisible()
  await expectAccessible(page, 'assistant')

  await page.getByRole('tab', { name: 'Privacy and sync' }).click()
  await page.getByRole('checkbox', { name: 'Share Check-ins with Flight surgeon (ground)' }).check()
  await page.getByRole('button', { name: 'Send allowed data' }).click()
  await expect(page.getByText('Records received').locator('..')).toContainText('1')
  await page.getByRole('button', { name: 'Verify the chain' }).click()
  await expect(page.getByText(/Chain intact: 3 entries/)).toBeVisible()
  await expectAccessible(page, 'privacy')

  await page.getByRole('button', { name: 'Lock' }).click()
  await expect(page.getByRole('heading', { name: 'Unlock' })).toBeVisible()
  await expectAccessible(page, 'unlock')
})

test('works with no connection once installed', async ({ page, context }) => {
  await createVault(page)
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await context.setOffline(true)
  await page.reload()
  await unlock(page)
  await page.getByRole('tab', { name: 'Radiation' }).click()
  await expect(page.getByRole('figure', { name: 'Lunar orbit (CRaTER)' })).toBeVisible()
  await page.getByRole('tab', { name: 'Crew' }).click()
  await page.getByLabel('Scenario').selectOption({ label: 'Fever in the crew medical officer' })
  await expect(page.getByRole('article', { name: 'M. Okafor' }).getByText('Unusual pattern')).toBeVisible()
})

test('fits a phone screen without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await createVault(page)
  for (const tab of ['Crew', 'Radiation', 'Check-in', 'Vigilance test', 'Assistant', 'Privacy and sync']) {
    await page.getByRole('tab', { name: tab }).click()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, tab).toBeLessThanOrEqual(0)
  }
})

test('works in Portuguese, accessible, and remembers the language', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Português/ }).click()
  await page.getByLabel(/^PIN/).fill('480137')
  await page.getByLabel('Repita o PIN').fill('480137')
  await page.getByRole('button', { name: 'Criar cofre' }).click()
  await page.getByLabel('Cenário').selectOption({ label: 'Febre no oficial médico da tripulação' })
  await expect(page.getByRole('article', { name: 'M. Okafor' }).getByText('Padrão incomum')).toBeVisible()
  await expectAccessible(page, 'crew (pt)')
  await page.getByRole('tab', { name: 'Assistente' }).click()
  await page.getByRole('button', { name: 'O que faço numa tempestade solar?' }).click()
  await expect(page.getByText('Evento de partículas solares: ir para o abrigo').first()).toBeVisible()
  await expectAccessible(page, 'assistant (pt)')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Desbloquear' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
})
