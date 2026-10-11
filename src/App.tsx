
import { useEffect, useRef, useState } from 'react'
import { api, apiUrl, jsonBody } from './api'
import Icon from './components/Icon'
import QuoteEditor from './components/QuoteEditor'
import UploadQueue from './components/UploadQueue'
import ComparisonTable from './components/ComparisonTable'
import type { Comparison, Plan, Quote, Scenario, Workspace, QueuedUpload, UploadResponse } from './types'
import './App.css'

const inr = (value: string | number | null | undefined, decimals = 0) => value == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(Number(value))
const number = (value: number | null) => value === null ? 'Missing' : new Intl.NumberFormat('en-IN').format(value)
type Tab = 'comparison' | 'suppliers' | 'master' | 'scenarios'
type Message = { question: string; result: Scenario }

function ScenarioResult({ result }: { result: Scenario }) {
  return <div className={`scenario-result ${result.status !== 'ok' ? 'unresolved' : ''}`}>
    <div className="result-heading"><span className="result-spark"><Icon name="spark" size={17} /></span><strong>{result.status === 'ok' ? 'Scenario calculated' : result.status === 'clarify' ? 'A little more detail needed' : 'Award needs attention'}</strong>{result.total && <span className="result-total">{inr(result.total, 2)}</span>}</div>
    <p>{result.summary}</p>
    {!!result.awards.length && <div className="table-scroll"><table className="award-table"><thead><tr><th>Supplier</th><th>SKUs</th><th>Boxes</th><th>Freight</th><th>Award total</th></tr></thead><tbody>{result.awards.map(a => <tr key={a.vendor_id}><td>{a.vendor_name}</td><td>{a.sku_count}</td><td>{number(a.quantity)}</td><td>{inr(a.freight, 2)}</td><td><strong>{inr(a.total, 2)}</strong></td></tr>)}</tbody></table></div>}
    {result.vendors && <div className="table-scroll"><table className="award-table"><thead><tr><th>Supplier</th><th>Quoted SKUs</th><th>Full-order total</th></tr></thead><tbody>{result.vendors.map(v => <tr key={v.vendor_id}><td>{v.vendor_name}</td><td>{v.coverage}</td><td>{v.total ? inr(v.total, 2) : 'Incomplete quote'}</td></tr>)}</tbody></table></div>}
    {result.savings != null && Number(result.savings) > 0 && <div className="savings-note"><Icon name="check" size={16} /> {inr(result.savings, 2)} below the cheapest complete single-supplier award.</div>}
    {result.plan && <small className="scenario-assumptions">QA filter: {result.plan.qa_only === false ? 'all suppliers' : 'approved only'} · Tax: {result.plan.include_tax ? 'included' : 'excluded'} · Quantity: ×{result.plan.quantity_multiplier ?? '1'} · Max suppliers: {result.plan.max_suppliers ?? 10}</small>}
  </div>
}

export default function App() {
  const [data, setData] = useState<Comparison | null>(null)
  const [tab, setTab] = useState<Tab>('comparison')
  const [busy, setBusy] = useState(() => localStorage.getItem('procure.workspace') ? 'Restoring comparison' : '')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [health, setHealth] = useState<{ ai_configured: boolean; storage: string } | null>(null)
  const [query, setQuery] = useState('')
  const [factory, setFactory] = useState('all')
  const [qaFilter, setQaFilter] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [editing, setEditing] = useState<Quote | null>(null)
  const [master, setMaster] = useState<Workspace | null>(null)
  const [queue, setQueue] = useState<QueuedUpload[]>([])
  const retryPicker = useRef<HTMLInputElement>(null)
  const retryTarget = useRef<QueuedUpload | null>(null)
  const uploader = useRef<HTMLInputElement>(null)
  const masterUploader = useRef<HTMLInputElement>(null)
  const workspace = data?.workspace

  useEffect(() => {
    let active = true
    api<{ ai_configured: boolean; storage: string }>('/health').then(h => { if (active) setHealth(h) }).catch(() => {})
    const id = localStorage.getItem('procure.workspace')
    if (id) {
      api<Comparison>(`/workspaces/${id}`).then(d => { if (active) setData(d) }).catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setBusy('') })
    }
    return () => { active = false }
  }, [])

  function accept(next: Comparison, reset = false) {
    setData(next)
    localStorage.setItem('procure.workspace', next.workspace.id)
    setMaster(null)
    if (reset) { setMessages([]); setQuery(''); setFactory('all'); setQaFilter(false); setQueue([]) }
  }
  async function perform(label: string, action: () => Promise<void>) {
    setBusy(label); setError(''); setNotice('')
    try { await action() } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong. Please retry.') } finally { setBusy('') }
  }
  function loadSample() {
    void perform('Loading sample dataset', async () => { accept(await api<Comparison>('/workspaces/sample', { method: 'POST' }), true); setTab('comparison'); setNotice('Demo loaded: 30 master SKUs, five curated supplier quotes. No AI credits used.') })
  }
  function startFreshUpload() {
    if (workspace) localStorage.setItem('procure.previousWorkspace', workspace.id)
    localStorage.removeItem('procure.workspace')
    setData(null); setQueue([]); setMaster(null); setEditing(null); setMessages([])
    setQuery(''); setFactory('all'); setQaFilter(false); setError(''); setTab('comparison')
    setNotice('Ready for a new comparison. Select your supplier files together; the master will be derived from their source SKUs and quantities.')
  }
  function restorePrevious() {
    const id = localStorage.getItem('procure.previousWorkspace')
    if (!id) return
    void perform('Restoring previous comparison', async () => { accept(await api<Comparison>(`/workspaces/${id}`), true) })
  }
  function useMaster() {
    if (!workspace) return
    void perform('Creating comparison', async () => { accept(await api<Comparison>('/workspaces', jsonBody(workspace.skus)), true); setTab('comparison'); setNotice('New comparison created from this master. Upload your supplier quotes to begin.') })
  }
  function upload(files: FileList | File[], retry?: QueuedUpload) {
    const selected = Array.from(files)
    if (!selected.length || busy) return
    void perform('Processing supplier quotations', async () => {
      let uploadWorkspaceId: string
      if (workspace && !workspace.is_sample) {
        uploadWorkspaceId = workspace.id
      } else {
        const fresh = await api<Comparison>('/workspaces/draft', { method: 'POST' })
        accept(fresh, true)
        uploadWorkspaceId = fresh.workspace.id
      }
      const batch: QueuedUpload[] = selected.map(file => ({ id: crypto.randomUUID(), uploadId: retry?.uploadId, name: file.name, format: file.name.split('.').pop()?.toUpperCase() ?? 'UNKNOWN', status: 'queued', file }))
      setQueue(previous => [...previous.filter(item => !retry || item.id !== retry.id), ...batch])
      let added = 0
      for (const item of batch) {
        setQueue(previous => previous.map(f => f.id === item.id ? { ...f, status: 'processing', error: null } : f))
        const form = new FormData()
        form.append('files', item.file!)
        if (item.uploadId) form.append('retry_upload_id', item.uploadId)
        try {
          const result: UploadResponse = await api<UploadResponse>(`/workspaces/${uploadWorkspaceId}/quotes`, { method: 'POST', body: form })
          accept(result.comparison)
          added += result.added
          const record = result.files[0]
          if (!record) throw new Error('The backend did not return a file processing result.')
          setQueue(previous => previous.map(f => f.id === item.id ? { ...f, uploadId: record.id, status: record.status, error: record.error, matched_count: record.matched_count, uncertain_count: record.uncertain_count, missing_count: record.missing_count } : f))
        } catch (failure) {
          setQueue(previous => previous.map(f => f.id === item.id ? { ...f, status: 'failed', error: failure instanceof Error ? failure.message : 'File processing failed. Retry this file.' } : f))
        }
      }
      setMessages([])
      setTab('comparison')
      setNotice(`${added} quotation(s) added. Successful files are saved independently. Review supplier terms and QA before awarding.`)
    })
  }
  function retryFile(file: QueuedUpload) {
    if (file.file) upload([file.file], file)
    else { retryTarget.current = file; retryPicker.current?.click() }
  }
  function importMaster(file?: File) {
    if (!file) return
    void perform('Importing master SKUs', async () => { const form = new FormData(); form.append('file', file); accept(await api<Comparison>('/master-import', { method: 'POST', body: form }), true); setTab('master'); setNotice('Master imported. This is a new comparison; your previous comparison has been retained.') })
  }
  function saveWorkspace(next: Workspace, close = false) {
    void perform('Saving and recalculating', async () => { accept(await api<Comparison>(`/workspaces/${next.id}`, jsonBody(next, 'PUT'))); setMessages([]); if (close) setEditing(null); setNotice('Saved. Prices and award recommendations have been recalculated.') })
  }
  function saveQuote(quote: Quote) {
    if (workspace) saveWorkspace({ ...workspace, quotes: workspace.quotes.map(q => q.vendor_id === quote.vendor_id ? quote : q) }, true)
  }
  function runScenario(text: string, plan?: Plan) {
    if (!workspace) return
    void perform('Calculating scenario', async () => { const result = await api<Scenario>(`/workspaces/${workspace.id}/scenario`, jsonBody(plan ? { plan } : { question: text })); setMessages(m => [...m, { question: text, result }]); setQuestion(''); setTab('scenarios') })
  }
  const processingFiles: QueuedUpload[] = [
    ...(workspace?.uploads ?? []).filter(record => !queue.some(item => item.uploadId === record.id)).map(record => ({ ...record, uploadId: record.id })),
    ...queue,
  ]
  const vendors = workspace?.quotes.filter(q => !qaFilter || q.qa_passed === true) ?? []
  const rows = data?.rows.filter(row => (factory === 'all' || row.factory === factory) && `${row.sku_id} ${row.description}`.toLowerCase().includes(query.toLowerCase())) ?? []
  const factories = [...new Set(workspace?.skus.map(s => s.factory))]
  const recommended = data?.recommended
  const tabs: { id: Tab; label: string; count?: number }[] = [{ id: 'comparison', label: 'Price comparison' }, { id: 'suppliers', label: 'Supplier quotes', count: workspace?.quotes.length }, { id: 'master', label: 'Master SKUs', count: workspace?.skus.length }, { id: 'scenarios', label: 'Award scenarios', count: messages.length || undefined }]

  return <div className="app-shell">
    <aside className="sidebar"><a href="#" className="brand" onClick={e => e.preventDefault()}><span className="brand-icon"><Icon name="box" size={25} /></span>procure<span className="brand-dot">.</span></a><div className="workspace-label">SOURCING WORKSPACE</div>
      <nav aria-label="Workspace navigation"><button className={tab === 'comparison' || tab === 'suppliers' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('comparison')}><Icon name="grid" />Quote workspace<span className="nav-indicator" /></button><button className={tab === 'scenarios' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('scenarios')}><Icon name="chart" />Award scenarios</button><button className={tab === 'master' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('master')}><Icon name="box" />Master catalogue</button></nav>
      <div className="sidebar-help"><span className="help-icon"><Icon name="spark" /></span><h3>Need an example?</h3><p>Try the demo to see how supplier quotes and award comparisons work.</p><button onClick={loadSample} disabled={!!busy}>Explore the demo <Icon name="arrow" size={16} /></button></div>
      <div className="sidebar-bottom"><span className="avatar">PB</span><div><strong>Procurement buyer</strong><span>Local workspace</span></div><span className="connection-dot" /></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb">Workspace <Icon name="chevron" size={13} /> <strong>Packaging procurement</strong></div><span className="ai-status"><span className={health ? 'status-dot' : 'status-dot offline'} />{health ? health.ai_configured ? 'Sarvam connected' : 'Demo ready · AI key needed' : 'Connecting to backend'}</span></header>
      <main><div className="page-heading"><div><div className="eyebrow">YOUR SOURCING WORKSPACE</div><h1>Compare supplier quotations</h1><p>Upload supplier quotes, review prices and terms, and choose the best award.</p></div><div className="heading-actions"><button className="button secondary" onClick={loadSample} disabled={!!busy}><Icon name="spark" size={17} />Load Sample Dataset</button><a className={`button primary ${!workspace ? 'disabled' : ''}`} href={workspace ? apiUrl(`/workspaces/${workspace.id}/export`) : undefined} aria-disabled={!workspace}><Icon name="download" size={17} />Export comparison</a></div></div>
        {error && <div className="alert error" role="alert"><Icon name="warning" /><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><Icon name="close" size={16} /></button></div>}
        {notice && <div className="alert success" role="status"><Icon name="check" /><span>{notice}</span><button aria-label="Dismiss notice" onClick={() => setNotice('')}><Icon name="close" size={16} /></button></div>}
        {busy && <div className="busy-banner" role="status"><span className="spinner" />{busy}…</div>}
        <ol className="workflow-steps" aria-label="How to compare quotations">
          <li className={!workspace?.quotes.length ? 'current' : 'complete'}><button onClick={() => uploader.current?.click()} disabled={!!busy}><span className="step-number">1</span><span><strong>Upload quotations</strong><small>Select files from two or more suppliers</small></span></button></li>
          <li className={workspace?.quotes.length && workspace.quotes.some(q => !q.commercial_terms_confirmed || q.qa_passed === null) ? 'current' : ''}><button onClick={() => setTab('suppliers')}><span className="step-number">2</span><span><strong>Review prices & terms</strong><small>Check matches, freight, discounts, and QA</small></span></button></li>
          <li className={workspace?.quotes.length && workspace.quotes.every(q => q.commercial_terms_confirmed && q.qa_passed !== null) ? 'current' : ''}><button onClick={() => setTab('scenarios')}><span className="step-number">3</span><span><strong>Choose an award</strong><small>Compare totals or ask a scenario question</small></span></button></li>
        </ol>
        <section className="metrics" aria-label="Comparison overview">
          <div className="metric"><span className="metric-title">Line items<Icon name="box" size={18} /></span><strong>{data ? data.stats.sku_count : '—'}<span>SKUs</span></strong><small>{data ? `${factories.length} factory locations` : 'Your master catalogue'}</small></div>
          <div className="metric"><span className="metric-title">Supplier responses<Icon name="file" size={18} /></span><strong>{data ? data.stats.vendor_count : '—'}<span>suppliers</span></strong><small>{data ? `${data.stats.approved_vendor_count} passed buyer QA` : 'Any format. Same clarity.'}</small></div>
          <div className="metric"><span className="metric-title">Best complete award<Icon name="chart" size={18} /></span><strong className="money-metric">{inr(recommended?.total)}</strong><small>{recommended?.total ? 'Freight and eligible discounts included' : 'Confirm supplier terms and QA to calculate'}</small></div>
          <div className="metric highlight"><span className="metric-title">Potential savings<Icon name="spark" size={18} /></span><strong className="money-metric">{inr(recommended?.savings)}</strong><small>vs. cheapest complete single supplier</small></div>
        </section>
        <section className={`upload-card ${dragging ? 'dragging' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); if (!busy) upload(e.dataTransfer.files) }}>
          <span className="upload-icon"><Icon name="upload" size={26} /></span><div className="upload-copy"><h3>Upload supplier quotations</h3><p>Drop files here or select several files together. Use the Excel template to prepare your own quotation.</p><div className="file-formats">{['XLSX', 'PDF', 'DOCX', 'PNG', 'TXT'].map(f => <span key={f}>{f}</span>)}<small>Up to 15 MB per file</small></div>{workspace?.is_sample && <small className="demo-upload-note">Uploading starts a separate comparison with a master derived from the source quotations. Demo prices and weights are not reused.</small>}</div><div className="upload-actions"><a className="button secondary" href={apiUrl('/quotation-template')}><Icon name="download" size={17} />Download sample template</a><button className="button primary" disabled={!!busy} onClick={() => uploader.current?.click()}><Icon name="plus" size={17} />Upload quotes</button>{workspace ? <button className="text-button" disabled={!!busy} onClick={startFreshUpload}>Start fresh upload</button> : localStorage.getItem('procure.previousWorkspace') ? <button className="text-button" disabled={!!busy} onClick={restorePrevious}>Return to previous comparison</button> : null}</div>
          <input ref={uploader} type="file" className="hidden-input" aria-label="Upload supplier quotes" accept=".xlsx,.pdf,.docx,.png,.jpg,.jpeg,.txt" multiple onChange={e => { if (e.target.files) upload(e.target.files); e.target.value = '' }} />
        </section>
        <UploadQueue files={processingFiles} busy={!!busy} onRetry={retryFile} />
        <div className="section-heading"><div><h2>{workspace?.name ?? 'Your quote workspace'}{workspace?.is_sample && <span className="demo-badge">SAMPLE DATA</span>}</h2><p>{workspace ? `${number(data!.stats.total_quantity)} boxes requested · Landed prices in INR · Freight included · GST excluded by default` : 'Select two or more supplier files, use the demo, or import a master SKU list.'}</p></div><div className="test-file-links"><a className="text-button" href={apiUrl('/comparison-test-files')}><Icon name="download" size={15} />PDF + Excel test files</a><a className="text-button" href={apiUrl('/sample-files')}>Other sample files</a></div></div>
        <section className="workspace-panel"><div className="tabs" role="tablist" aria-label="Comparison views">{tabs.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>{t.label}{t.count !== undefined && <span>{t.count}</span>}</button>)}</div>
          {!data || !workspace ? <div className="empty-state"><div className="empty-illustration"><Icon name="file" size={36} /><span><Icon name="spark" size={22} /></span></div><h2>Add your first supplier quotations</h2><p>Upload two or more files using the panel above, try the sample dataset, or import your own master SKU list.</p><div><button className="button primary" onClick={loadSample} disabled={!!busy}><Icon name="spark" size={17} />Load Sample Dataset</button><button className="button secondary" onClick={() => masterUploader.current?.click()} disabled={!!busy}>Import master CSV</button></div><a href={apiUrl('/master-template')} className="text-button">Download the 30-SKU master template <Icon name="arrow" size={15} /></a></div> : <>
          {tab === 'comparison' && <><div className="table-toolbar"><label className="search-input"><Icon name="search" size={17} /><input placeholder="Search SKU or description…" aria-label="Search SKUs" value={query} onChange={e => setQuery(e.target.value)} /></label><div className="toolbar-filters"><select aria-label="Filter by factory" value={factory} onChange={e => setFactory(e.target.value)}><option value="all">All factories</option>{factories.map(f => <option key={f}>{f}</option>)}</select><label className="qa-filter"><input type="checkbox" checked={qaFilter} onChange={e => setQaFilter(e.target.checked)} />QA-approved only</label></div></div>
            <div className="comparison-explainer"><Icon name="check" size={17} /><span><strong>Quoted price</strong> is the original supplier rate. <strong>Landed cost</strong> includes freight and eligible discounts, per box. GST is excluded.</span></div>
            <ComparisonTable rows={rows} vendors={vendors} onReview={setEditing} />
            <div className="table-footer"><span><i className="legend-dot" />Lowest comparable landed price · QA shown separately</span><span>{rows.length} of {data.stats.sku_count} items · {data.stats.matched_item_count} matched across suppliers · Fixed freight allocated across this full basket; actual award freight recalculated</span></div></>}
          {tab === 'suppliers' && <div className="suppliers-view"><div className="view-intro"><h3>Review each supplier’s quotation</h3><p>Review extracted terms and evidence. Record your own QA decision before awarding.</p></div>{workspace.quotes.length ? workspace.quotes.map((v, i) => <button className="supplier-card" key={v.vendor_id} onClick={() => setEditing(v)}><span className={`vendor-avatar tone-${i % 5}`}>{v.vendor_name.slice(0, 2).toUpperCase()}</span><div><strong>{v.vendor_name}</strong><span>{v.source_file} · {v.line_items.filter(l => l.quoted_price != null).length} quoted SKUs</span><small>{v.notes.join(' ')}</small></div><span className={`qa-badge ${v.qa_passed === true ? 'passed' : v.qa_passed === false ? 'failed' : 'pending'}`}>{v.qa_passed === true ? 'QA passed' : v.qa_passed === false ? 'QA failed' : 'QA pending'}</span><span className={v.commercial_terms_confirmed ? 'confirmed-label' : 'terms-pending'}>{v.commercial_terms_confirmed ? 'Terms confirmed' : 'Review terms'}</span><Icon name="chevron" size={18} /></button>) : <div className="no-results">No supplier quotes yet. Upload your response files above.</div>}</div>}
          {tab === 'master' && <div className="master-view"><div className="master-heading"><div><h3>Check item quantities and weights</h3><p>Maintain buyer specifications for unit conversion and award quantities. These values apply across every supplier.</p></div><div><button className="button secondary" disabled={!!busy} onClick={() => masterUploader.current?.click()}>Import new master</button>{master ? <button className="button primary" disabled={!!busy} onClick={() => saveWorkspace(master)}>Save master</button> : <button className="button secondary" onClick={() => setMaster(structuredClone(workspace))}>Edit specifications</button>}</div></div>
            <div className="table-scroll"><table className="master-table"><thead><tr><th>SKU</th><th>Description</th><th>Factory</th><th>Ply</th><th>Weight kg/box</th><th>Requested boxes</th></tr></thead><tbody>{(master ?? workspace).skus.map((sku, index) => <tr key={sku.sku_id}><td><strong>{sku.sku_id}</strong></td><td>{master ? <input aria-label={`Description ${sku.sku_id}`} value={sku.description} onChange={e => setMaster({ ...master, skus: master.skus.map((s, i) => i === index ? { ...s, description: e.target.value } : s) })} /> : sku.description}</td><td>{sku.factory}</td><td>{sku.ply ?? 'Not stated'}</td><td>{master ? <input aria-label={`Weight ${sku.sku_id}`} type="number" min="0.000001" step="any" value={sku.weight_kg ?? ''} onChange={e => setMaster({ ...master, skus: master.skus.map((s, i) => i === index ? { ...s, weight_kg: e.target.value || null } : s) })} /> : sku.weight_kg ?? 'Missing'}</td><td>{master ? <input aria-label={`Quantity ${sku.sku_id}`} type="number" min="1" step="1" value={sku.quantity ?? ''} onChange={e => setMaster({ ...master, skus: master.skus.map((s, i) => i === index ? { ...s, quantity: e.target.value ? Number(e.target.value) : null } : s) })} /> : number(sku.quantity)}</td></tr>)}</tbody></table></div><div className="master-footer"><a href={apiUrl('/master-template')} className="text-button">Download CSV template</a><button className="text-button" disabled={!!busy} onClick={useMaster}>Start a new comparison with this master <Icon name="arrow" size={16} /></button></div></div>}
          {tab === 'scenarios' && <div className="scenario-view"><div className="view-intro"><h3>Compare award options</h3><p>Use the scenario shortcuts or ask a question below. Totals use confirmed prices, freight, and eligible discounts.</p></div><div className="scenario-shortcuts"><button disabled={!!busy} onClick={() => runScenario('Find the best split award among QA-approved suppliers.', { kind: 'split_award' })}>Best split award <Icon name="arrow" size={15} /></button><button disabled={!!busy} onClick={() => runScenario('Compare QA-approved single-supplier awards.', { kind: 'compare_vendors' })}>Compare single suppliers <Icon name="arrow" size={15} /></button><button disabled={!!busy} onClick={() => runScenario('Split the award between at most two approved suppliers.', { kind: 'split_award', max_suppliers: 2 })}>At most 2 suppliers <Icon name="arrow" size={15} /></button><button disabled={!!busy} onClick={() => runScenario('Double quantities and calculate the best split award.', { kind: 'split_award', quantity_multiplier: '2' })}>Double the quantities <Icon name="arrow" size={15} /></button></div>{!messages.length && recommended && <ScenarioResult result={recommended} />}{messages.map((m, i) => <div className="conversation" key={i}><div className="buyer-question"><span className="avatar small">PB</span>{m.question}</div><ScenarioResult result={m.result} /></div>)}</div>}
          </>}
        </section>
        <section className="assistant-panel"><div className="assistant-heading"><span className="assistant-icon"><Icon name="spark" size={20} /></span><div><h3>Ask about your comparison</h3><p>Compare supplier totals or explore a split award. We calculate the amounts from your reviewed quotes.</p></div><span className="assistant-badge">POWERED BY SARVAM</span></div><form className="chat-form" onSubmit={e => { e.preventDefault(); runScenario(question) }}><input aria-label="Ask a procurement scenario" value={question} onChange={e => setQuestion(e.target.value)} placeholder="What if we split the order between two suppliers who passed QA?" disabled={!workspace || !!busy} /><button aria-label="Calculate scenario" disabled={!workspace || !!busy || !question.trim()}><Icon name="arrow" size={21} /></button></form><div className="assistant-suggestions"><span>Try asking</span>{['Show me the split-award scenario', 'Exclude Apex Containers', 'Compare single-supplier totals'].map(text => <button key={text} disabled={!workspace || !!busy} onClick={() => { setQuestion(text); setTab('scenarios') }}>{text}</button>)}</div></section>
        <footer className="page-footer"><span>Prices in INR · Review original supplier terms before awarding</span><span>{workspace?.is_sample ? 'Illustrative demo · curated extraction' : 'Buyer-reviewed terms · deterministic calculations'}</span></footer>
      </main>
    </div>
    <input ref={retryPicker} type="file" className="hidden-input" aria-label="Select failed quotation to retry" accept=".xlsx,.pdf,.docx,.png,.jpg,.jpeg,.txt" onChange={e => { const file = e.target.files?.[0]; const target = retryTarget.current; if (file && target) upload([file], target); e.target.value = ''; retryTarget.current = null }} />
    <input ref={masterUploader} type="file" className="hidden-input" aria-label="Import master SKU CSV" accept=".csv" onChange={e => { importMaster(e.target.files?.[0]); e.target.value = '' }} />
    {editing && workspace && <QuoteEditor key={editing.vendor_id} quote={editing} masterSkus={workspace.skus} saving={!!busy} error={error} onSave={saveQuote} onClose={() => setEditing(null)} onRemove={() => { if (window.confirm(`Remove ${editing.vendor_name} from this comparison?`)) saveWorkspace({ ...workspace, quotes: workspace.quotes.filter(q => q.vendor_id !== editing.vendor_id) }, true) }} />}
  </div>
}
