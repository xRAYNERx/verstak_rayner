import { describe, it, expect } from 'vitest'
import { parseReviewFindings, composeFixPrompt, type ReviewFinding } from '../../src/lib/review-findings'

describe('parseReviewFindings', () => {
  it('валидный ```json блок → findings', () => {
    const content = `ЗАМЕЧАНИЙ: 2

1. **NPE при пустом массиве** — критичность: high
2. **Нет теста на ошибку** — критичность: low

\`\`\`json
[
  {
    "id": "f1",
    "file": "src/store/projectStore.ts",
    "line": 152,
    "endLine": 160,
    "severity": "P0",
    "category": "bug",
    "title": "NPE при пустом массиве",
    "detail": "messages[0] без проверки длины.",
    "suggestedFix": "Добавить guard на messages.length."
  },
  {
    "id": "f2",
    "file": "tests/x.test.ts",
    "line": 10,
    "severity": "P3",
    "category": "missing-test",
    "title": "Нет теста на ошибку"
  }
]
\`\`\``
    const findings = parseReviewFindings(content)
    expect(findings).toHaveLength(2)
    expect(findings[0]).toMatchObject({
      id: 'f1',
      file: 'src/store/projectStore.ts',
      line: 152,
      endLine: 160,
      severity: 'P0',
      category: 'bug',
      title: 'NPE при пустом массиве',
      suggestedFix: 'Добавить guard на messages.length.'
    })
    expect(findings[1].severity).toBe('P3')
    expect(findings[1].category).toBe('missing-test')
    expect(findings[1].endLine).toBeUndefined()
    expect(findings[1].suggestedFix).toBeUndefined()
  })

  it('нет json-блока → fallback на старый текстовый формат', () => {
    const content = `ЗАМЕЧАНИЙ: 1

1. **Утечка ресурса** — критичность: high
   electron/ai/tools.ts:88: файл не закрывается в catch.`
    const findings = parseReviewFindings(content)
    expect(findings).toHaveLength(1)
    expect(findings[0].title).toBe('Утечка ресурса')
    expect(findings[0].severity).toBe('P0') // high → P0
    expect(findings[0].file).toBe('electron/ai/tools.ts')
    expect(findings[0].line).toBe(88)
  })

  it('чистое ревью без замечаний → пустой массив', () => {
    const content = 'ЗАМЕЧАНИЙ: 0\n\nЧисто. Логика корректна, edge cases покрыты.'
    expect(parseReviewFindings(content)).toEqual([])
  })

  it('битый json внутри блока → не падает, fallback на текст', () => {
    const content = `ЗАМЕЧАНИЙ: 1

1. **Баг** — критичность: medium
   src/a.ts:5: что-то не так.

\`\`\`json
[ { "id": "f1", "file": "src/a.ts",  <-- битый
\`\`\``
    expect(() => parseReviewFindings(content)).not.toThrow()
    const findings = parseReviewFindings(content)
    // битый json → fallback на текстовый «1. **Баг**»
    expect(findings).toHaveLength(1)
    expect(findings[0].title).toBe('Баг')
    expect(findings[0].severity).toBe('P1') // medium → P1
  })

  it('json с невалидными элементами отфильтровывает их', () => {
    const content = `\`\`\`json
[
  { "id": "ok", "file": "a.ts", "line": 1, "severity": "P1", "category": "bug", "title": "Ок" },
  { "id": "bad-sev", "file": "b.ts", "line": 2, "severity": "P9", "category": "bug", "title": "Плохая severity" },
  { "id": "bad-cat", "file": "c.ts", "line": 3, "severity": "P1", "category": "wtf", "title": "Плохая категория" },
  { "id": "no-file", "line": 4, "severity": "P1", "category": "bug", "title": "Нет файла" }
]
\`\`\``
    const findings = parseReviewFindings(content)
    expect(findings).toHaveLength(1)
    expect(findings[0].id).toBe('ok')
  })

  it('пустая строка → пустой массив', () => {
    expect(parseReviewFindings('')).toEqual([])
  })

  it('line как строка нормализуется в число', () => {
    const content = `\`\`\`json
[{ "id": "f1", "file": "a.ts", "line": "42", "severity": "P2", "category": "UX", "title": "T" }]
\`\`\``
    const findings = parseReviewFindings(content)
    expect(findings[0].line).toBe(42)
  })
})

describe('composeFixPrompt', () => {
  const sample: ReviewFinding[] = [
    {
      id: 'f1',
      file: 'src/a.ts',
      line: 10,
      endLine: 14,
      severity: 'P0',
      category: 'bug',
      title: 'NPE',
      detail: 'a[0] без guard.',
      suggestedFix: 'Добавить проверку длины.'
    },
    {
      id: 'f2',
      file: 'src/b.ts',
      line: 0,
      severity: 'P2',
      category: 'UX',
      title: 'Нет лоадера',
      detail: ''
    }
  ]

  it('собирает промпт со списком принятых findings', () => {
    const prompt = composeFixPrompt(sample)
    expect(prompt).toContain('Исправь ТОЛЬКО эти замечания')
    expect(prompt).toContain('src/a.ts:10-14')
    expect(prompt).toContain('[P0/bug] NPE')
    expect(prompt).toContain('a[0] без guard.')
    expect(prompt).toContain('как чинить: Добавить проверку длины.')
    // finding без line → только файл, без двоеточия-строки
    expect(prompt).toContain('src/b.ts [P2/UX] Нет лоадера')
    expect(prompt).not.toContain('src/b.ts:0')
  })

  it('пустой список → пустая строка', () => {
    expect(composeFixPrompt([])).toBe('')
  })
})
