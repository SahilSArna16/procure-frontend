import type { Scenario } from '../types'

export default function ScenarioChart({ result }: { result: Scenario }) {
  const rows = result.awards.length ? result.awards.map(a => ({ name: a.vendor_name, amount: a.total })) : (result.vendors ?? []).filter(v => v.total !== null).map(v => ({ name: v.vendor_name, amount: v.total! }))
  const maximum = Math.max(0, ...rows.map(r => Number(r.amount)))
  if (!rows.length) return null
  return <figure className="scenario-chart" aria-label="Computed supplier costs"><figcaption>{result.awards.length ? 'Award value by supplier' : 'Complete-order landed cost by supplier'}</figcaption>{rows.map(row => <div key={row.name}><span>{row.name}</span><div className="chart-track"><span style={{ width: `${maximum ? Number(row.amount) / maximum * 100 : 0}%` }} /></div><strong>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(row.amount))}</strong></div>)}<small>Chart values come from the deterministic calculation table.</small></figure>
}
