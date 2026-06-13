import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { buildContextPack } from '../../electron/ai/context-pack'
import { invalidateProjectMap, invalidateDependencyMap, warmProjectMaps } from '../../electron/ai/project-map'

/**
 * Проверяем обогащение context-pack фичей «Карта проекта»:
 *   - в блок инжектятся dependency_hubs (самые импортируемые файлы);
 *   - для хабов добавляются ключевые символы (hub_symbols).
 * Граф зависимостей строится из реальных файлов во временной папке.
 */
describe('context-pack dependency enrichment', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'gg-cpdep-')) })
  afterEach(() => {
    invalidateProjectMap(dir)
    invalidateDependencyMap(dir)
    rmSync(dir, { recursive: true, force: true })
  })

  it('инжектит dependency_hubs и символы хаба в context_pack', async () => {
    mkdirSync(join(dir, 'src'), { recursive: true })
    // utils.ts — хаб: его импортируют три потребителя.
    writeFileSync(join(dir, 'src', 'utils.ts'), `
export function helper() { return 1 }
export class Engine {}
`)
    writeFileSync(join(dir, 'src', 'a.ts'), `import { helper } from './utils'\nexport const a = helper()`)
    writeFileSync(join(dir, 'src', 'b.ts'), `import { helper } from './utils'\nexport const b = helper()`)
    writeFileSync(join(dir, 'src', 'c.ts'), `import { Engine } from './utils'\nexport const c = new Engine()`)

    const pack = await buildContextPack({ projectPath: dir })

    // Хаб-секция присутствует и указывает на utils.ts с числом импортов.
    expect(pack).toContain('dependency_hubs')
    expect(pack).toContain('src/utils.ts')
    // Символы хаба прокинуты (functions/classes из project map).
    expect(pack).toContain('hub_symbols')
    expect(pack).toMatch(/helper|Engine/)
  })

  it('не падает на проекте без межфайловых связей', async () => {
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src', 'lonely.ts'), 'export const x = 1')
    const pack = await buildContextPack({ projectPath: dir })
    // Карта есть, но dependency_hubs отсутствуют (нет importedBy) — секция не добавляется.
    expect(pack).toContain('project_map')
    expect(pack).not.toContain('dependency_hubs')
  })

  it('warmProjectMaps идемпотентен: повторный вызов не падает и кэш тёплый', async () => {
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src', 'm.ts'), `import { helper } from './u'\nexport const m = helper()`)
    writeFileSync(join(dir, 'src', 'u.ts'), 'export function helper() { return 2 }')
    // Параллельные warm'ы делят один промис, оба резолвятся без ошибок.
    await Promise.all([warmProjectMaps(dir), warmProjectMaps(dir)])
    await warmProjectMaps(dir)
    const pack = await buildContextPack({ projectPath: dir })
    expect(pack).toContain('src/u.ts')
  })
})
