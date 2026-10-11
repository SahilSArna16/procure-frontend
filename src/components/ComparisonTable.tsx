import Icon from './Icon'
import type { ComparisonRow, Quote } from '../types'

const formatMoney = (value: string | null, currency = 'INR') => {
  if (value === null) return '—'
  try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value)) }
  catch { return `${value} ${currency}` }
}
const units: Record<string, string> = { per_box: 'per box', per_kg: 'per kg', per_1000_boxes: 'per 1,000 boxes', unknown: 'Unit needs review' }

export default function ComparisonTable({ rows, vendors, onReview }: { rows: ComparisonRow[]; vendors: Quote[]; onReview: (quote: Quote) => void }) {
  return <div className="table-scroll comparison-scroll"><table className="comparison-table landed-comparison" style={{ minWidth: 420 + vendors.length * 340 }}>
    <colgroup><col style={{ width: 300 }} /><col style={{ width: 120 }} />{vendors.flatMap(v => [<col key={`${v.vendor_id}-quoted`} style={{ width: 160 }} />, <col key={`${v.vendor_id}-landed`} style={{ width: 180 }} />])}</colgroup>
    <thead><tr><th rowSpan={2} className="sku-column" scope="col">Item / specification</th><th rowSpan={2} scope="col">Order quantity</th>{vendors.map((vendor, index) => <th key={vendor.vendor_id} colSpan={2} scope="colgroup"><button className="supplier-header" onClick={() => onReview(vendor)} title={`Review ${vendor.vendor_name} · ${vendor.source_file}`}>
      <span className="supplier-title"><span className={`vendor-avatar tone-${index % 5}`}>{vendor.vendor_name.split(' ').map(s => s[0]).slice(0, 2).join('')}</span><strong>{vendor.vendor_name}</strong><Icon name="sliders" size={15} /></span>
      <span className="supplier-meta"><span className={/^Net 60(?: days)?$/i.test(vendor.payment_terms) ? '' : 'nonstandard'}>{vendor.payment_terms}</span><span className={`qa-badge ${vendor.qa_passed === true ? 'passed' : vendor.qa_passed === false ? 'failed' : 'pending'}`}>{vendor.qa_passed === true ? 'QA passed' : vendor.qa_passed === false ? 'QA failed' : 'QA pending'}</span></span>
      <small className="supplier-file">{vendor.source_file}</small><small className={vendor.commercial_terms_confirmed ? 'confirmed-label' : 'terms-pending'}>{vendor.commercial_terms_confirmed ? 'Terms confirmed' : 'Review terms before awarding'}</small>
    </button></th>)}</tr><tr className="price-subheaders">{vendors.flatMap(vendor => [<th key={`${vendor.vendor_id}-quoted`} scope="col">Quoted price</th>, <th key={`${vendor.vendor_id}-landed`} scope="col">Landed cost / box</th>])}</tr></thead>
    <tbody>{rows.map(row => <tr key={row.sku_id}><td className="sku-column"><strong>{row.sku_id}</strong><span>{row.description}</span><small>{row.factory}{row.weight_kg ? ` · ${row.weight_kg} kg/box` : ''}</small></td><td className="qty-cell">{row.quantity === null ? 'Confirm quantity' : new Intl.NumberFormat('en-IN').format(row.quantity)}<small>boxes</small></td>{vendors.flatMap(vendor => {
      const cell = row.prices[vendor.vendor_id]
      const lowest = row.lowest_vendor_ids.includes(vendor.vendor_id)
      const missing = cell.match_status === 'missing'
      const evidence = [`Source: ${cell.source_file}`, cell.source_reference, cell.notes, cell.issue, cell.rebate.reason].filter(Boolean).join('\n')
      return [<td key={`${vendor.vendor_id}-quoted`}><button className="price-cell quoted-cell" onClick={() => onReview(vendor)} title={evidence}><strong>{missing ? <span className="missing-rate">Not quoted</span> : formatMoney(cell.quoted_price, cell.currency)}</strong><small>{units[cell.price_unit ?? 'unknown'] ?? cell.price_unit}</small>{cell.quoted_quantity && Number(cell.quoted_quantity) !== row.quantity && <small>Supplier quantity: {new Intl.NumberFormat('en-IN').format(Number(cell.quoted_quantity))}</small>}{cell.match_status !== 'sku' && cell.match_status !== 'confirmed' && !missing && <span className="terms-pending">Confirm item match</span>}</button></td>,
        <td key={`${vendor.vendor_id}-landed`} className={lowest ? 'best-price' : ''}><button className="price-cell" onClick={() => onReview(vendor)} title={evidence}><strong>{cell.landed_price_per_box === null ? <span className="missing-rate">{missing ? 'Not quoted' : 'Needs review'}</span> : formatMoney(cell.landed_price_per_box)}{lowest && <Icon name="check" size={15} />}</strong><small>{cell.issue ?? 'Freight included'}</small>{cell.rebate.status !== 'none' && <span className={cell.rebate.applied ? 'rebate-label' : 'terms-pending'}>{cell.rebate.applied ? `${cell.rebate.percent}% rebate applied` : 'Rebate not applied'}</span>}</button></td>]
    })}</tr>)}</tbody>
  </table>{!rows.length && <div className="no-results">No items match your search. Try another SKU or clear the filters.</div>}{!vendors.length && <div className="no-results">Upload supplier quotations or turn off the QA filter to see available quotes.</div>}</div>
}
