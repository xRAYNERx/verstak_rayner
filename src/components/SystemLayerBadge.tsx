import { useEffect, useState } from 'react'
import { useProject } from '../store/projectStore'

interface State {
  version: string
  userPath: string | null
  userBytes: number
}

interface Props {
  onOpenViewer: () => void
}

/**
 * Compact status row shown above the chat: confirms the immutable system
 * layer is active and shows whether the current project has its own
 * user layer (AGENTS.md / CLAUDE.md / GEMINI.md / .geminigrok/RULES.md).
 */
export function SystemLayerBadge({ onOpenViewer }: Props) {
  const { path } = useProject()
  const [state, setState] = useState<State | null>(null)

  useEffect(() => {
    void (async () => {
      const sys = await window.api.systemLayer.get()
      const user = await window.api.systemLayer.user(path)
      setState({
        version: sys.version,
        userPath: user.path,
        userBytes: user.content.trim().length
      })
    })()
  }, [path])

  if (!state) return null

  return (
    <button type="button" className="gg-syslayer-badge" onClick={onOpenViewer} title="Посмотреть содержимое слоёв">
      <span className="gg-syslayer-dot" />
      <span className="gg-syslayer-text">
        System layer · v{state.version}
        {state.userPath && (
          <>
            <span className="gg-syslayer-sep">·</span>
            <span className="gg-syslayer-user">User layer · {state.userPath}</span>
          </>
        )}
        {!state.userPath && path && (
          <>
            <span className="gg-syslayer-sep">·</span>
            <span className="gg-syslayer-user is-empty">add AGENTS.md to customize</span>
          </>
        )}
      </span>
    </button>
  )
}
