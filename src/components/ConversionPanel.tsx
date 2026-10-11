import { useState } from 'react'
import type { Workspace } from '../types'

export default function ConversionPanel({ workspace, busy, onSave }: { workspace: Workspace; busy: boolean; onSave: (workspace: Workspace) => void }) {
  const [rates, setRates] = useState(() => structuredClone(workspace.fx_rates))
  const currencies = [...new Set(workspace.quotes.flatMap(q => [q.currency, ...q.line_items.map(l => l.currency ?? q.currency)]).filter(c => c !== 'INR'))]
  const all = [...new Set([...currencies, ...rates.map(r => r.currency)])]
  if (!all.length) return null
  return <section className="conversion-panel"><h3>Buyer-approved currency conversion</h3><p>Rates are supplied by the buyer, not fetched or guessed. Unconfirmed rates exclude affected landed prices and awards.</p>{all.map(currency => {
    const rate = rates.find(r => r.currency === currency) ?? { currency, inr_per_unit: '', source: '', confirmed: false }
    const update = (changes: Partial<typeof rate>) => setRates(previous => [...previous.filter(r => r.currency !== currency), { ...rate, ...changes }])
    return <div className="conversion-row" key={currency}><strong>{currency} → INR</strong><label>INR per 1 {currency}<input type="number" min="0.000001" step="any" value={rate.inr_per_unit} onChange={e => update({ inr_per_unit: e.target.value })} /></label><label>Source / date / assumption<input value={rate.source} onChange={e => update({ source: e.target.value })} /></label><label className="qa-filter"><input type="checkbox" checked={rate.confirmed} onChange={e => update({ confirmed: e.target.checked })} />I approve this rate</label></div>
  })}<button className="button secondary" disabled={busy || !rates.length || rates.some(r => !r.inr_per_unit || !r.source.trim())} onClick={() => onSave({ ...workspace, fx_rates: rates })}>Save conversion & recalculate</button></section>
}
