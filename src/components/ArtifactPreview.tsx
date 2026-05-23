import { useEffect, useState } from 'react'
import { useProject } from '../store/projectStore'

/**
 * Embedded preview pane для артефактов. Открывается из ArtifactsPanel —
 * клик по pill открывает не в браузере, а здесь, прямо в окне.
 *
 * Источник: V3 Plan раздел 8.2.
 *
 * Поддержка:
 *  - HTML — рендерится в iframe srcDoc (без сети, без скриптов снаружи).
 *  - DOCX — конвертация в HTML через mammoth не реализована, fallback к
 *    «открыть в Word» через electron.shell.openPath.
 *  - PDF — то же что DOCX (нет внутреннего pdf.js renderer).
 *
 * UI: модальное окно с заголовком, телом-iframe, действиями
 * (открыть внешне / скачать копию / закрыть).
 */

interface ArtifactRef {
  kind: 'html' | 'docx'
  filename: string
  path: string
  sizeBytes: number
}

interface Props {
  artifact: ArtifactRef | null
  onClose: () => void
}

export function ArtifactPreview({ artifact, onClose }: Props) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!artifact) { setContent(null); setError(null); return }
    if (artifact.kind !== 'html') return  // DOCX/PDF — кнопка «открыть внешне», content не нужен

    setLoading(true)
    setError(null)
    void (async () => {
      try {
        // Используем существующий files.read — он применяет secret-scanner
        // (избыточно для нашего же артефакта, но безопасно).
        const html = await window.api.files.read(artifact.path)
        setContent(html)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    })()
  }, [artifact])

  if (!artifact) return null

  function openExternal() {
    void window.api.files.revealInExplorer(artifact!.path)
  }

  return (
    <div className="gg-artifact-preview-overlay" onClick={onClose}>
      <div className="gg-artifact-preview-modal" onClick={e => e.stopPropagation()}>
        <div className="gg-artifact-preview-header">
          <span className="gg-artifact-preview-title">
            📄 {artifact.filename}
            <span className="gg-artifact-preview-meta">
              {artifact.kind.toUpperCase()} · {(artifact.sizeBytes / 1024).toFixed(1)} KB
            </span>
          </span>
          <div className="gg-artifact-preview-actions">
            <button
              type="button"
              className="gg-btn gg-btn-ghost"
              onClick={openExternal}
              title="Открыть в дефолтном приложении системы"
            >↗ Открыть внешне</button>
            <button type="button" className="gg-btn gg-btn-ghost" onClick={onClose}>Закрыть</button>
          </div>
        </div>

        <div className="gg-artifact-preview-body">
          {artifact.kind === 'html' && (
            <>
              {loading && <div className="gg-artifact-preview-state">Загрузка…</div>}
              {error && <div className="gg-artifact-preview-state is-error">⚠ {error}</div>}
              {content && (
                <iframe
                  className="gg-artifact-preview-iframe"
                  srcDoc={content}
                  sandbox="allow-same-origin"  // без allow-scripts: безопасный preview
                  title={artifact.filename}
                />
              )}
            </>
          )}
          {artifact.kind === 'docx' && (
            <div className="gg-artifact-preview-state">
              <p>DOCX inline preview пока не поддерживается.</p>
              <p>Нажми <strong>«Открыть внешне»</strong> — откроется в Word / LibreOffice.</p>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                В будущем добавим конвертацию через mammoth.js → HTML preview.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Wrapper-хелпер: открыть preview из ArtifactsPanel.
 * Использует state в projectStore чтобы pills могли передать выбранный
 * артефакт без props drilling.
 */
export function ArtifactPreviewContainer() {
  const previewArtifactId = useProject(s => s.previewArtifactId)
  const artifacts = useProject(s => s.artifacts)
  const setPreviewArtifact = useProject(s => s.setPreviewArtifact)

  const artifact = previewArtifactId != null
    ? artifacts.find(a => a.path === previewArtifactId) ?? null
    : null

  return <ArtifactPreview artifact={artifact} onClose={() => setPreviewArtifact(null)} />
}
