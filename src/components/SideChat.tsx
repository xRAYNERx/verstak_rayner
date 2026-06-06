import { useEffect, useRef, useState } from 'react'
import { useProject } from '../store/projectStore'
import { useProvider } from '../hooks/useProvider'
import { Markdown } from './Markdown'

interface SideChatProps {
  /** Dedicated side-chat session id (created lazily by App). */
  sideChatId: number
  onClose: () => void
}

/**
 * Боковой чат — второй чат-поток, пристыкованный справа (как «Боковой чат» у
 * Codex). Работает параллельно основному чату в том же окне: свой стрим
 * сообщений + свой composer.
 *
 * Технически это обычный BACKGROUND-чат: его sessionId никогда не равен
 * activeChatId, поэтому события его стрима роутятся существующим listener'ом
 * в Chat.tsx в chatSnapshots[sideChatId] (ветка owner.kind==='chat' &&
 * owner.chatId !== activeChatId → applyEventToChat). Мы переиспользуем эту
 * инфраструктуру — основной чат полностью изолирован.
 */
export function SideChat({ sideChatId, onClose }: SideChatProps) {
  const provider = useProvider()
  // Live snapshot: stream-ответы прилетают в chatSnapshots[sideChatId] через
  // applyEventToChat, селектор перерисовывает панель.
  const snapshot = useProject(s => s.chatSnapshots[sideChatId])
  const path = useProject(s => s.path)
  const messages = snapshot?.messages ?? []
  const isStreaming = snapshot?.isStreaming ?? false

  const [input, setInput] = useState('')
  const streamRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sendIdRef = useRef<number | null>(null)

  // На первом открытии подгружаем persisted-историю в снапшот (если он ещё
  // не заполнен живым стримом). Тянем один раз на смену sideChatId.
  useEffect(() => {
    let cancelled = false
    const store = useProject.getState()
    const snap = store.chatSnapshots[sideChatId]
    if (snap && snap.messages.length > 0) return  // уже есть содержимое
    void window.api.chats.list(sideChatId).then(history => {
      if (cancelled) return
      // Защита от гонки: если за время загрузки появился живой стрим — не трём
      const current = useProject.getState().chatSnapshots[sideChatId]
      if (current && current.messages.length > 0) return
      store.seedChatSnapshot(sideChatId, history.map(m => ({ role: m.role, content: m.content })))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [sideChatId])

  // Autoscroll on new content.
  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight
  }, [messages])

  function autoGrow() {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }
  useEffect(autoGrow, [input])

  async function send() {
    const text = input.trim()
    if (!text || isStreaming) return
    setInput('')
    const store = useProject.getState()
    // История ДО нового сообщения — для отправки модели.
    const history = (store.chatSnapshots[sideChatId]?.messages ?? [])
      .filter(m => m.content)
      .map(m => ({ role: m.role, content: m.content }))
    const userMsg = { role: 'user' as const, content: text }
    // Кладём user + пустой assistant placeholder в снапшот бокового чата.
    store.pushUserToChatSnapshot(sideChatId, text)
    // Persist user message (как в основном чате).
    if (path) {
      void window.api.chats.append(sideChatId, path, 'user', text).catch(() => {})
    }
    const sendId = await window.api.ai.send([...history, userMsg], path, String(sideChatId))
    sendIdRef.current = sendId
    // Регистрируем owner как 'chat' с chatId бокового чата — события стрима
    // уйдут в chatSnapshots[sideChatId], НЕ в активный основной чат.
    if (sendId > 0) {
      store.registerSendOwner(sendId, { kind: 'chat', chatId: sideChatId })
    } else {
      // Провайдер недоступен — снимаем placeholder-стриминг, чтобы UI не завис.
      store.applyEventToChat(sideChatId, { type: 'error', message: 'Провайдер недоступен' })
    }
  }

  async function stop() {
    const id = sendIdRef.current
    if (id == null) return
    await window.api.ai.stop(id).catch(() => {})
    useProject.getState().applyEventToChat(sideChatId, { type: 'done' })
    useProject.getState().forgetSendOwner(id)
    sendIdRef.current = null
  }

  return (
    <div className="gg-sidechat">
      <div className="gg-sidechat-header">
        <span>💬 Боковой чат</span>
        <button
          className="gg-sidechat-close"
          onClick={onClose}
          title="Закрыть боковой чат"
        >×</button>
      </div>
      <div className="gg-sidechat-stream" ref={streamRef}>
        {messages.length === 0 && (
          <div className="gg-sidechat-empty">
            Второй чат-поток рядом с основным. Спроси что-нибудь — основной чат не затрагивается.
          </div>
        )}
        {messages.map((m, i) => {
          const isLast = i === messages.length - 1
          const isStreamingAssistant = isLast && m.role === 'assistant' && isStreaming
          return (
            <div key={i} className={`gg-sidechat-msg ${m.role === 'user' ? 'is-user' : 'is-assistant'}`}>
              <div className="gg-sidechat-bubble">
                {m.content
                  ? (m.role === 'assistant'
                      ? <Markdown text={m.content} />
                      : <span style={{ whiteSpace: 'pre-wrap' }}>{m.content}</span>)
                  : isStreamingAssistant
                    ? <div className="gg-typing"><span /><span /><span /></div>
                    : null}
              </div>
            </div>
          )
        })}
      </div>
      <div className="gg-sidechat-composer">
        <textarea
          ref={textareaRef}
          className="gg-sidechat-textarea"
          value={input}
          rows={1}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
              e.preventDefault()
              void send()
            }
            if (e.key === 'Escape' && isStreaming) {
              e.preventDefault()
              void stop()
            }
          }}
          placeholder={isStreaming ? `${provider.label} печатает…` : 'Сообщение в боковой чат…'}
        />
        {isStreaming ? (
          <button className="gg-sidechat-send is-stop" onClick={() => void stop()} title="Остановить (Esc)">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="1.5" />
            </svg>
          </button>
        ) : (
          <button
            className="gg-sidechat-send"
            onClick={() => void send()}
            disabled={input.trim().length === 0}
            title="Отправить (Enter)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12l14 -8l-4 16l-4 -6l-6 -2z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
