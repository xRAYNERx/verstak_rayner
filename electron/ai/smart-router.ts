/**
 * Smart Model Router — оценивает сложность задачи и рекомендует модель.
 *
 * При effortLevel='standard' и отсутствии явного выбора модели пользователем
 * маршрутизатор выбирает дешёвую модель для простых запросов и мощную для
 * сложных. Это снижает стоимость при сохранении качества.
 */

import type { ChatMessage } from './types'

export type TaskComplexity = 'simple' | 'moderate' | 'complex'

/**
 * Оценивает сложность задачи по последнему сообщению пользователя
 * и истории вызовов инструментов.
 */
export function estimateComplexity(messages: ChatMessage[], toolHistory: string[]): TaskComplexity {
  const lastUser = messages.filter(m => m.role === 'user').pop()
  if (!lastUser) return 'simple'

  const text = lastUser.content.toLowerCase()
  const len = text.length

  // Простые: короткие вопросы без сигналов сложной работы
  if (
    len < 100 &&
    !text.includes('refactor') &&
    !text.includes('fix') &&
    !text.includes('implement') &&
    !text.includes('create') &&
    !text.includes('build')
  ) return 'simple'

  // Сложные: длинные промпты или несколько сигналов сложной работы
  const complexSignals = [
    'refactor', 'architect', 'redesign', 'migrate', 'rewrite',
    'implement', 'build', 'create', 'test', 'debug', 'optimize'
  ]
  const complexCount = complexSignals.filter(s => text.includes(s)).length

  if (complexCount >= 2 || len > 500 || toolHistory.length > 5) return 'complex'

  return 'moderate'
}

/**
 * Рекомендует модель для данного провайдера и уровня сложности.
 * Возвращает null если провайдер не покрыт маппингом.
 */
export function recommendModel(providerId: string, complexity: TaskComplexity): string | null {
  const MAP: Record<string, Record<TaskComplexity, string>> = {
    'gemini-api': {
      simple: 'gemini-2.0-flash',
      moderate: 'gemini-2.5-flash-preview-05-20',
      complex: 'gemini-2.5-pro-preview-06-05',
    },
    'claude': {
      simple: 'claude-haiku-4-5',
      moderate: 'claude-sonnet-4-6',
      complex: 'claude-opus-4-5',
    },
    'openai': {
      simple: 'gpt-4o-mini',
      moderate: 'gpt-4o',
      complex: 'o3',
    },
    'grok': {
      simple: 'grok-3-mini-fast',
      moderate: 'grok-3-mini-fast',
      complex: 'grok-3',
    },
  }
  return MAP[providerId]?.[complexity] ?? null
}

/** Человекочитаемая метка для info-события. */
export function complexityLabel(complexity: TaskComplexity): string {
  switch (complexity) {
    case 'simple': return 'Simple task'
    case 'moderate': return 'Moderate task'
    case 'complex': return 'Complex task'
  }
}
