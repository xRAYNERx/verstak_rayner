import { describe, expect, it } from 'vitest'
import {
  SUPPLEMENT_TAG,
  formatSupplementForAgent,
  isSupplementMessage,
  parseSupplementMessage,
} from '../../src/lib/composer-streaming'

describe('composer-streaming', () => {
  it('formatSupplementForAgent wraps trimmed text with tag', () => {
    expect(formatSupplementForAgent('  уточни стиль  ')).toBe(
      `${SUPPLEMENT_TAG}\nуточни стиль`
    )
  })

  it('isSupplementMessage detects tagged content', () => {
    expect(isSupplementMessage(`${SUPPLEMENT_TAG}\nтекст`)).toBe(true)
    expect(isSupplementMessage('обычное сообщение')).toBe(false)
  })

  it('parseSupplementMessage extracts body', () => {
    expect(parseSupplementMessage(`${SUPPLEMENT_TAG}\n  уточни  `)).toEqual({
      tag: SUPPLEMENT_TAG,
      body: 'уточни',
    })
    expect(parseSupplementMessage('не дополнение')).toBeNull()
  })
})