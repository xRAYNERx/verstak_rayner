import { Markdown } from './Markdown'
import { useT } from '../i18n'

export type ReleaseNote = {
  version: string
  name: string
  body: string
  htmlUrl: string
}

interface Props {
  open: boolean
  onClose: () => void
  notes: ReleaseNote[]
  title: string
  subtitle?: string
  emptyText: string
}

export function ReleaseNotesModal({ open, onClose, notes, title, subtitle, emptyText }: Props) {
  const t = useT()

  if (!open) return null

  const primaryUrl = notes.length === 1 ? notes[0].htmlUrl : 'https://github.com/frolofpavel/verstak/releases'

  return (
    <div className="gg-modal-backdrop" role="dialog" aria-modal="true">
      <div className="gg-modal gg-modal-large gg-release-notes-modal" onClick={e => e.stopPropagation()}>
        <div className="gg-modal-header">
          <div>
            <div className="gg-modal-title">{title}</div>
            {subtitle && <div className="gg-release-notes-subtitle">{subtitle}</div>}
          </div>
          <button
            type="button"
            className="gg-modal-close"
            onClick={onClose}
            aria-label={t.updates.releaseNotesClose}
          >
            ×
          </button>
        </div>
        <div className="gg-modal-body gg-release-notes-body">
          {notes.length === 0 ? (
            <p className="gg-models-required-text">{emptyText}</p>
          ) : (
            notes.map(note => (
              <section key={note.version} className="gg-release-notes-section">
                {notes.length > 1 && (
                  <h3 className="gg-release-notes-version">
                    {note.name}
                    <span className="gg-release-notes-tag">v{note.version}</span>
                  </h3>
                )}
                <Markdown text={note.body} />
              </section>
            ))
          )}
        </div>
        <div className="gg-modal-footer">
          <button
            type="button"
            className="gg-btn gg-btn-ghost"
            onClick={() => void window.api.app.openExternal(primaryUrl)}
          >
            {t.updates.openReleasePage}
          </button>
          <button type="button" className="gg-btn gg-btn-primary" onClick={onClose}>
            {t.updates.releaseNotesClose}
          </button>
        </div>
      </div>
    </div>
  )
}