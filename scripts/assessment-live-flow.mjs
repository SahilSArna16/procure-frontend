import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/tmp/procurement-browser/node_modules/playwright/index.mjs')
const base = process.env.APP_URL || 'http://127.0.0.1:5174'
const artifacts = new URL('../../deliverables/', import.meta.url).pathname
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('pageerror', e => errors.push(e.message))
try {
  await page.goto(base)
  await page.getByRole('button', { name: 'Load five-vendor demo', exact: true }).first().click()
  await page.getByLabel('What are you sourcing?').waitFor()
  await page.getByRole('button', { name: 'Generate / revise RFx' }).click()
  console.log('Waiting for real RFx co-pilot response…')
  await page.locator('.rfx-draft').waitFor({ timeout: 240000 })
  await page.getByText('I reviewed the specifications, quantities and qualification rules.').check()
  await page.getByRole('button', { name: 'Save buyer-reviewed RFx' }).click()
  await page.getByText('Saved. Prices and award recommendations have been recalculated.').waitFor()
  await page.getByRole('button', { name: 'Prepare vendor invitations' }).click()
  await page.locator('.outbox-panel > div').nth(4).waitFor()
  assert.equal(await page.locator('.outbox-panel > div').count(), 5)
  await page.getByRole('button', { name: 'Extract all five demo responses' }).click()
  console.log('Processing real Excel/PDF/Word/vision/email extraction…')
  await page.getByText('Live extraction completed. Review supporting documents and confirm supplier commercial terms. GreenBox has 27 USD quotes; Metro has unknown historical rates/freight. No evidence is auto-approved.').waitFor({ timeout: 1200000 })
  await page.screenshot({ path: artifacts + 'five-vendor-qualification.png', fullPage: true })
  const id = await page.evaluate(() => localStorage.getItem('procure.workspace'))
  let response = await page.request.get(base + '/api/workspaces/' + id)
  let data = await response.json()
  await writeFile(artifacts + 'live-extraction.json', JSON.stringify(data, null, 2))
  assert.equal(data.workspace.skus.length, 30)
  assert.equal(data.workspace.quotes.length, 5, JSON.stringify(data.workspace.uploads.filter(u => u.status === 'failed')))
  assert.equal(data.workspace.outbox.length, 5)
  const green = data.workspace.quotes.find(q => q.source_file.includes('GreenBox'))
  assert.equal(green.line_items.filter(l => l.quoted_price !== null).length, 27)
  assert.equal(green.currency, 'USD')
  assert.equal(data.quality[green.vendor_id].passed, false)
  // Explicitly review the synthetic evidence, via the user-facing controls.
  for (const checkbox of await page.getByLabel('Buyer reviewed evidence', { exact: true }).all()) {
    await checkbox.check()
    await page.getByText('Saved. Prices and award recommendations have been recalculated.').waitFor()
  }
  await page.getByRole('tab', { name: /Supplier quotes/ }).click()
  for (const card of await page.locator('.supplier-card').all()) {
    const text = await card.innerText()
    if (text.includes('Metro')) continue
    await card.click()
    await page.getByText('I verified the rates and all commercial terms against the original quote.').check()
    await page.getByRole('button', { name: 'Save & recalculate' }).click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
  }
  await page.getByRole('tab', { name: 'Price comparison' }).click()
  await page.getByLabel('I approve this rate', { exact: true }).check()
  await page.getByRole('button', { name: 'Save conversion & recalculate' }).click()
  await page.getByText('Saved. Prices and award recommendations have been recalculated.').waitFor()
  await page.screenshot({ path: artifacts + 'five-vendor-comparison.png', fullPage: true })
  response = await page.request.get(base + '/api/workspaces/' + id)
  data = await response.json()
  const approved = Object.values(data.quality).filter(q => q.passed === true).length
  assert.equal(approved, 3, JSON.stringify(data.quality))
  assert.equal(data.recommended.status, 'ok')
  assert(data.rows.some(row => row.prices[green.vendor_id].landed_price_per_box !== null))
  assert.equal(data.workspace.documents.filter(d => d.role === 'supporting').length, 4)
  assert(data.workspace.documents.every(d => !('content_base64' in d)))
  await writeFile(artifacts + 'reviewed-comparison.json', JSON.stringify(data, null, 2))
  await writeFile(artifacts + 'workspace-id.txt', id)
  assert.deepEqual(errors, [])
  console.log('PASS live RFx, five simulated invitations, five real extraction formats, 30 master items, 27-item USD edge, evidence review, derived QA, FX and deterministic award. Workspace:', id)
} catch (error) {
  await page.screenshot({ path: artifacts + 'flow-failure.png', fullPage: true })
  console.log((await page.locator('body').innerText()).slice(-7000))
  throw error
} finally { await browser.close() }
