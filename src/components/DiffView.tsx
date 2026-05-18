import { diffLines } from 'diff'
import { useProject } from '../store/projectStore'

export function DiffView() {
  const { pendingWrite, setPendingWrite } = useProject()
  if (!pendingWrite) return null

  const diff = diffLines(pendingWrite.before, pendingWrite.after)
  const writeRef = pendingWrite

  async function accept() {
    await window.api.ai.resolveWrite(writeRef.callId, true)
    setPendingWrite(null)
  }
  async function reject() {
    await window.api.ai.resolveWrite(writeRef.callId, false)
    setPendingWrite(null)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
      <div style={{ background: '#0d0d0d', padding: 20, borderRadius: 8, width: '80%', maxHeight: '80vh', overflow: 'auto', color: '#e0e0e0', fontFamily: 'monospace', fontSize: 12 }}>
        <div style={{ marginBottom: 12, color: '#4fc3f7' }}>Изменить: {pendingWrite.path}</div>
        <pre style={{ background: '#000', padding: 12, borderRadius: 4, whiteSpace: 'pre-wrap', margin: 0 }}>
          {diff.map((part, i) => {
            const lines = part.value.split('\n')
            if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
            return (
              <span key={i} style={{
                color: part.added ? '#4ec9b0' : part.removed ? '#f44747' : '#888',
                background: part.added ? 'rgba(78,201,176,0.1)' : part.removed ? 'rgba(244,71,71,0.1)' : 'transparent',
                display: 'block'
              }}>
                {lines.map((line, j) => (
                  <div key={j}>{(part.added ? '+ ' : part.removed ? '- ' : '  ') + line}</div>
                ))}
              </span>
            )
          })}
        </pre>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button onClick={reject} style={{ padding: '6px 16px', background: '#3a1a1a', color: '#f44', border: 'none', borderRadius: 4 }}>✗ Отклонить</button>
          <button onClick={accept} style={{ padding: '6px 16px', background: '#1a3a1a', color: '#4ec9b0', border: 'none', borderRadius: 4 }}>✓ Принять</button>
        </div>
      </div>
    </div>
  )
}
