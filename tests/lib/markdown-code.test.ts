import { describe, expect, it } from 'vitest'
import { isMarkdownCodeBlock, markdownCodeLanguage } from '../../src/lib/markdown-code'

describe('markdown-code', () => {
  it('treats multiline fence without language as block', () => {
    expect(isMarkdownCodeBlock(undefined, 'line one\nline two')).toBe(true)
  })

  it('treats single-line backtick as inline', () => {
    expect(isMarkdownCodeBlock(undefined, 'inline')).toBe(false)
  })

  it('treats language-tagged fence as block', () => {
    expect(isMarkdownCodeBlock('language-typescript', 'const x = 1')).toBe(true)
    expect(markdownCodeLanguage('language-typescript')).toBe('typescript')
  })
})