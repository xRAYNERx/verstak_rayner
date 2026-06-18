import { describe, expect, it } from 'vitest'
import {
  isAcceptableAttachment,
  isLegacyDoc,
  resolveAttachmentMime,
} from '../src/lib/chat-attachments'

describe('chat-attachments', () => {
  it('принимает .docx по расширению и octet-stream', () => {
    expect(isAcceptableAttachment('application/octet-stream', 'договор.docx')).toBe(true)
    expect(
      isAcceptableAttachment(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'a.docx',
      ),
    ).toBe(true)
  })

  it('отклоняет старый .doc', () => {
    expect(isLegacyDoc('brief.doc')).toBe(true)
    expect(isAcceptableAttachment('application/msword', 'brief.doc')).toBe(false)
    expect(isLegacyDoc('ok.docx')).toBe(false)
  })

  it('resolveAttachmentMime подставляет mime для docx без типа', () => {
    expect(resolveAttachmentMime('', 'file.docx')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
  })
})