import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { semverGt } from '../lib/semver'
import { ReleaseNotesModal, type ReleaseNote } from './ReleaseNotesModal'

const LAST_WHATS_NEW_KEY = 'last_whats_new_version'

/**
 * После установки обновления: показывает список нововведений из GitHub Release.
 */
export function WhatsNewModal() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState<ReleaseNote[]>([])
  const [version, setVersion] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        if (!window.api?.updater?.getReleaseNotes) return

        const current = await window.api.app.getVersion()
        const last = await window.api.settings.getKey(LAST_WHATS_NEW_KEY)

        if (!last) {
          await window.api.settings.setKey(LAST_WHATS_NEW_KEY, current)
          return
        }

        if (!semverGt(current, last)) return

        const fetched = await window.api.updater.getReleaseNotes({
          sinceVersion: last,
          upToVersion: current,
        })

        if (fetched.length === 0) {
          await window.api.settings.setKey(LAST_WHATS_NEW_KEY, current)
          return
        }

        setNotes(fetched)
        setVersion(current)
        setOpen(true)
      } catch (err) {
        console.warn('[whats-new] skipped:', err)
      }
    })()
  }, [])

  const handleClose = () => {
    setOpen(false)
    void (async () => {
      const current = version || await window.api.app.getVersion()
      await window.api.settings.setKey(LAST_WHATS_NEW_KEY, current)
    })()
  }

  return (
    <ReleaseNotesModal
      open={open}
      onClose={handleClose}
      notes={notes}
      title={t.updates.whatsNewTitle}
      subtitle={t.updates.whatsNewSubtitle.replace('{version}', version)}
      emptyText={t.settings.releaseNotesEmpty}
    />
  )
}