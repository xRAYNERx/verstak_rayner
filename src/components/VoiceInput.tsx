import { useCallback, useEffect, useRef, useState } from 'react'
import { WavCapture, arrayBufferToBase64 } from '../lib/wav-capture'

type Phase = 'idle' | 'recording' | 'processing'

interface Props {
  onTranscript: (chunkAppend: string) => void
  disabled?: boolean
}

function MicIcon({ recording }: { recording: boolean }) {
  if (recording) {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden
        className="gg-voice-icon"
      >
        <rect x="7" y="7" width="10" height="10" rx="2" />
      </svg>
    )
  }
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="gg-voice-icon"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
      <line x1="12" x2="12" y1="18" y2="22" />
      <line x1="8" x2="16" y1="22" y2="22" />
    </svg>
  )
}

/** Голосовой ввод: клик → запись → клик → Whisper small (локально). */
export function VoiceInput({ onTranscript, disabled }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [modelLoading, setModelLoading] = useState(false)

  const streamRef = useRef<MediaStream | null>(null)
  const wavRef = useRef<WavCapture | null>(null)
  const phaseRef = useRef<Phase>('idle')
  const startingRef = useRef(false)
  const recordStartedAtRef = useRef(0)

  const setPhaseSync = useCallback((next: Phase) => {
    phaseRef.current = next
    setPhase(next)
  }, [])

  useEffect(() => {
    let alive = true
    void window.api.voice.status().then(st => {
      if (alive) setModelLoading(st.loading)
    }).catch(() => { /* noop */ })
    const t = window.setInterval(() => {
      void window.api.voice.status().then(st => {
        if (alive) setModelLoading(st.loading)
      }).catch(() => { /* noop */ })
    }, 5000)
    return () => { alive = false; window.clearInterval(t) }
  }, [])

  useEffect(() => {
    if (!error) return
    const t = window.setTimeout(() => setError(null), 10000)
    return () => window.clearTimeout(t)
  }, [error])

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      wavRef.current = null
    }
  }, [])

  function fail(msg: string) {
    setError(msg)
    void window.api.notify.show({ title: 'Голосовой ввод', body: msg })
  }

  function cleanupStream() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    wavRef.current = null
  }

  async function startRecording() {
    if (disabled || phaseRef.current !== 'idle' || startingRef.current) return

    setError(null)
    startingRef.current = true

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Микрофон недоступен в этой среде')
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      })
      streamRef.current = stream
      wavRef.current = await WavCapture.create(stream)
      recordStartedAtRef.current = Date.now()
      setPhaseSync('recording')
    } catch (err) {
      cleanupStream()
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('NotAllowed') || msg.includes('Permission')) {
        fail('Нет доступа к микрофону — разрешите Verstak в Параметры → Конфиденциальность → Микрофон')
      } else if (msg.includes('NotFound')) {
        fail('Микрофон не найден')
      } else {
        fail(msg)
      }
      setPhaseSync('idle')
    } finally {
      startingRef.current = false
    }
  }

  async function stopAndTranscribe() {
    const capture = wavRef.current
    if (!capture) {
      setPhaseSync('idle')
      cleanupStream()
      return
    }

    const elapsed = Date.now() - recordStartedAtRef.current
    setPhaseSync('processing')

    let blob: Blob
    try {
      blob = await capture.stop()
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err))
      setPhaseSync('idle')
      cleanupStream()
      return
    }
    cleanupStream()

    if (elapsed < 400) {
      fail('Слишком короткий клик — говорите 1–2 секунды')
      setPhaseSync('idle')
      return
    }

    if (blob.size < 1024) {
      fail('Запись пустая — проверьте микрофон и говорите громче')
      setPhaseSync('idle')
      return
    }

    try {
      const data = await blob.arrayBuffer()
      const base64 = arrayBufferToBase64(data)
      const result = await Promise.race([
        window.api.voice.transcribe({ data: base64, mimeType: 'audio/wav' }),
        new Promise<{ ok: false; error: string }>((resolve) => {
          window.setTimeout(() => resolve({
            ok: false,
            error: 'Распознавание слишком долгое — первая загрузка модели (~150 МБ). Подождите и повторите.',
          }), 120_000)
        }),
      ])

      if (result.ok) {
        onTranscript(result.text + (result.text.endsWith(' ') ? '' : ' '))
        setError(null)
      } else {
        fail(result.error)
      }
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err))
    } finally {
      setPhaseSync('idle')
    }
  }

  function onClick() {
    if (disabled || phaseRef.current === 'processing') return
    if (phaseRef.current === 'recording') void stopAndTranscribe()
    else void startRecording()
  }

  const title = (() => {
    if (disabled) return 'Голосовой ввод недоступен во время ответа'
    if (phase === 'recording') return 'Запись… Нажмите ещё раз — вставить текст'
    if (phase === 'processing') return modelLoading ? 'Загрузка модели…' : 'Распознаём речь…'
    if (error) return `Голосовой ввод: ${error}`
    return 'Голосовой ввод — клик: запись, ещё клик: в текст'
  })()

  return (
    <button
      type="button"
      className={`gg-voice-btn ${phase === 'recording' ? 'is-recording' : ''} ${phase === 'processing' ? 'is-processing' : ''} ${error ? 'is-error' : ''}`}
      onClick={onClick}
      disabled={disabled || phase === 'processing'}
      title={title}
      aria-label={title}
      aria-pressed={phase === 'recording'}
    >
      {phase === 'processing' ? (
        <span className="gg-voice-spinner" aria-hidden />
      ) : (
        <MicIcon recording={phase === 'recording'} />
      )}
    </button>
  )
}