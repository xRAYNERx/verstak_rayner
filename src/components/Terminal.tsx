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
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(ref.current)

    let termId = -1
    const buffered: Array<{ id: number; data: string }> = []
    // Регистрируем onData ДО spawn: pty эмитит приглашение шелла сразу после
    // старта, а spawn() — async IPC. Раньше listener вешался только после резолва
    // → раннее приглашение терялось (пустой чёрный терминал, «так себе работает»).
    // До получения termId буферим, потом сливаем подходящие по id.
    const offData = window.api.term.onData((msg) => {
      if (termId === -1) { buffered.push(msg); return }
      if (msg.id === termId) term.write(msg.data)
    })

    // fit + синхронизация реального размера xterm в pty (раньше pty жил фиксированным
    // 100×30 — resize вообще не вызывался, отсюда кривой перенос строк).
    const doFit = () => {
      try {
        fit.fit()
        if (termId > 0) void window.api.term.resize(termId, term.cols, term.rows)
      } catch { /* ignore */ }
    }
    // fit после первой раскладки контейнера (панель только что появилась → размер ещё 0).
    const raf = requestAnimationFrame(doFit)
    window.addEventListener('resize', doFit)

    void window.api.term.spawn(path).then(id => {
      termId = id
      for (const msg of buffered) { if (msg.id === termId) term.write(msg.data) }
      buffered.length = 0
      term.onData(d => { void window.api.term.write(termId, d) })
      doFit() // сообщаем pty реальный размер после спавна
    })

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', doFit)
      offData()
      if (termId > 0) void window.api.term.kill(termId)
      term.dispose()
    }
  }, [path])

  return <div ref={ref} style={{ height: '100%', width: '100%', background: '#0a0b0d', padding: '6px 8px' }} />
}
