import { useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Markdown } from './Markdown'

interface FilePreviewPanelProps {
  path: string | null
  width: number
  onResizeStart: (e: ReactMouseEvent<HTMLDivElement>) => void
  onClose: () => void
}

type PreviewMode = 'text' | 'markdown' | 'html' | 'unsupported'
type ResolvedPreviewPath = {
  path: string
  displayPath: string
  source: 'project' | 'skill' | 'known-root' | 'absolute'
}
type LargePreviewState = {
  path: string
  size: number
  nextOffset: number
  loadedBytes: number
  done: boolean
}

const PREVIEW_CHUNK_BYTES = 2 * 1024 * 1024

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path
}

function extension(path: string): string {
  const name = basename(path).toLowerCase()
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot) : ''
}

function isTextPreviewExt(ext: string): boolean {
  return [
    '.txt', '.log', '.json', '.js', '.jsx', '.ts', '.tsx', '.css', '.scss',
    '.html', '.htm', '.md', '.csv', '.yml', '.yaml', '.xml', '.sql', '.py',
    '.sh', '.ps1', '.bat', '.env', '.gitignore'
  ].includes(ext)
}

function htmlDocument(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin: 0; padding: 22px; font: 14px/1.55 system-ui, -apple-system, Segoe UI, sans-serif; color: #d8dee9; background: #252b36; }
    table { border-collapse: collapse; max-width: 100%; }
    th, td { border: 1px solid rgba(180, 210, 225, .18); padding: 6px 8px; }
    pre { white-space: pre-wrap; word-break: break-word; }
  </style></head><body>${body}</body></html>`
}

function friendlyPreviewError(err: unknown, requestedPath: string): string {
  const message = err instanceof Error ? err.message : String(err)
  if (/ENOENT|no such file or directory/i.test(message)) {
    return [
      'Файл не найден',
      `Путь из сообщения: ${requestedPath}`,
      'Verstak проверил текущий проект и доступные папки скиллов. Возможно, файл был удалён, переименован или путь в ответе модели неполный'
    ].join('\n')
  }
  return message
}

function isTooLargeReadError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /Файл слишком большой для чтения/i.test(message)
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${bytes} Б`
}

export function FilePreviewPanel({ path, width, onResizeStart, onClose }: FilePreviewPanelProps) {
  const [mode, setMode] = useState<PreviewMode>('unsupported')
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [chunkLoading, setChunkLoading] = useState(false)
  const [largePreview, setLargePreview] = useState<LargePreviewState | null>(null)
  const [resolved, setResolved] = useState<ResolvedPreviewPath | null>(null)
  const fileName = basename(resolved?.path ?? path ?? 'Файл')
  const shownPath = resolved?.displayPath ?? path ?? ''

  useEffect(() => {
    let cancelled = false
    setContent('')
    setError(null)
    setResolved(null)
    setLargePreview(null)
    setChunkLoading(false)
    if (!path) return

    setLoading(true)
    void (async () => {
      try {
        const resolvedResult = await window.api.files.resolvePreviewPath(path)
        if (!resolvedResult.ok) {
          const searched = resolvedResult.searched.length
            ? `\n\nГде искал:\n${resolvedResult.searched.map(item => `- ${item}`).join('\n')}`
            : ''
          throw new Error(`${resolvedResult.error}\nПуть из сообщения: ${resolvedResult.requestedPath}${searched}`)
        }
        if (cancelled) return

        setResolved(resolvedResult)
        const actualPath = resolvedResult.path
        const ext = extension(actualPath)

        async function readPreviewText(nextMode: PreviewMode) {
          try {
            const text = await window.api.files.read(actualPath)
            if (!cancelled) {
              setMode(nextMode)
              setContent(text)
              setLargePreview(null)
            }
          } catch (err) {
            if (!isTooLargeReadError(err)) throw err
            const chunk = await window.api.files.readChunk(actualPath, 0, PREVIEW_CHUNK_BYTES)
            if (!cancelled) {
              setMode('text')
              setContent(chunk.content)
              setLargePreview({
                path: actualPath,
                size: chunk.size,
                nextOffset: chunk.nextOffset,
                loadedBytes: chunk.bytesRead,
                done: chunk.done
              })
            }
          }
        }

        if (ext === '.xlsx') {
          const res = await window.api.files.xlsxToMarkdown(actualPath)
          if (!res.ok) throw new Error(res.error)
          if (!cancelled) {
            setMode('markdown')
            setContent(res.markdown)
          }
          return
        }

        if (ext === '.docx') {
          const res = await window.api.files.docxToHtml(actualPath)
          if (!res.ok) throw new Error(res.error)
          if (!cancelled) {
            setMode('html')
            setContent(htmlDocument(res.html))
          }
          return
        }

        if (ext === '.html' || ext === '.htm') {
          await readPreviewText('html')
          return
        }

        if (ext === '.md') {
          await readPreviewText('markdown')
          return
        }

        if (isTextPreviewExt(ext)) {
          await readPreviewText('text')
          return
        }

        if (!cancelled) {
          setMode('unsupported')
          setContent('')
          setLargePreview(null)
        }
      } catch (err) {
        if (!cancelled) {
          setMode('unsupported')
          setError(friendlyPreviewError(err, path))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [path])

  function reveal() {
    if (resolved?.path) void window.api.files.revealInExplorer(resolved.path)
  }

  async function loadMore() {
    if (!largePreview || largePreview.done || chunkLoading) return
    setChunkLoading(true)
    try {
      const chunk = await window.api.files.readChunk(largePreview.path, largePreview.nextOffset, PREVIEW_CHUNK_BYTES)
      setContent(prev => prev + chunk.content)
      setLargePreview(prev => prev
        ? {
            ...prev,
            size: chunk.size,
            nextOffset: chunk.nextOffset,
            loadedBytes: prev.loadedBytes + chunk.bytesRead,
            done: chunk.done
          }
        : null)
    } catch (err) {
      setError(friendlyPreviewError(err, largePreview.path))
    } finally {
      setChunkLoading(false)
    }
  }

  return (
    <aside className="gg-file-preview" style={{ width }}>
      <div
        className="gg-sidechat-resizer"
        onMouseDown={onResizeStart}
        role="separator"
        aria-orientation="vertical"
        title="Изменить ширину просмотра файла"
      />
      <div className="gg-file-preview-header">
        <div className="gg-file-preview-title">
          <span className="gg-file-preview-icon" aria-hidden>▣</span>
          <span>{fileName}</span>
        </div>
        <button className="gg-sidechat-close" onClick={onClose} title="Закрыть">×</button>
      </div>
      {path && (
        <div className="gg-file-preview-path" title={resolved?.path ?? path}>
          {shownPath}
        </div>
      )}
      {resolved && resolved.path !== path && (
        <div className="gg-file-preview-resolved-path" title={resolved.path}>
          Открыт файл: {resolved.path}
        </div>
      )}
      <div className="gg-file-preview-actions">
        <button
          type="button"
          className="gg-terminal-bar-btn"
          onClick={reveal}
          disabled={!resolved}
        >
          Показать в проводнике
        </button>
      </div>
      <div className="gg-file-preview-body">
        {loading && <div className="gg-file-preview-state">Загружаю файл...</div>}
        {!loading && error && <div className="gg-file-preview-state is-error">{error}</div>}
        {!loading && !error && largePreview && (
          <div className="gg-file-preview-large-note">
            <span>Файл большой: {formatBytes(largePreview.size)}. Загружено {formatBytes(largePreview.loadedBytes)}</span>
            {!largePreview.done && (
              <button className="gg-terminal-bar-btn" type="button" onClick={() => void loadMore()} disabled={chunkLoading}>
                {chunkLoading ? 'Загружаю...' : 'Загрузить ещё'}
              </button>
            )}
          </div>
        )}
        {!loading && !error && mode === 'unsupported' && (
          <div className="gg-file-preview-state">
            Для этого формата пока нет встроенного предпросмотра. Файл можно открыть через проводник
          </div>
        )}
        {!loading && !error && mode === 'text' && <pre className="gg-file-preview-pre">{content}</pre>}
        {!loading && !error && mode === 'markdown' && (
          <div className="gg-file-preview-markdown"><Markdown text={content} /></div>
        )}
        {!loading && !error && mode === 'html' && (
          <iframe className="gg-file-preview-iframe" srcDoc={content} sandbox="allow-same-origin" title={fileName} />
        )}
        {!loading && !error && largePreview && largePreview.done && (
          <div className="gg-file-preview-large-done">Файл загружен полностью</div>
        )}
      </div>
    </aside>
  )
}
