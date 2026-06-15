import { useProject } from '../store/projectStore'

/**
 * Артефакт-pills в Timeline — каждый сгенерированный HTML/DOCX появляется
 * как кликабельная пилюля. Клик → открывается в дефолтном приложении
 * системы через electron.shell.openPath (HTML → браузер, DOCX → Word).
 *
 * Источник: V3 Plan раздел 8. V1 — без embedded preview pane.
 * Embedded preview (mammoth.js для DOCX, webview для HTML) — V3.1.
 */

export function ArtifactsPanel() {
  const artifacts = useProject(s => s.artifacts)
  const setPreviewArtifact = useProject(s => s.setPreviewArtifact)
  if (artifacts.length === 0) return null

  return (
    <>
      {artifacts.map((a, i) => {
        // Verification-артефакт (DoD) — отдельный pill с цветным бейджем overall
        // и счётчиком пройденных проверок N/M. Клик открывает .verification.html.
        if (a.kind === 'verification') {
          const overall = a.overall ?? 'not_run'
          const mark = overall === 'passed' ? '✅' : overall === 'failed' ? '✗' : overall === 'partial' ? '⚠' : '◷'
          const dod = a.checksTotal != null ? `DoD: ${a.checksPassed ?? 0}/${a.checksTotal}` : 'DoD'
          return (
            <span
              key={`${a.path}-${i}`}
              className={`gg-timeline-pill gg-artifact-pill gg-verification-pill is-${overall}`}
              onClick={() => setPreviewArtifact(a.path)}
              title={`Доказательство выполнения (${overall})\nКлик — открыть отчёт в preview pane\nПуть: ${a.path}`}
            >
              <span className="gg-timeline-pill-icon">{mark}</span>
              <span className="gg-timeline-pill-detail">{dod}</span>
            </span>
          )
        }
        return (
          <span
            key={`${a.path}-${i}`}
            className={`gg-timeline-pill gg-artifact-pill is-${a.kind}`}
            onClick={() => setPreviewArtifact(a.path)}
            title={`Открыть ${a.filename} в preview pane\nКнопка ↗ внутри откроет в дефолтном приложении\nПуть: ${a.path}`}
          >
            <span className="gg-timeline-pill-icon">📄</span>
            <span className="gg-timeline-pill-detail">
              {a.kind.toUpperCase()}: {a.filename} · {(a.sizeBytes / 1024).toFixed(1)}KB
            </span>
          </span>
        )
      })}
    </>
  )
}
