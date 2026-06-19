/** Fenced code block in react-markdown 10 (language tag optional). */
export function isMarkdownCodeBlock(className: string | undefined, text: string): boolean {
  if (/language-/.test(className ?? '')) return true
  return text.includes('\n')
}

export function markdownCodeLanguage(className: string | undefined): string {
  return (className ?? '').replace(/^language-/, '')
}