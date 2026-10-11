import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
const {chromium}=await import('/tmp/procurement-browser/node_modules/playwright/index.mjs')
const base='http://127.0.0.1:5174'
const folder=new URL('../../deliverables/',import.meta.url).pathname
const original=JSON.parse(await readFile(folder+'live-extraction.json','utf8'))
const id=original.workspace.id
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']})
const page=await browser.newPage({viewport:{width:1440,height:1000}})
try {
  await page.addInitScript(value=>localStorage.setItem('procure.workspace',value),id)
  await page.goto(base)
  await page.getByRole('tab',{name:'RFx & vendors'}).click()
  await page.getByRole('button',{name:'Generate / revise RFx'}).waitFor()
  let data=await(await page.request.get(base+'/api/workspaces/'+id)).json()
  const packwell=data.workspace.quotes.find(q=>q.source_file==='Packwell_Footnote.pdf')
  const reconciled=await page.request.post(base+'/api/workspaces/'+id+'/quotes/'+packwell.vendor_id+'/source-reconcile')
  assert.equal(reconciled.status(),200,await reconciled.text())
  data=await reconciled.json()
  // Review against independently computed prices in the synthetic input documents.
  for(const quote of data.workspace.quotes.slice(0,4)) {
    const v=['Apex_30_Items.xlsx','Packwell_Footnote.pdf','GreenBox_27_Items_USD.docx','Shree_Angled_Rate_Card.png'].indexOf(quote.source_file)
    for(const line of quote.line_items.filter(l=>l.quoted_price!==null)) {
      const i=Number(line.sku_id.split('-')[1])-1
      const rate=12+.87*i+((i*7+v*11)%9)/4
      const weight=Number(data.workspace.skus.find(s=>s.sku_id===line.sku_id).weight_kg)
      const expected=v===2?Number((rate/83*100).toFixed(2)):v===3?Number((rate/weight).toFixed(2)):Number(rate.toFixed(2))
      assert(Math.abs(Number(line.quoted_price)-expected)<.011,`${quote.source_file} ${line.sku_id}: ${line.quoted_price} != ${expected}`)
    }
  }
  await page.reload()
  const iso=data.workspace.rfx.questionnaire.find(q=>/iso\s*9001/i.test(q.prompt))
  assert.equal(data.workspace.rfx.questionnaire.filter(q=>q.required_for_qa).length,4)
  assert(iso.requires_attachment)
  await page.getByRole('tab',{name:'Questionnaire & docs'}).click()
  await page.locator('.quality-vendor').nth(4).waitFor()
  for (const selector of await page.getByRole('combobox',{name:/Evidence question for/}).all()) await selector.selectOption(iso.id)
  for (const checkbox of await page.getByLabel('Buyer reviewed evidence',{exact:true}).all()) await checkbox.check()
  await page.getByRole('button',{name:'Save evidence reviews'}).click()
  await page.waitForFunction(()=>!document.querySelector('.busy-banner'))
  await page.getByRole('tab',{name:/Supplier quotes/}).click()
  for (const card of await page.locator('.supplier-card').all()) {
    const text=await card.innerText()
    if(text.includes('Metro'))continue
    await card.click()
    if(!text.includes('Packwell')) await page.getByRole('button',{name:'Confirm freight included for all items'}).click()
    for(const check of await page.getByRole('checkbox',{name:/Needs review SKU/}).all()) if(await check.isChecked()) await check.uncheck()
    await page.getByText('I verified the rates and all commercial terms against the original quote.').check()
    await page.getByRole('button',{name:'Save & recalculate'}).click()
    await page.getByRole('dialog').waitFor({state:'hidden'})
  }
  await page.getByRole('tab',{name:'Price comparison'}).click()
  await page.getByLabel('I approve this rate',{exact:true}).check()
  await page.getByRole('button',{name:'Save conversion & recalculate'}).click()
  await page.waitForFunction(()=>!document.querySelector('.busy-banner'))
  data=await(await page.request.get(base+'/api/workspaces/'+id)).json()
  await writeFile(folder+'reviewed-comparison.json',JSON.stringify(data,null,2))
  await writeFile(folder+'workspace-id.txt',id)
  await page.screenshot({path:folder+'five-vendor-comparison.png',fullPage:true})
  const statuses=Object.fromEntries(data.workspace.quotes.map(q=>[q.vendor_name,data.quality[q.vendor_id].status]))
  console.log('Actual qualification:',statuses)
  assert.equal(Object.values(data.quality).filter(q=>q.passed===true).length,3,JSON.stringify(data.quality))
  assert.equal(data.recommended.status,'ok',JSON.stringify(data.recommended))
  const green=data.workspace.quotes.find(q=>q.source_file.includes('GreenBox'))
  assert.equal(green.line_items.filter(l=>l.quoted_price!==null).length,27)
  assert.equal(data.quality[green.vendor_id].passed,false)
  assert(data.rows.some(r=>r.prices[green.vendor_id].landed_price_per_box!==null))
  const fixed=data.workspace.quotes.find(q=>q.source_file==='Packwell_Footnote.pdf')
  assert.equal(Number(fixed.freight_per_order),7500)
  assert(fixed.line_items.every(l=>Number(l.freight_per_box)===0))
  assert.equal(Number(fixed.rebate.minimum_order_value),6000000)
  await page.getByRole('tab',{name:'Questionnaire & docs'}).click()
  await page.screenshot({path:folder+'five-vendor-qualification.png',fullPage:true})
  console.log('PASS: five real-extracted vendors, exact four buyer rules, reviewed evidence, three passed/one failed/one pending, USD normalized and complete QA award:',data.recommended.total)
} catch(error){await page.screenshot({path:folder+'review-failure.png',fullPage:true});console.log((await page.locator('body').innerText()).slice(-5000));throw error}
finally{await browser.close()}
