import { describe, it, expect } from 'vitest'
import { rowsToValues2d, tokenCacheHit } from '../../electron/connectors/gsheets'

describe('rowsToValues2d (#16: позиционный массив → не пустые ячейки)', () => {
  const headers = ['Name', 'Age', 'City']

  it('объект {column: value} мапится по заголовкам', () => {
    expect(rowsToValues2d([{ Name: 'Alice', Age: '30', City: 'NYC' }], headers))
      .toEqual([['Alice', '30', 'NYC']])
  })

  it('позиционный массив мапится по индексу (раньше давал пустые ячейки)', () => {
    expect(rowsToValues2d([['Alice', '30', 'NYC']], headers))
      .toEqual([['Alice', '30', 'NYC']])
  })

  it('недостающие ключи/индексы → пустая строка', () => {
    expect(rowsToValues2d([{ Name: 'Bob' }], headers)).toEqual([['Bob', '', '']])
    expect(rowsToValues2d([['Bob']], headers)).toEqual([['Bob', '', '']])
  })
})

describe('tokenCacheHit (#13: кэш токена по service account)', () => {
  const sa = { client_email: 'a@proj.iam.gserviceaccount.com' }
  const now = 1_000_000

  it('тот же SA и не истёк → hit', () => {
    expect(tokenCacheHit({ token: 't', expiresAt: now + 1000, clientEmail: sa.client_email }, sa, now)).toBe(true)
  })

  it('ДРУГОЙ SA → miss (после ротации креда не отдаём чужой токен)', () => {
    expect(tokenCacheHit({ token: 't', expiresAt: now + 1000, clientEmail: 'b@other.iam.gserviceaccount.com' }, sa, now)).toBe(false)
  })

  it('тот же SA, но истёк → miss', () => {
    expect(tokenCacheHit({ token: 't', expiresAt: now - 1, clientEmail: sa.client_email }, sa, now)).toBe(false)
  })

  it('пустой кэш → miss', () => {
    expect(tokenCacheHit(null, sa, now)).toBe(false)
  })
})
