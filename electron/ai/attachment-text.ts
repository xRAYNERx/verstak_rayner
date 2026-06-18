import { Buffer } from 'node:buffer'
import { extractDocxTextFromBuffer } from './office'
import type { Attachment, ChatMessage } from './types'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export function isDocxAttachment(att: Attachment): boolean {
  if (att.mimeType === DOCX_MIME) return true
  return /\.docx$/i.test(att.name)
}

/**
 * DOCX во вложениях чата → текст в content (mammoth).
 * Бинарник docx убираем из attachments — провайдеры его не читают.
 */
export async function expandOfficeAttachments(messages: ChatMessage[]): Promise<ChatMessage[]> {
  const out: ChatMessage[] = []
  for (const m of messages) {
    if (m.role !== 'user' || !m.attachments?.some(isDocxAttachment)) {
      out.push(m)
      continue
    }
    const docxAtts = m.attachments.filter(isDocxAttachment)
    const blocks: string[] = []
    for (const att of docxAtts) {
      try {
        const text = await extractDocxTextFromBuffer(Buffer.from(att.data, 'base64'))
        blocks.push(`--- Содержимое вложения «${att.name}» ---\n${text}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        blocks.push(`--- Вложение «${att.name}»: не удалось извлечь текст (${msg}) ---`)
      }
    }
    const prefix = blocks.join('\n\n')
    const content = m.content ? `${prefix}\n\n${m.content}` : prefix
    const attachments = m.attachments.filter(a => !isDocxAttachment(a))
    out.push({
      ...m,
      content,
      attachments: attachments.length > 0 ? attachments : undefined,
    })
  }
  return out
}