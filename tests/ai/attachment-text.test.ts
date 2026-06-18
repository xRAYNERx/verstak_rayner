import { describe, expect, it, vi } from 'vitest'
import { expandOfficeAttachments, isDocxAttachment } from '../../electron/ai/attachment-text'

vi.mock('../../electron/ai/office', () => ({
  extractDocxTextFromBuffer: vi.fn(async () => 'Текст из Word'),
}))

describe('attachment-text', () => {
  it('isDocxAttachment по имени и mime', () => {
    expect(
      isDocxAttachment({
        name: 'a.docx',
        mimeType: 'application/octet-stream',
        data: '',
        size: 1,
      }),
    ).toBe(true)
    expect(
      isDocxAttachment({ name: 'a.pdf', mimeType: 'application/pdf', data: '', size: 1 }),
    ).toBe(false)
  })

  it('expandOfficeAttachments вставляет текст и убирает docx из attachments', async () => {
    const out = await expandOfficeAttachments([
      {
        role: 'user',
        content: 'Разбери документ',
        attachments: [
          {
            name: 'tz.docx',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            data: Buffer.from('fake').toString('base64'),
            size: 4,
          },
        ],
      },
    ])
    expect(out[0].content).toContain('Текст из Word')
    expect(out[0].content).toContain('Разбери документ')
    expect(out[0].attachments).toBeUndefined()
  })
})