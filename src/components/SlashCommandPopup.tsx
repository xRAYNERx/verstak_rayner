import { useEffect, useMemo, useState } from 'react'
import { useSkills } from '../store/skillStore'

/**
 * Slash command popup — появляется когда в композере набрано "/" в начале.
 *
 * Источники команд:
 *  1. Все скиллы с заполненным frontmatter.slash (главное).
 *  2. Built-in системные команды (/clear, /mode auto, /new).
 *
 * Поведение:
 *  - Фильтрация по подстроке после /.
 *  - ↑↓ — навигация, Enter — выбор, Esc — закрыть.
 *  - При выборе скилла: активируется skill + текст композера очищается.
 *  - Системные команды дёргают callback.
 */

export type SlashCommand =
  | { kind: 'skill'; skillId: string; trigger: string; label: string; description?: string; icon?: string }
  | { kind: 'system'; trigger: string; label: string; description: string; icon: string; action: () => void }

interface Props {
  /** Текущий текст композера. Если начинается с "/", popup открыт. */
  text: string
  /** Вызывается когда нужно очистить композер (после выбора скилла или /clear). */
  onClear: () => void
  /** Опционально — системные команды от родителя (/clear messages и т.п.). */
  systemCommands?: SlashCommand[]
}

export function SlashCommandPopup({ text, onClear, systemCommands = [] }: Props) {
  const skills = useSkills(s => s.skills)
  const setActiveSkill = useSkills(s => s.setActiveSkill)
  const [selectedIdx, setSelectedIdx] = useState(0)

  // Активируется при тексте начинающемся с "/"
  const slashState = parseSlash(text)
  const isOpen = slashState !== null

  // Собрать все команды: skill slashes + system
  const allCommands: SlashCommand[] = useMemo(() => {
    const skillCommands: SlashCommand[] = skills
      .filter(s => s.slash)
      .map(s => ({
        kind: 'skill' as const,
        skillId: s.id,
        trigger: s.slash!,
        label: s.name ?? s.id,
        description: s.description,
        icon: s.icon
      }))
    return [...skillCommands, ...systemCommands]
  }, [skills, systemCommands])

  // Фильтр по введённому query
  const filtered = useMemo(() => {
    if (!slashState) return []
    const q = slashState.query.toLowerCase()
    if (!q) return allCommands
    return allCommands.filter(c =>
      c.trigger.toLowerCase().includes(q) ||
      c.label.toLowerCase().includes(q)
    )
  }, [allCommands, slashState])

  // Reset selection at filter change
  useEffect(() => {
    setSelectedIdx(0)
  }, [text])

  // Keyboard handler — global while popup open
  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIdx(i => Math.min(filtered.length - 1, i + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIdx(i => Math.max(0, i - 1))
      } else if (e.key === 'Enter' && filtered[selectedIdx]) {
        e.preventDefault()
        execute(filtered[selectedIdx])
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClear()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, filtered, selectedIdx])

  if (!isOpen) return null

  function execute(cmd: SlashCommand) {
    if (cmd.kind === 'skill') {
      setActiveSkill(cmd.skillId)
      onClear()
    } else {
      cmd.action()
      onClear()
    }
  }

  if (filtered.length === 0) {
    return (
      <div className="gg-slash-popup">
        <div className="gg-slash-empty">Нет команд по запросу «/{slashState.query}»</div>
      </div>
    )
  }

  return (
    <div className="gg-slash-popup">
      <div className="gg-slash-header">Команды агента — Enter для выбора, Esc закрыть</div>
      {filtered.map((c, i) => (
        <div
          key={c.kind === 'skill' ? `skill:${c.skillId}` : `sys:${c.trigger}`}
          className={`gg-slash-item ${i === selectedIdx ? 'is-selected' : ''}`}
          onMouseEnter={() => setSelectedIdx(i)}
          onClick={() => execute(c)}
        >
          <span className="gg-slash-icon">{c.icon ?? '🎭'}</span>
          <span className="gg-slash-body">
            <span className="gg-slash-name">
              /{c.trigger}
              <span className="gg-slash-label">— {c.label}</span>
            </span>
            {c.description && <span className="gg-slash-desc">{c.description}</span>}
          </span>
        </div>
      ))}
    </div>
  )
}

interface SlashState { query: string }
function parseSlash(text: string): SlashState | null {
  // Активируется только если ВЕСЬ текст начинается с "/" (не где-то в середине)
  // и не содержит пробелов после слэша (иначе это уже args)
  if (!text.startsWith('/')) return null
  const afterSlash = text.slice(1)
  if (afterSlash.includes('\n')) return null
  // Allow space-separated args eventually; for V1 — show popup as long as
  // single-word slash without space
  const spaceIdx = afterSlash.indexOf(' ')
  const query = spaceIdx >= 0 ? afterSlash.slice(0, spaceIdx) : afterSlash
  return { query }
}
