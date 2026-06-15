import { ipcMain } from 'electron'
import {
  getProjectMap,
  getDependencyMap,
  warmProjectMaps,
  type ProjectMap,
  type DependencyMap
} from '../ai/project-map'
import { isWithinKnownRoots } from '../ai/path-policy'

/**
 * IPC для фичи «Карта проекта»: фоновый прогрев на открытии + чтение карт
 * панелью Карта.
 *
 *   project-map:warm  → фоновый прогрев обеих карт (не ждёт построения, кэш
 *                       прогреется к первому ai:send / открытию панели).
 *   project-map:get   → ProjectMap (дерево + символы) из тёплого кэша.
 *   project-map:deps  → DependencyMap (граф imports/importedBy/exports).
 *
 * warm также дёргается на сервере в projects:set-current (см. projects.ts),
 * поэтому отдельный renderer-вызов не обязателен — но оставлен для явного
 * «Обновить» из панели и на случай ранних подписчиков.
 */
export function registerProjectMapIpc(getKnownRoots: () => string[] = () => []): void {
  // Фоновый прогрев. Идемпотентно (warmProjectMaps делит in-flight промис).
  // Не ждём построения — возвращаемся сразу, чтобы не блокировать UI/смену проекта.
  ipcMain.handle('project-map:warm', (_e, root: string) => {
    if (!root) return { started: false }
    // root приходит из renderer — строим карту только для зарегистрированных
    // проектов, иначе можно просканировать произвольную директорию.
    if (!isWithinKnownRoots(root, getKnownRoots())) return { started: false }
    void warmProjectMaps(root).catch(() => { /* фон — ошибки глотаем */ })
    return { started: true }
  })

  ipcMain.handle('project-map:get', async (_e, root: string, refresh = false): Promise<ProjectMap | null> => {
    if (!root) return null
    if (!isWithinKnownRoots(root, getKnownRoots())) return null
    try {
      return await getProjectMap(root, refresh)
    } catch {
      return null
    }
  })

  ipcMain.handle('project-map:deps', async (_e, root: string, refresh = false): Promise<DependencyMap | null> => {
    if (!root) return null
    if (!isWithinKnownRoots(root, getKnownRoots())) return null
    try {
      return await getDependencyMap(root, refresh)
    } catch {
      return null
    }
  })
}
