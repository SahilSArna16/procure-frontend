import Icon from './Icon'
import type { QueuedUpload } from '../types'

export default function UploadQueue({ files, busy, onRetry }: { files: QueuedUpload[]; busy: boolean; onRetry: (file: QueuedUpload) => void }) {
  if (!files.length) return null
  return <section className="upload-queue" aria-label="Supplier file processing" aria-live="polite">
    <div className="queue-heading"><h3>Supplier files</h3><span>{files.filter(f => f.status === 'completed').length} processed · {files.filter(f => f.status === 'failed').length} failed</span></div>
    {files.map(file => <div key={file.id} className={`queue-file ${file.status}`}>
      <span className="queue-file-icon"><Icon name="file" size={19} /></span>
      <div className="queue-file-description"><strong>{file.name}<span className="file-format">{file.format}</span></strong>
        {file.error ? <p role="alert">{file.error}</p> : file.status === 'completed' ? <p>{file.matched_count ?? 0} matched items · {file.uncertain_count ?? 0} uncertain matches · {file.missing_count ?? 0} missing items</p> : <p>{file.status === 'queued' ? 'Waiting for processing' : 'Reading this file and extracting supplier terms…'}</p>}
      </div>
      <span className={`file-status ${file.status}`}>{file.status === 'processing' ? <span className="spinner" /> : file.status === 'completed' ? <Icon name="check" size={14} /> : file.status === 'failed' ? <Icon name="warning" size={14} /> : null}{file.status === 'completed' ? 'Processed' : file.status === 'processing' ? 'Processing' : file.status === 'failed' ? 'Failed' : 'Queued'}</span>
      {file.status === 'failed' && <button className="button secondary" disabled={busy} onClick={() => onRetry(file)}>{file.file ? 'Retry file' : 'Select file to retry'}</button>}
    </div>)}
  </section>
}
