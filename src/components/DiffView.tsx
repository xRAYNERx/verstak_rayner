import { diffLines } from 'diff'
import { useProject } from '../store/projectStore'

export function DiffView() {
  const { pendingWrite, setPendingWrite } = useProject()
  if (!pendingWrite) return null

  const diff = diffLines(pendingWrite.before, pendingWrite.after)
  const writeRef = pendingWrite

  let added = 0, removed = 0
  for (const p of diff) {
    const lines = p.value.split('\n').filter((_, i, arr) => !(i === arr.length - 1 && arr[i] === '')).length
    if (p.added) added += lines
    else if (p.removed) removed += lines
  }

  async function accept() {
    await window.api.ai.resolveWrite(writeRef.callId, true)
    setPendingWrite(null)
  }
  async function reject() {
    await window.api.ai.resolveWrite(writeRef.callId, false)
    setPendingWrite(null)
  }

  return (
    <div className="gg-modal-backdrop" onClick={reject}>
      <div className="gg-modal gg-modal-large" onClick={e => e.stopPropagation()}>
        <div className="gg-modal-header">
          <div>
            <div className="gg-modal-title">Изменение файла</div>
            <div className="gg-diff-path" style={{ marginTop: 4 }}>{pendingWrite.path}</div>
          </div>
          <div className="gg-text-tertiary" style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)' }}>
            <span style={{ color: 'var(--diff-add)' }}>+{added}</span>{' '}
            <span style={{ color: 'var(--diff-remove)' }}>−{removed}</span>
          </div>
        </div>

        <div className="gg-modal-body" style={{ padding: '16px 22px' }}>
          <div className="gg-diff-body">
            {diff.map((part, i) => {
              const lines = part.value.split('\n')
              if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
              const cls = part.added ? 'gg-diff-line-add' : part.removed ? 'gg-diff-line-remove' : 'gg-diff-line-context'
              const prefix = part.added ? '+ ' : part.removed ? '− ' : '  '
              return lines.map((line, j) => (
                <div key={`${i}-${j}`} className={`gg-diff-line ${cls}`}>{prefix + line}</div>
              ))
            })}
          </div>
        </div>

        <div className="gg-modal-footer">
          <button className="gg-btn gg-btn-danger" onClick={reject}>Отклонить</button>
          <button className="gg-btn gg-btn-success" onClick={accept}>Принять</button>
        </div>
      </div>
    </div>
  )
}
