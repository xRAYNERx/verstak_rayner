import { describe, it, expect } from 'vitest'
import { dedupAccumulatedText } from '../../electron/ai/gemini-cli'

/**
 * Аудит M7: gemini-cli шлёт accumulated-текст (полный с начала). Дедуп должен
 * эмитить только новый хвост, иначе чат = нарастающие повторы.
 */
describe('dedupAccumulatedText (gemini-cli M7)', () => {
  it('accumulated-стрим: эмитит только дельту', () => {
    let prev = ''
    const out: string[] = []
    for (const full of ['Привет', 'Привет, мир', 'Привет, мир!']) {
      const { delta, next } = dedupAccumulatedText(prev, full)
      prev = next
      if (delta) out.push(delta)
    }
    expect(out.join('')).toBe('Привет, мир!') // склейка = финал, без повторов
    expect(out).toEqual(['Привет', ', мир', '!'])
  })

  it('одно финальное сообщение (не стрим): эмитит целиком один раз', () => {
    const { delta, next } = dedupAccumulatedText('', 'Готовый ответ')
    expect(delta).toBe('Готовый ответ')
    expect(next).toBe('Готовый ответ')
  })

  it('delta-style независимые чанки: каждый эмитится как есть', () => {
    let prev = ''
    const out: string[] = []
    for (const chunk of ['раз ', 'два ', 'три']) {
      const { delta, next } = dedupAccumulatedText(prev, chunk)
      prev = next
      out.push(delta)
    }
    expect(out).toEqual(['раз ', 'два ', 'три'])
    expect(out.join('')).toBe('раз два три')
  })

  it('повторное одинаковое сообщение → пустая дельта (нет дубля)', () => {
    const { delta } = dedupAccumulatedText('Привет', 'Привет')
    expect(delta).toBe('')
  })
})
