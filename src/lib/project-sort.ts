export type ProjectNameSortGroup = 0 | 1 | 2

/** 0 = кириллица, 1 = латиница, 2 = прочее */
export function projectNameSortGroup(name: string): ProjectNameSortGroup {
  const first = name.trim().charAt(0)
  if (!first) return 2
  if (/[а-яёА-ЯЁ]/.test(first)) return 0
  if (/[a-zA-Z]/.test(first)) return 1
  return 2
}

export function compareProjectNames(a: string, b: string): number {
  const ga = projectNameSortGroup(a)
  const gb = projectNameSortGroup(b)
  if (ga !== gb) return ga - gb

  const locale = ga === 0 ? 'ru' : ga === 1 ? 'en' : undefined
  return a.localeCompare(b, locale, { sensitivity: 'base' })
}

export function sortProjectsByName<T extends { name: string; path: string }>(list: T[]): T[] {
  return [...list].sort(
    (a, b) => compareProjectNames(a.name, b.name) || a.path.localeCompare(b.path)
  )
}