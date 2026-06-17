import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { convertFileHandler, type ToolContext } from '../../electron/ipc/tool-handlers'
import type { ToolCall } from '../../electron/ai/types'

/**
 * #4: convert_file читал .json/.xml/.csv/.html/.docx через safeRealJoin (граница
 * проекта), но НЕ через isForbiddenPath и НЕ через scanText — единственный read-путь
 * без обоих рубежей. Утекали creds*.json / cookies.json / credentials.json целиком
 * в контекст модели (read_file те же файлы блокирует). Фикс: forbidden-гейт +
 * scanText на каждой ветке возврата.
 */
function ctxFor(projectPath: string): ToolContext {
  return { projectPath, sendId: 't', sender: { send: () => {} } } as unknown as ToolContext
}
function call(path: string): ToolCall {
  return { id: '1', name: 'convert_file', args: { path } }
}

describe('convert_file security (#4)', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'gg-conv-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('блокирует creds*.json (isForbiddenPath) — не отдаёт содержимое модели', async () => {
    writeFileSync(join(dir, 'creds_google.json'), '{"private_key":"-----BEGIN PRIVATE KEY-----\\nMIIabc\\n-----END PRIVATE KEY-----"}')
    const res = await convertFileHandler.handle(call('creds_google.json'), ctxFor(dir))
    expect(res.error).toBeTruthy()
    expect(res.result).toBe('')
    expect(String(res.result)).not.toContain('BEGIN PRIVATE KEY')
  })

  it('блокирует cookies.json', async () => {
    writeFileSync(join(dir, 'cookies.json'), '{"token":"secret-cookie-value"}')
    const res = await convertFileHandler.handle(call('cookies.json'), ctxFor(dir))
    expect(res.error).toBeTruthy()
    expect(res.result).toBe('')
  })

  it('редактирует секреты в обычном .json (scanText defense-in-depth)', async () => {
    writeFileSync(join(dir, 'config.json'), '{"aws":"AKIAIOSFODNN7EXAMPLE"}')
    const res = await convertFileHandler.handle(call('config.json'), ctxFor(dir))
    expect(res.error).toBeFalsy()
    expect(String(res.result)).toContain('[REDACTED:aws-access-key]')
    expect(String(res.result)).not.toContain('AKIAIOSFODNN7EXAMPLE')
  })
})
