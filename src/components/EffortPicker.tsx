import { useEffect, useRef, useState } from 'react'
import { useProject } from '../store/projectStore'

export type EffortLevel = 'quick' | 'standard' | 'deep'

const OPTIONS: Array<{ id: EffortLevel; label: string; hint: string }> = [
  { id: 'quick', label: 'Быстро', hint: 'Короткие ответы, дешевле' },
  { id: 'standard', label: 'Стандарт', hint: 'Баланс скорости и глубины' },
  { id: 'deep', label: 'Глубоко', hint: 'Расширенное мышление' },
]

function labelFor(level: EffortLevel): string {
  return OPTIONS.find(o => o.id === level)?.label ?? 'Стандарт'
}

export function EffortPicker() {
  const effortLevel = useProject(s => s.effortLevel)
  const setEffortLevel = useProject(s => s.setEffortLevel)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="gg-effort-wrap" ref={wrapRef}>
      <button
        type="button"
        className="gg-effort-trigger"
        onClick={() => setOpen(v => !v)}
        title="Стиль ответа модели"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span>{labelFor(effortLevel)}</span>
        <span className="gg-effort-chevron" aria-hidden>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="gg-effort-popover" role="listbox">
          {OPTIONS.map(opt => (
            <button
              key={opt.id}
              type="button"
              className={`gg-effort-option ${effortLevel === opt.id ? 'is-active' : ''}`}
              onClick={() => { setEffortLevel(opt.id); setOpen(false) }}
              role="option"
              aria-selected={effortLevel === opt.id}
            >
              <span className="gg-effort-option-label">{opt.label}</span>
              <span className="gg-effort-option-hint">{opt.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}