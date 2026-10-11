import { useRef, useState } from 'react'
import { api, apiUrl } from '../api'
import type { Comparison, Qualification, QuestionnaireAnswer, Workspace } from '../types'
import Icon from './Icon'

export default function QualityPanel({ workspace, quality, busy, onSave, onAccept, onAction }: { workspace: Workspace; quality: Record<string, Qualification>; busy: boolean; onSave: (workspace: Workspace) => void; onAccept: (comparison: Comparison) => void; onAction: (label: string, action: () => Promise<void>) => void }) {
  const [links, setLinks] = useState<Record<string, string[]>>({})
  const [reviews, setReviews] = useState<Record<string, boolean>>({})
  const [answers, setAnswers] = useState<Record<string, QuestionnaireAnswer[]>>({})
  const [evidenceTarget, setEvidenceTarget] = useState<{ vendorId: string; questionId: string } | null>(null)
  const picker = useRef<HTMLInputElement>(null)
  if (!workspace.rfx) return <div className="no-results">Draft an RFx to define the buyer's quality questionnaire. Existing manual QA decisions remain available in quote review.</div>
  const rfx = workspace.rfx
  return <section className="quality-panel"><div className="view-intro"><h3>Questionnaire answers and supporting evidence</h3><p>QA follows your approved rules. Missing answers or unreviewed required documents remain pending; failed criteria are explicit.</p></div>
    {!rfx.quality_rules_approved && <div className="review-note"><Icon name="warning" /><span>Approve the qualification rules in RFx & vendors before using the assessment.</span></div>}
    {!workspace.quotes.length && <div className="no-results">Upload supplier responses to see their sourced answers.</div>}
    {workspace.quotes.map(quote => {
      const assessment = quality[quote.vendor_id]
      const current = answers[quote.vendor_id] ?? quote.questionnaire_answers
      return <article className="quality-vendor" key={quote.vendor_id}><div className="quality-vendor-heading"><h3>{quote.vendor_name}</h3><span className={`qa-badge ${assessment?.status ?? 'pending'}`}>QA {assessment?.status ?? 'pending'}</span></div><p>{assessment?.basis}</p>
        {rfx.questionnaire.map(question => {
          const answer = current.find(a => a.question_id === question.id)
          const check = assessment?.checks.find(c => c.question_id === question.id)
          return <div className="quality-question" key={question.id}><label>{question.prompt}<input aria-label={`${quote.vendor_name} ${question.id} answer`} placeholder="Not provided" value={answer?.answer ?? ''} onChange={e => {
            const next = { question_id: question.id, answer: e.target.value || null, source_reference: answer?.source_reference ?? '', needs_review: false }
            setAnswers(previous => ({ ...previous, [quote.vendor_id]: [...current.filter(a => a.question_id !== question.id), next] }))
          }} /></label><label className="evidence-citation">Source citation / buyer verification<textarea rows={2} value={answer?.source_reference ?? ''} placeholder="Cite the source file/page or record your verification evidence" onChange={e => setAnswers(previous => ({ ...previous, [quote.vendor_id]: [...current.filter(a => a.question_id !== question.id), { question_id: question.id, answer: answer?.answer ?? null, source_reference: e.target.value, needs_review: false }] }))} /></label><small className={`quality-check ${check?.status ?? 'pending'}`}>{check?.status ?? 'pending'} · {check?.reason ?? 'Not yet assessed'}</small>
          {question.requires_attachment && <button className="text-button" disabled={busy} onClick={() => { setEvidenceTarget({ vendorId: quote.vendor_id, questionId: question.id }); picker.current?.click() }}>Attach supporting document</button>}</div>
        })}
        <div className="vendor-documents"><h4>Attached originals and evidence</h4>{workspace.documents.filter(d => d.vendor_id === quote.vendor_id).map(document => <div key={document.id}><a href={apiUrl(`/workspaces/${workspace.id}/documents/${document.id}`)}><Icon name="download" size={15} />{document.name}</a><span>{document.role}</span>{document.role === 'supporting' && <div className="evidence-review-control"><select aria-label={`Evidence question for ${document.name}`} value={(links[document.id] ?? document.question_ids)[0] ?? ''} onChange={e => { setLinks(previous => ({ ...previous, [document.id]: e.target.value ? [e.target.value] : [] })); setReviews(previous => ({ ...previous, [document.id]: false })) }}><option value="">Link to a question…</option>{rfx.questionnaire.map(q => <option key={q.id} value={q.id}>{q.prompt}</option>)}</select><label><input type="checkbox" checked={reviews[document.id] ?? document.reviewed} disabled={busy} onChange={e => setReviews(previous => ({ ...previous, [document.id]: e.target.checked }))} />Buyer reviewed evidence</label></div>}</div>)}</div>
        <button className="button secondary" disabled={busy || !answers[quote.vendor_id]} onClick={() => { onSave({ ...workspace, quotes: workspace.quotes.map(q => q.vendor_id === quote.vendor_id ? { ...q, questionnaire_answers: current } : q) }); setAnswers(previous => { const next = { ...previous }; delete next[quote.vendor_id]; return next }) }}>Save questionnaire review</button>
      </article>
    })}
    <button className="button primary" disabled={busy || (!Object.keys(reviews).length && !Object.keys(links).length)} onClick={() => onAction('Saving evidence review decisions', async () => { onAccept(await api<Comparison>(`/workspaces/${workspace.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...workspace, documents: workspace.documents.map(d => ({ ...d, reviewed: reviews[d.id] ?? d.reviewed, question_ids: links[d.id] ?? d.question_ids })) }) })); setReviews({}); setLinks({}) })}>Save evidence reviews</button>
    <input ref={picker} type="file" className="hidden-input" accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.txt" aria-label="Upload quality evidence" onChange={e => {
      const file = e.target.files?.[0]; const target = evidenceTarget
      if (file && target) onAction('Reading supporting evidence', async () => { const form = new FormData(); form.append('file', file); form.append('vendor_id', target.vendorId); form.append('question_ids', JSON.stringify([target.questionId])); onAccept(await api<Comparison>(`/workspaces/${workspace.id}/supporting-documents`, { method: 'POST', body: form })) })
      e.target.value = ''
    }} />
  </section>
}
