import { useEffect, useRef, useState, type DragEvent, type ClipboardEvent } from 'react'
import { useProject } from '../store/projectStore'
import { useProvider } from '../hooks/useProvider'
import { Markdown } from './Markdown'
import type { Attachment } from '../types/api'

const MAX_BYTES_PER_FILE = 5 * 1024 * 1024  // 5 MB
const MAX_ATTACHMENTS = 8

const ACCEPTED_MIME_PREFIXES = ['image/', 'text/', 'application/pdf', 'application/json']

interface ChatProps {
  onOpenSettings: () => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isAcceptable(mime: string): boolean {
  return ACCEPTED_MIME_PREFIXES.some(p => mime.startsWith(p))
}

async function blobToAttachment(blob: Blob, fallbackName: string): Promise<Attachment | null> {
  if (blob.size > MAX_BYTES_PER_FILE) return null
  const mimeType = blob.type || 'application/octet-stream'
  if (!isAcceptable(mimeType)) return null
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  const data = btoa(binary)
  return {
    name: (blob as File).name || fallbackName,
    mimeType,
    data,
    size: blob.size
  }
}

export function Chat({ onOpenSettings }: ChatProps) {
  const { messages, addMessage, updateLastAssistant, isStreaming, setStreaming } = useProject()
  const provider = useProvider()
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)
  const streamRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const screenshotCounter = useRef(0)
  const warningTimer = useRef<number | null>(null)

  function flashWarning(msg: string) {
    setWarning(msg)
    if (warningTimer.current) window.clearTimeout(warningTimer.current)
    warningTimer.current = window.setTimeout(() => setWarning(null), 2500)
  }

  async function addBlobs(blobs: Array<{ blob: Blob; nameHint: string }>) {
    const added: Attachment[] = []
    for (const { blob, nameHint } of blobs) {
      if (attachments.length + added.length >= MAX_ATTACHMENTS) {
        flashWarning(`Можно прикрепить максимум ${MAX_ATTACHMENTS} файлов`)
        break
      }
      if (blob.size > MAX_BYTES_PER_FILE) {
        flashWarning(`${nameHint}: больше ${formatSize(MAX_BYTES_PER_FILE)}, пропущен`)
        continue
      }
      const att = await blobToAttachment(blob, nameHint)
      if (!att) {
        flashWarning(`${nameHint}: формат не поддерживается, пропущен`)
        continue
      }
      added.push(att)
    }
    if (added.length > 0) setAttachments(prev => [...prev, ...added])
  }

  useEffect(() => {
    const off = window.api.ai.onEvent(({ event }) => {
      if (event.type === 'text') updateLastAssistant(event.text)
      else if (event.type === 'pending-write') {
        useProject.getState().setPendingWrite({
          callId: event.callId,
          path: event.path,
          before: event.before,
          after: event.after
        })
      }
      else if (event.type === 'done') {
        const path = useProject.getState().path
        const msgs = useProject.getState().messages
        const lastAssistant = msgs[msgs.length - 1]
        if (path && lastAssistant?.role === 'assistant' && lastAssistant.content) {
          void window.api.chats.append(path, 'assistant', lastAssistant.content)
        }
        setStreaming(false)
      }
      else if (event.type === 'error') {
        updateLastAssistant(`\n\n[Ошибка: ${event.message}]`)
        setStreaming(false)
      }
    })
    return off
  }, [updateLastAssistant, setStreaming])

  // Autoscroll on new content
  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight
  }, [messages])

  // Auto-grow textarea
  function autoGrow() {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 220) + 'px'
  }
  useEffect(autoGrow, [input])

  // Cleanup warning timer on unmount
  useEffect(() => () => { if (warningTimer.current) window.clearTimeout(warningTimer.current) }, [])

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items
    if (!items) return
    const blobs: Array<{ blob: Blob; nameHint: string }> = []
    for (const item of Array.from(items)) {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) {
          const ext = (file.type.split('/')[1] ?? 'bin').replace('jpeg', 'jpg')
          const name = file.name && file.name !== 'image.png'
            ? file.name
            : `Скриншот ${++screenshotCounter.current}.${ext}`
          blobs.push({ blob: file, nameHint: name })
        }
      }
    }
    if (blobs.length > 0) {
      e.preventDefault()
      void addBlobs(blobs)
    }
  }

  function onFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files
    if (!list) return
    const arr: Array<{ blob: Blob; nameHint: string }> = []
    for (let i = 0; i < list.length; i++) {
      const f = list[i]
      arr.push({ blob: f, nameHint: f.name })
    }
    if (arr.length > 0) void addBlobs(arr)
    e.target.value = ''  // reset so same file can be re-picked
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    if (e.dataTransfer?.types.includes('Files')) setDragOver(true)
  }
  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    if (e.currentTarget === e.target) setDragOver(false)
  }
  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return
    const arr: Array<{ blob: Blob; nameHint: string }> = []
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      arr.push({ blob: f, nameHint: f.name })
    }
    void addBlobs(arr)
  }

  function removeAttachment(idx: number) {
    setAttachments(prev => prev.filter((_, i) => i !== idx))
  }

  async function send() {
    const text = input.trim()
    if (!text && attachments.length === 0) return
    if (isStreaming) return
    const path = useProject.getState().path
    const userAttachments = attachments
    setInput('')
    setAttachments([])
    const summary = userAttachments.length > 0
      ? `${text}${text ? '\n\n' : ''}📎 ${userAttachments.map(a => a.name).join(', ')}`
      : text
    addMessage({ role: 'user', content: text, attachments: userAttachments })
    if (path) await window.api.chats.append(path, 'user', summary)
    addMessage({ role: 'assistant', content: '' })
    setStreaming(true)
    const allMessages = [...useProject.getState().messages].slice(0, -1)
    await window.api.ai.send(allMessages, path)
  }

  const hasMessages = messages.length > 0
  const canSend = !isStreaming && (input.trim().length > 0 || attachments.length > 0)

  return (
    <div
      className={`gg-chat ${dragOver ? 'is-drag-over' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dragOver && (
        <div className="gg-drop-overlay">
          <div className="gg-drop-overlay-inner">
            <div className="gg-drop-icon">📎</div>
            <div>Брось файлы сюда — изображения, PDF, текст</div>
          </div>
        </div>
      )}

      <div className="gg-chat-stream" ref={streamRef}>
        {!hasMessages && (
          <div className="gg-chat-empty">
            <div className="gg-chat-empty-mark">G</div>
            <div className="gg-chat-empty-title">Готов к работе</div>
            <div className="gg-chat-empty-hint">
              Открой проект слева и напиши задачу. Можно прикрепить файл, бросить скриншот через Ctrl+V или drag-and-drop.
            </div>
          </div>
        )}
        {messages.map((m, i) => {
          const isLast = i === messages.length - 1
          const isStreamingAssistant = isLast && m.role === 'assistant' && isStreaming
          return (
            <div key={i} className={`gg-msg ${m.role === 'user' ? 'gg-msg-user' : 'gg-msg-assistant'}`}>
              {m.role === 'assistant' && (
                <div className="gg-msg-meta">
                  <span className="gg-msg-author">Gemini</span>
                </div>
              )}
              <div className="gg-msg-bubble">
                {m.attachments?.length ? (
                  <div className="gg-msg-attachments">
                    {m.attachments.map((a, ai) => (
                      <AttachmentPreview key={ai} attachment={a} compact />
                    ))}
                  </div>
                ) : null}
                {m.content
                  ? (m.role === 'assistant'
                      ? <Markdown text={m.content} />
                      : <span style={{ whiteSpace: 'pre-wrap' }}>{m.content}</span>)
                  : isStreamingAssistant
                    ? <div className="gg-typing"><span /><span /><span /></div>
                    : null
                }
              </div>
            </div>
          )
        })}
      </div>

      <div className="gg-composer">
        {attachments.length > 0 && (
          <div className="gg-attach-row">
            {attachments.map((a, i) => (
              <AttachmentChip key={i} attachment={a} onRemove={() => removeAttachment(i)} />
            ))}
          </div>
        )}
        {warning && <div className="gg-composer-warning">{warning}</div>}
        <div className="gg-composer-inner">
          <textarea
            ref={textareaRef}
            className="gg-composer-textarea"
            value={input}
            rows={1}
            onChange={e => setInput(e.target.value)}
            onPaste={onPaste}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                e.preventDefault()
                void send()
              }
            }}
            placeholder={isStreaming ? 'Gemini отвечает…' : 'Опиши задачу. Enter — отправить, Shift+Enter — новая строка. Ctrl+V — вставить скриншот.'}
            disabled={isStreaming}
          />
          <div className="gg-composer-actions">
            <button
              type="button"
              className="gg-attach-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={isStreaming}
              title="Прикрепить файл"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1 -8.5 8.5 8.5 8.5 0 0 1 -8.5 -8.5 8.5 8.5 0 0 1 17 0z" style={{ display: 'none' }} />
                <path d="m21.44 11.05 -9.19 9.19a6 6 0 0 1 -8.49 -8.49l9.19 -9.19a4 4 0 0 1 5.66 5.66L9.41 17.41a2 2 0 0 1 -2.83 -2.83l8.49 -8.48" />
              </svg>
            </button>
            <button
              className="gg-send-btn"
              onClick={() => void send()}
              disabled={!canSend}
              title="Отправить (Enter)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12l14 -8l-4 16l-4 -6l-6 -2z" />
              </svg>
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            accept="image/*,application/pdf,text/*,.json,.md,.csv"
            onChange={onFilesPicked}
          />
        </div>
        <div className="gg-composer-hint">
          <span><span className="gg-kbd">Enter</span> отправить · <span className="gg-kbd">Shift</span>+<span className="gg-kbd">Enter</span> новая строка · <span className="gg-kbd">Ctrl+V</span> картинка</span>
          <button
            type="button"
            className="gg-model-pill"
            onClick={onOpenSettings}
            title="Сменить модель / провайдер"
          >
            <span className={`gg-provider-dot ${provider.id === 'gemini-cli' ? 'cli' : ''}`} />
            <span className="gg-model-pill-name">{provider.model}</span>
            <span className="gg-model-pill-sep">·</span>
            <span className="gg-model-pill-transport">{provider.transport}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function AttachmentChip({ attachment, onRemove }: { attachment: Attachment; onRemove: () => void }) {
  const isImage = attachment.mimeType.startsWith('image/')
  const src = isImage ? `data:${attachment.mimeType};base64,${attachment.data}` : null
  return (
    <div className="gg-attach-chip">
      {src ? <img src={src} alt={attachment.name} className="gg-attach-thumb" /> : <div className="gg-attach-icon">📄</div>}
      <div className="gg-attach-meta">
        <div className="gg-attach-name" title={attachment.name}>{attachment.name}</div>
        <div className="gg-attach-size">{formatSize(attachment.size)}</div>
      </div>
      <button className="gg-attach-remove" onClick={onRemove} title="Убрать">×</button>
    </div>
  )
}

function AttachmentPreview({ attachment, compact }: { attachment: Attachment; compact?: boolean }) {
  const isImage = attachment.mimeType.startsWith('image/')
  if (isImage) {
    return (
      <img
        src={`data:${attachment.mimeType};base64,${attachment.data}`}
        alt={attachment.name}
        className={compact ? 'gg-msg-image' : ''}
        style={{ maxWidth: compact ? 360 : '100%', maxHeight: compact ? 280 : '100%', borderRadius: 8, display: 'block', marginBottom: 6 }}
      />
    )
  }
  return (
    <div className="gg-attach-chip" style={{ marginBottom: 6 }}>
      <div className="gg-attach-icon">📄</div>
      <div className="gg-attach-meta">
        <div className="gg-attach-name">{attachment.name}</div>
        <div className="gg-attach-size">{formatSize(attachment.size)}</div>
      </div>
    </div>
  )
}
