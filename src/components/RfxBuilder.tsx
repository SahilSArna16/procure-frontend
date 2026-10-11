import { useState } from 'react'
import { api, apiUrl, jsonBody } from '../api'
import type { Comparison, RFx, Workspace } from '../types'
import Icon from './Icon'

export default function RfxBuilder({ workspace, busy, onAccept, onAction, onSave, onRunDemo }: { workspace: Workspace | undefined; busy: boolean; onAccept: (data: Comparison) => void; onAction: (label: string, action: () => Promise<void>) => void; onSave: (workspace: Workspace) => void; onRunDemo: () => void }) {
  const [message, setMessage] = useState('Draft an RFQ for these 30 corrugated packaging items. Use exactly four quality rules: ISO 9001 yes with reviewed certificate evidence; FSC yes with no attachment requirement; dimensionless BF grade at least 24, not kPa, no attachment requirement; lead time no more than 10 days, no attachment requirement. Do not add other qualification gates or a separate certificate-evidence question. Preserve the buyer master. Include the five supplied demo vendors. Payment Net 60 days. Quote base prices excluding GST and disclose tax separately; delivered to buyer factories, supplier freight charges explicitly stated, not assumed buyer-paid. Accept replies in any format.')
  const [explanation, setExplanation] = useState('')
  const [draft, setDraft] = useState<RFx | null>(null)
  const [jsonDraft, setJsonDraft] = useState('')
  const [editError, setEditError] = useState('')
  const active = draft ?? workspace?.rfx
  function generate() {
    onAction('Drafting RFx with Sarvam', async () => {
      let id: string
      if (workspace) id = workspace.id
      else { const fresh = await api<Comparison>('/workspaces/draft', { method: 'POST' }); id = fresh.workspace.id; onAccept(fresh) }
      const result = await api<{ comparison: Comparison; explanation: string }>(`/workspaces/${id}/rfx/draft`, jsonBody({ message }))
      onAccept(result.comparison); setDraft(null); setExplanation(result.explanation)
    })
  }
  return <section className="rfx-builder"><div className="view-intro"><h3>Draft your RFx with an AI co-pilot</h3><p>Describe scope, buyer specifications, qualification criteria and commercial terms. Review the AI draft before preparing vendor invitations.</p></div>
    <label className="block-label">What are you sourcing?<textarea rows={4} value={message} onChange={e => setMessage(e.target.value)} /></label><button className="button primary" disabled={busy || !message.trim()} onClick={generate}><Icon name="spark" size={17} />Generate / revise RFx</button>
    {explanation && <div className="rfx-explanation" role="status">{explanation}</div>}
    {active && workspace && <><div className="rfx-draft"><span className="eyebrow">{active.status === 'issued' ? 'INVITATIONS PREPARED' : 'DRAFT · BUYER REVIEW REQUIRED'}</span><h3>{active.title}</h3><p>{active.scope}</p><div className="rfx-facts"><span>{active.skus.length} items</span><span>{active.questionnaire.length} questionnaire questions</span><span>{active.vendors.length} vendors</span><span>{active.payment_terms}</span></div>
      <h4>Questionnaire · required quality gates and optional context</h4>{active.questionnaire.map(q => <div className="question-summary" key={q.id}><strong>{q.prompt}</strong><small>{q.required_for_qa ? 'Required for QA' : 'Informational'}{q.expected_answer ? ` · Expected: ${q.expected_answer}` : ''}{q.minimum !== null ? ` · Minimum ${q.minimum}` : ''}{q.maximum !== null ? ` · Maximum ${q.maximum}` : ''}{q.requires_attachment ? ' · Supporting document must be reviewed' : ''}</small></div>)}
      {!!active.assumptions.length && <div className="review-note"><Icon name="warning" /><span>{active.assumptions.join(' ')}</span></div>}
      <label className="confirm-terms"><input type="checkbox" checked={active.quality_rules_approved} onChange={e => setDraft({ ...active, quality_rules_approved: e.target.checked })} />I reviewed the specifications, quantities and qualification rules.</label>
      <div className="rfx-actions"><button className="button primary" disabled={busy} onClick={() => { onSave({ ...workspace, rfx: active, skus: active.skus }); setDraft(null) }}>Save buyer-reviewed RFx</button><a className="button secondary" href={apiUrl(`/workspaces/${workspace.id}/rfx/export`)}><Icon name="download" size={16} />Download RFx packet</a><button className="button secondary" disabled={busy || !workspace.rfx?.quality_rules_approved} onClick={() => onAction('Preparing simulated vendor invitations', async () => { onAccept(await api<Comparison>(`/workspaces/${workspace.id}/rfx/distribute`, { method: 'POST' })) })}>Prepare vendor invitations</button></div>
      {workspace.quotes.length > 0 && <button className="button secondary" disabled={busy} onClick={() => onAction('Re-extracting answers for the current questionnaire', async () => { for (const quote of workspace.quotes) onAccept(await api<Comparison>(`/workspaces/${workspace.id}/quotes/${quote.vendor_id}/questionnaire/refresh`, { method: 'POST' })) })}>Refresh supplier questionnaire answers</button>}
      <details className="advanced-rfx"><summary>Edit complete RFx, questions, terms and vendor contacts</summary><p>Review editable JSON before saving. Keep item and question IDs stable after collecting responses.</p><button className="text-button" onClick={() => setJsonDraft(JSON.stringify(active, null, 2))}>Load current draft into editor</button><textarea aria-label="Complete RFx JSON" rows={14} value={jsonDraft} onChange={e => setJsonDraft(e.target.value)} /><button className="button secondary" onClick={() => { try { const next = JSON.parse(jsonDraft) as RFx; if (!Array.isArray(next.skus) || !Array.isArray(next.questionnaire)) throw new Error(); setDraft(next); setEditError('') } catch { setEditError('Enter valid RFx JSON with skus and questionnaire arrays.') } }}>Apply draft edits</button>{editError && <p role="alert">{editError}</p>}</details>
    </div>
    {!!workspace.outbox.length && <div className="outbox-panel"><h3>Vendor outbox <span className="demo-badge">SIMULATED CHANNEL</span></h3><p>No emails were sent. Downloadable invitations include the RFx scope, line items, terms and questionnaire.</p>{workspace.outbox.map(item => <div key={item.id}><span><strong>{item.vendor_name}</strong><small>{item.recipient}</small></span><a href={apiUrl(`/workspaces/${workspace.id}/outbox/${item.id}`)} className="text-button">Download invitation (.eml)</a></div>)}</div>}
    {workspace.demo_mode && <div className="demo-run"><h3>Run the real five-vendor extraction</h3><p>Process Excel, footnote PDF, a 27-item USD Word response, an angled image and an incomplete email through Sarvam. This uses API credits.</p><button className="button primary" disabled={busy || !workspace.rfx?.quality_rules_approved || workspace.quotes.length > 0} onClick={onRunDemo}>Extract all five demo responses</button><a className="text-button" href={apiUrl('/assessment-demo/download')}>Download synthetic inputs and evidence</a></div>}
    </>}
  </section>
}
