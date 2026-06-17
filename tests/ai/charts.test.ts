import { describe, it, expect } from 'vitest'
import { renderChartSvg } from '../../electron/ai/charts'

describe('renderChartSvg', () => {
  it('bar chart создаёт валидный SVG с rect элементами', () => {
    const svg = renderChartSvg({
      kind: 'bar',
      title: 'Тест',
      labels: ['Янв', 'Фев', 'Мар'],
      values: [10, 20, 15]
    })
    expect(svg).toContain('<svg')
    expect(svg).toContain('</svg>')
    expect(svg).toContain('<rect')
    expect(svg.match(/<rect/g)?.length).toBeGreaterThanOrEqual(4)  // 3 bars + bg
    expect(svg).toContain('Тест')
    expect(svg).toContain('Янв')
  })

  it('line chart создаёт path и circles', () => {
    const svg = renderChartSvg({
      kind: 'line',
      labels: ['A', 'B', 'C', 'D'],
      values: [5, 10, 7, 15]
    })
    expect(svg).toContain('<path')
    expect(svg.match(/<circle/g)?.length).toBe(4)
  })

  it('pie chart создаёт slices с процентами', () => {
    const svg = renderChartSvg({
      kind: 'pie',
      labels: ['Директ', 'SEO', 'Авито'],
      values: [50, 30, 20]
    })
    expect(svg.match(/<path/g)?.length).toBe(3)
    expect(svg).toContain('50%')
    expect(svg).toContain('30%')
    expect(svg).toContain('20%')
  })

  it('возвращает error SVG если labels и values не совпадают', () => {
    const svg = renderChartSvg({ kind: 'bar', labels: ['A'], values: [] })
    expect(svg).toContain('⚠')
  })

  it('экранирует HTML спецсимволы в подписях', () => {
    const svg = renderChartSvg({
      kind: 'bar',
      title: '<script>',
      labels: ['a&b'],
      values: [1]
    })
    expect(svg).not.toContain('<script>')
    expect(svg).toContain('&lt;script')
    expect(svg).toContain('a&amp;b')
  })

  it('форматирует большие числа сокращённо (K, M)', () => {
    const svg = renderChartSvg({
      kind: 'bar',
      labels: ['Big'],
      values: [2_500_000]
    })
    expect(svg).toContain('2.5M')
  })

  // B3: негативный бар раньше рисовался от низа вниз → уходил за нижний край viewBox.
  it('bar chart с отрицательным значением держит бар внутри viewBox', () => {
    const svg = renderChartSvg({ kind: 'bar', labels: ['x'], values: [-10] })
    const m = svg.match(/<rect x="[\d.]+" y="([\d.]+)"[^>]*height="([\d.]+)"/)
    expect(m).not.toBeNull()
    const y = parseFloat(m![1]); const height = parseFloat(m![2])
    expect(y + height).toBeLessThanOrEqual(360) // h по умолчанию
    expect(y).toBeGreaterThanOrEqual(0)
  })

  it('bar chart с положительными значениями не регрессировал (бары внутри viewBox)', () => {
    const svg = renderChartSvg({ kind: 'bar', labels: ['a', 'b'], values: [10, 20] })
    const rects = [...svg.matchAll(/<rect x="[\d.]+" y="([\d.]+)"[^>]*height="([\d.]+)"/g)]
    for (const r of rects) {
      const y = parseFloat(r[1]); const height = parseFloat(r[2])
      expect(y + height).toBeLessThanOrEqual(360)
    }
  })

  // B6: отрицательное значение давало обратную дугу и «-25%».
  it('pie chart с отрицательным значением → ошибка, без отрицательного процента', () => {
    const svg = renderChartSvg({ kind: 'pie', labels: ['a', 'b', 'c'], values: [10, -5, 15] })
    expect(svg).not.toMatch(/-\d+%/)
    expect(svg).toContain('не могут быть отрицательными')
  })
})
