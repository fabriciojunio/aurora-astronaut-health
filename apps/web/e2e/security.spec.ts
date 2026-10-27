import { expect, test } from './fixtures'

test('serves every page and file with the security headers', async ({ request }) => {
  for (const path of ['/', '/data/manifest.json', '/models/anomaly-v1.json', '/sw.js']) {
    const response = await request.get(path)
    expect(response.ok(), path).toBe(true)
    const headers = response.headers()
    expect(headers['content-security-policy'], path).toContain("default-src 'none'")
    expect(headers['content-security-policy'], path).toContain("require-trusted-types-for 'script'")
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['referrer-policy']).toBe('no-referrer')
    expect(headers['cross-origin-opener-policy']).toBe('same-origin')
  }
})

test('runs with no CSP violation and no inline script', async ({ page, problems }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Create your PIN' })).toBeVisible()
  expect(await page.locator('script:not([src])').count()).toBe(0)
  expect(problems).toEqual([])
})

test('keeps the key only in memory: a reload asks for the PIN again', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel(/^PIN/).fill('480137')
  await page.getByLabel('Repeat the PIN').fill('480137')
  await page.getByRole('button', { name: 'Create vault' }).click()
  await expect(page.getByRole('tablist', { name: 'Views' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Unlock' })).toBeVisible()
})

test('stores nothing readable in IndexedDB', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel(/^PIN/).fill('480137')
  await page.getByLabel('Repeat the PIN').fill('480137')
  await page.getByRole('button', { name: 'Create vault' }).click()
  await page.getByRole('tab', { name: 'Check-in' }).click()
  await page.getByLabel(/Sleep last night/).fill('7')
  await page.getByLabel(/Fluids yesterday/).fill('2600')
  await page.getByLabel(/Resistance exercise/).fill('60')
  await page.getByLabel(/Aerobic exercise/).fill('30')
  await page.getByLabel(/Note/).fill('knee hurts on the treadmill')
  await page.getByRole('button', { name: 'Save check-in' }).click()
  await expect(page.getByText('Saved encrypted on this device.')).toBeVisible()

  const dump = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('aurora')
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
    const all = await new Promise<unknown[]>((resolve) => {
      const req = db.transaction('records').objectStore('records').getAll()
      req.onsuccess = () => resolve(req.result)
    })
    return JSON.stringify(all)
  })
  expect(dump).toContain('checkins')
  expect(dump).not.toContain('treadmill')
  expect(dump).not.toContain('2600')
})

test.describe('without the service worker', () => {
  test.use({ serviceWorkers: 'block' })

  test('refuses radiation data altered on the network', async ({ page }) => {
    await page.route('**/data/radiation-may-2024.json', async (route) => {
      const response = await route.fetch()
      const body = (await response.text()).replace('"mean_rate":', '"mean_rate": 0.0 , "x":')
      await route.fulfill({ response, body })
    })
    await page.goto('/')
    await page.getByLabel(/^PIN/).fill('480137')
    await page.getByLabel('Repeat the PIN').fill('480137')
    await page.getByRole('button', { name: 'Create vault' }).click()
    await page.getByRole('tab', { name: 'Radiation' }).click()
    await expect(page.getByRole('alert')).toContainText('failed their integrity check')
    await expect(page.getByRole('figure')).toHaveCount(0)
  })
})
