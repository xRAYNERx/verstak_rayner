/** Заголовки-заглушки — заменяем на смысл первого сообщения пользователя. */
const GENERIC_TITLES = new Set([
  'новый чат',
  'new chat',
  'основной чат',
  'main chat',
  'параллельный чат',
  'parallel chat',
  'чат',
  'chat',
])

export function isGenericChatTitle(title: string): boolean {
  const norm = title.trim().toLowerCase()
  return !norm || GENERIC_TITLES.has(norm)
}

const MAX_TITLE_LEN = 52

/** Короткое русскоязычное имя ветки из первого запроса пользователя. */
export function titleFromFirstMessage(text: string): string | null {
  const raw = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const line = (raw.split('\n').find(l => l.trim()) ?? '').trim()
  if (!line) return null

  let title = line
    .replace(/^[@/#]+\s*/, '')
    .replace(/[?!.…]+$/u, '')
    .trim()
  if (!title) return null

  if (title.length > MAX_TITLE_LEN) {
    const cut = title.slice(0, MAX_TITLE_LEN)
    const lastSpace = cut.lastIndexOf(' ')
    title = (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trim() + '…'
  }

  return title.charAt(0).toUpperCase() + title.slice(1)
}