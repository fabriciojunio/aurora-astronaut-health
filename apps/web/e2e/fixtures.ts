import { test as base, expect, type Page } from '@playwright/test'

export const PIN = '480137'

/** Fails the test on any console error, uncaught exception or CSP violation. */
export const test = base.extend<{ problems: string[] }>({
  problems: async ({ page }, provide) => {
    const problems: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') problems.push(msg.text())
    })
    page.on('pageerror', (error) => problems.push(error.message))
    await provide(problems)
    expect(problems).toEqual([])
  },
})

export async function createVault(page: Page) {
  await page.goto('/')
  await page.getByLabel(/^PIN/).fill(PIN)
  await page.getByLabel('Repeat the PIN').fill(PIN)
  await page.getByRole('button', { name: 'Create vault' }).click()
  await expect(page.getByRole('tablist', { name: 'Views' })).toBeVisible()
}

export async function unlock(page: Page) {
  await page.getByLabel(/^PIN/).fill(PIN)
  await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.getByRole('tablist', { name: 'Views' })).toBeVisible()
}

export { expect }
