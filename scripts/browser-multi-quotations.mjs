// Pending browser regression. Added without execution, as requested.
// Requires running API/frontend, Playwright/Chrome, and Sarvam credits.
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173')
  await page.getByLabel('Upload supplier quotes').setInputFiles([
    fileURLToPath(new URL('../../backend/tests/fixtures/quotations/Apex_Containers.pdf', import.meta.url)),
    fileURLToPath(new URL('../../backend/tests/fixtures/quotations/PackCorp_India.xlsx', import.meta.url)),
  ])
  await page.getByText('2 quotation(s) added. Successful files are saved independently. Review supplier terms and QA before awarding.').waitFor({ timeout: 720000 })
  assert.equal(await page.locator('.queue-file.completed').count(), 2)
  assert.equal(await page.locator('.comparison-table tbody tr').count(), 30)
  assert.equal(await page.locator('.supplier-header').count(), 2)
  assert.equal(await page.locator('.price-subheaders th').count(), 4)
  const sku1 = page.locator('.comparison-table tbody tr').filter({ hasText: 'SKU-001' })
  assert.match(await sku1.innerText(), /₹13\.60/)
  assert.match(await sku1.innerText(), /Rebate not applied/)
  assert.match(await page.locator('.table-footer').innerText(), /30 matched across suppliers/)
  for (const header of await page.locator('.supplier-header').all()) {
    await header.click()
    await page.getByLabel('Buyer QA decision').selectOption('passed')
    await page.getByText('I verified the rates and all commercial terms against the original quote.').check()
    await page.getByRole('button', { name: 'Save & recalculate' }).click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
  }
  await page.getByLabel('Ask a procurement scenario').fill('What is the lowest-cost split award among suppliers that passed quality checks?')
  await page.getByRole('button', { name: 'Calculate scenario' }).click()
  await page.locator('.conversation .result-total').waitFor({ timeout: 180000 })
  assert.equal(await page.locator('.conversation .award-table tbody tr').count(), 2)
  await page.reload()
  await page.locator('.comparison-table tbody tr').nth(29).waitFor()
  assert.equal(await page.locator('.queue-file.completed').count(), 2)
  console.log('PASS mixed-format upload, per-file status, 30 joins, landed freight, inactive rebate, QA-gated deterministic chat and saved reload')
} finally {
  await browser.close()
}
