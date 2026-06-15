import { describe, it, expect } from 'vitest'
import {
  serializeHistory,
  serializeMessage,
  formatToolResult,
  describeAttachments
} from '../../electron/ai/history-serializer'
import type { ChatMessage, ToolResult, Attachment } from '../../electron/ai/types'

describe('serializeHistory', () => {
  it('сериализует user/assistant сообщения с ролевыми маркерами', () => {
    const msgs: ChatMessage[] = [
      { role: 'user', content: 'первый вопрос' },
      { role: 'assistant', content: 'первый ответ' }
    ]
    const { transcript, includedCount, droppedCount } = serializeHistory(msgs)
    expect(includedCount).toBe(2)
    expect(droppedCount).toBe(0)
    expect(transcript).toContain('[USER]: первый вопрос')
    expect(transcript).toContain('[ASSISTANT]: первый ответ')
  })

  it('пропускает system-сообщения', () => {
    const msgs: ChatMessage[] = [
      { role: 'system', content: 'СИСТЕМНЫЙ ПРОТОКОЛ' },
      { role: 'user', content: 'вопрос' }
    ]
    const { transcript, includedCount } = serializeHistory(msgs)
    expect(includedCount).toBe(1)
    expect(transcript).not.toContain('СИСТЕМНЫЙ ПРОТОКОЛ')
  })

  it('сериализует tool_calls с обрезанными args', () => {
    const msgs: ChatMessage[] = [
      {
        role: 'assistant',
        content: 'читаю файл',
        toolCalls: [{ id: 't1', name: 'read_file', args: { path: 'src/foo.ts' } }]
      }
    ]
    const { transcript } = serializeHistory(msgs)
    expect(transcript).toContain('[tool_calls]')
    expect(transcript).toContain('read_file')
    expect(transcript).toContain('src/foo.ts')
  })

  it('сериализует tool_results', () => {
    const msgs: ChatMessage[] = [
      {
        role: 'user',
        content: '',
        toolResults: [{ id: 't1', name: 'read_file', result: 'содержимое файла' }]
      }
    ]
    const { transcript } = serializeHistory(msgs)
    expect(transcript).toContain('[tool_results]')
    expect(transcript).toContain('read_file →')
    expect(transcript).toContain('содержимое файла')
  })

  it('всегда включает minTurns даже сверх бюджета', () => {
    // 5 крупных turn'ов, бюджет крошечный → minTurns=4 всё равно включаются
    const big = 'X'.repeat(2000)
    const msgs: ChatMessage[] = Array.from({ length: 5 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as ChatMessage['role'],
      content: `${big}-${i}`
    }))
    const { includedCount } = serializeHistory(msgs, { charBudget: 100, minTurns: 4 })
    expect(includedCount).toBe(4)
  })

  it('отбрасывает старые turn\'ы при превышении бюджета (droppedCount > 0)', () => {
    const big = 'Y'.repeat(2000)
    const msgs: ChatMessage[] = Array.from({ length: 10 }, (_, i) => ({
      role: 'user' as const,
      content: `${big}-${i}`
    }))
    const { includedCount, droppedCount } = serializeHistory(msgs, { charBudget: 5000, minTurns: 2 })
    expect(droppedCount).toBeGreaterThan(0)
    expect(includedCount + droppedCount).toBe(10)
  })

  it('пустая история → пустой транскрипт', () => {
    const { transcript, includedCount } = serializeHistory([])
    expect(transcript).toBe('')
    expect(includedCount).toBe(0)
  })
})

describe('formatToolResult — учитывает r.error (раньше игнорировался)', () => {
  it('показывает [ОШИБКА] когда есть error', () => {
    const r: ToolResult = { id: 't1', name: 'run_command', result: 'exit 1', error: 'команда упала' }
    const out = formatToolResult(r)
    expect(out).toContain('[ОШИБКА]')
    expect(out).toContain('команда упала')
  })

  it('включает контекст ошибки из result', () => {
    const r: ToolResult = { id: 't1', name: 'write_file', result: 'permission denied', error: 'EACCES' }
    const out = formatToolResult(r)
    expect(out).toContain('[ОШИБКА] EACCES')
    expect(out).toContain('permission denied')
  })

  it('успешный результат — без [ОШИБКА]', () => {
    const r: ToolResult = { id: 't1', name: 'read_file', result: 'всё ок' }
    const out = formatToolResult(r)
    expect(out).toBe('всё ок')
    expect(out).not.toContain('[ОШИБКА]')
  })

  it('ошибка попадает в serializeHistory транскрипт', () => {
    const msgs: ChatMessage[] = [
      {
        role: 'user',
        content: '',
        toolResults: [{ id: 't1', name: 'run_command', result: '', error: 'npm test провалился' }]
      }
    ]
    const { transcript } = serializeHistory(msgs)
    expect(transcript).toContain('[ОШИБКА]')
    expect(transcript).toContain('npm test провалился')
  })

  it('длинный успешный result сжимается умно (read_file = голова+хвост)', () => {
    const longResult = 'HEAD_MARKER\n' + 'm'.repeat(5000) + '\nTAIL_MARKER'
    const r: ToolResult = { id: 't1', name: 'read_file', result: longResult }
    const out = formatToolResult(r, 500)
    expect(out.length).toBeLessThan(longResult.length)
    // read_file → truncateWithContext: голова и хвост сохраняются
    expect(out).toContain('HEAD_MARKER')
    expect(out).toContain('TAIL_MARKER')
  })
})

describe('describeAttachments', () => {
  const att: Attachment[] = [
    { name: 'img.png', mimeType: 'image/png', data: 'xxx', size: 100 }
  ]

  it('mode text — детальный хинт с mime', () => {
    const out = describeAttachments(att, 'text')
    expect(out).toContain('img.png')
    expect(out).toContain('image/png')
    expect(out).toMatch(/CLI не видит содержимое/)
  })

  it('mode inline — компактный список', () => {
    const out = describeAttachments(att, 'inline')
    expect(out).toBe('[файл: img.png]')
  })

  it('пустой / undefined → пустая строка', () => {
    expect(describeAttachments(undefined)).toBe('')
    expect(describeAttachments([])).toBe('')
  })
})

describe('serializeMessage', () => {
  it('комбинирует content + tool_calls + tool_results в одном сообщении', () => {
    const m: ChatMessage = {
      role: 'assistant',
      content: 'делаю',
      toolCalls: [{ id: 'c1', name: 'read_file', args: { path: 'a.ts' } }]
    }
    const out = serializeMessage(m)
    expect(out).toContain('[ASSISTANT]: делаю')
    expect(out).toContain('[tool_calls]')
    expect(out).toContain('read_file')
  })
})
