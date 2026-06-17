import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import { useProject } from '../store/projectStore'

export function Terminal() {
  const ref = useRef<HTMLDivElement>(null)
  const { path } = useProject()

  useEffect(() => {
    if (!ref.current || !path) return
    const term = new XTerm({
      fontSize: 12,
      fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
      theme: {
        background: '#0a0b0d',
        foreground: '#e6e8ec',
        cursor: '#5b8dff',
        selectionBackground: 'rgba(91, 141, 255, 0.25)'
      }
    })
    const container = ref.current
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)

    let termId = -1
    const buffered: Array<{ id: number; data: string }> = []
    // Регистрируем onData ДО spawn: pty эмитит приглашение шелла сразу после
    // старта, а spawn() — async IPC. Раньше listener вешался только после резолва
    // → раннее приглашение терялось. До получения termId буферим, потом сливаем.
    const offData = window.api.term.onData((msg) => {
      if (termId === -1) { buffered.push(msg); return }
      if (msg.id === termId) term.write(msg.data)
    })

    // fit + синхронизация реального размера xterm в pty (раньше pty жил фиксированным
    // 100×30 — resize не вызывался, отсюда кривой перенос/невидимый prompt).
    const doFit = () => {
      // Контейнер ещё не разложен (height/width = 0) → fit дал бы 0 строк и текст
      // был бы невидим. Ждём реального размера (ResizeObserver вызовет снова).
      if (container.clientHeight === 0 || container.clientWidth === 0) return
      try {
        fit.fit()
        if (termId > 0) void window.api.term.resize(termId, term.cols, term.rows)
      } catch { /* ignore */ }
    }
    // ResizeObserver надёжно ловит момент, когда панель получает реальный размер
    // (появилась с нулевым → размер пришёл позже) — не угадываем через rAF.
    const ro = new ResizeObserver(() => doFit())
    ro.observe(container)
    doFit()

    void window.api.term.spawn(path).then(id => {
      termId = id
      for (const msg of buffered) { if (msg.id === termId) term.write(msg.data) }
      buffered.length = 0
      term.onData(d => { void window.api.term.write(termId, d) })
      doFit() // сообщаем pty реальный размер после спавна
    })

    return () => {
      ro.disconnect()
      offData()
      if (termId > 0) void window.api.term.kill(termId)
      term.dispose()
    }
  }, [path])

  return <div ref={ref} style={{ height: '100%', width: '100%', background: '#0a0b0d', padding: '6px 8px' }} />
}
