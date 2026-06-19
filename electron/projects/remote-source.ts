/**
 * Источник проекта — куда «ходит» Verstak. Парсит ввод пользователя (URL/адрес)
 * в одну из двух моделей:
 *
 *  - git   → клонируем репозиторий локально, работаем на копии, push/PR обратно
 *            (Вариант A). Для GitHub/Git-репозиториев с кодом.
 *  - ssh   → файлы живут на удалённом сервере, агент правит ИХ напрямую по ssh
 *            (Вариант B). Для сайтов/серверов без git (напр. user@host:/var/www/site).
 *
 * Чистая логика — без сети/fs. Запуск clone и ssh-операций — отдельно.
 */

export type RemoteSource =
  | { kind: 'git'; cloneUrl: string; name: string }
  | { kind: 'ssh'; user: string | null; host: string; remotePath: string; name: string }

export interface RemoteSourceError {
  error: string
}

/** Последний сегмент пути/репо → имя проекта (без .git). */
function lastSegmentName(s: string): string {
  const cleaned = s.replace(/\.git$/i, '').replace(/[\\/]+$/, '')
  const seg = cleaned.split(/[\\/]/).filter(Boolean).pop() ?? ''
  return seg || 'remote'
}

/**
 * Разобрать ввод в источник.
 *  - `https://github.com/owner/repo[.git]`        → git
 *  - `git@host:owner/repo.git`                    → git (ssh-транспорт git)
 *  - `user@host:/abs/path` или `user@host:~/path` → ssh (live, путь абсолютный/домашний)
 *  - `host:/abs/path` (без user)                  → ssh
 */
export function parseRemoteSource(input: string): RemoteSource | RemoteSourceError {
  const raw = (input ?? '').trim()
  if (!raw) return { error: 'Пустой адрес' }

  // 1. https(s) git URL → клон.
  if (/^https?:\/\//i.test(raw)) {
    if (!/[^/]+\/[^/]+/.test(raw.replace(/^https?:\/\/[^/]+\//i, ''))) {
      return { error: 'Похоже на URL, но не на git-репозиторий (ожидается …/owner/repo)' }
    }
    return { kind: 'git', cloneUrl: raw, name: lastSegmentName(raw) }
  }

  // 2. scp-подобный адрес `[user@]host:path`.
  const scp = /^(?:([^@\s]+)@)?([^@:\s]+):(.+)$/.exec(raw)
  if (scp) {
    const user = scp[1] ?? null
    const host = scp[2]
    const path = scp[3]
    // Абсолютный (/...) или домашний (~...) путь → это файлы на сервере (ssh-live, B).
    if (/^[/~]/.test(path)) {
      return { kind: 'ssh', user, host, remotePath: path, name: lastSegmentName(path) }
    }
    // Иначе `owner/repo[.git]` → это git-репозиторий по ssh-транспорту (A).
    return { kind: 'git', cloneUrl: raw, name: lastSegmentName(path) }
  }

  return { error: 'Не распознан: дай https-URL репозитория, git@host:owner/repo.git или user@host:/путь' }
}

/** true если разбор успешен (для сужения типа). */
export function isRemoteSource(r: RemoteSource | RemoteSourceError): r is RemoteSource {
  return !('error' in r)
}
