import { describe, it, expect } from 'vitest'
import { assertGitAllowed } from '../../electron/ipc/git'

/**
 * Денилист git-write (Dev Task Flow, Фаза 3) — гарантия, что обёртка git-вызова
 * блокирует деструктив/сеть ДО запуска процесса (CLAUDE.md: git-write только
 * argv-форма + денилист push/force/reset, commit без --no-verify).
 *
 * assertGitAllowed — чистая функция, тестируется без git/окружения.
 */
describe('assertGitAllowed (git-write денилист)', () => {
  describe('блокирует запрещённое (бросает)', () => {
    it('push', () => {
      expect(() => assertGitAllowed(['push', 'origin', 'main'])).toThrow(/push/)
    })
    it('push --force', () => {
      expect(() => assertGitAllowed(['push', '--force'])).toThrow()
    })
    it('--force в любом subcommand', () => {
      expect(() => assertGitAllowed(['checkout', '--force', 'main'])).toThrow(/force/)
    })
    it('-f (short force)', () => {
      expect(() => assertGitAllowed(['checkout', '-f', 'main'])).toThrow()
    })
    it('reset --hard', () => {
      // Отсекается по флагу --hard (и дополнительно по паре reset+--hard).
      expect(() => assertGitAllowed(['reset', '--hard', 'HEAD~1'])).toThrow(/hard/)
    })
    it('clean -fd', () => {
      expect(() => assertGitAllowed(['clean', '-fd'])).toThrow(/clean/)
    })
    it('clean (любой)', () => {
      expect(() => assertGitAllowed(['clean', '-n'])).toThrow(/clean/)
    })
    it('--no-verify (обход хуков)', () => {
      expect(() => assertGitAllowed(['commit', '-m', 'x', '--no-verify'])).toThrow(/no-verify/)
    })
    it('--amend (переписывание коммита)', () => {
      expect(() => assertGitAllowed(['commit', '--amend', '-m', 'x'])).toThrow(/amend/)
    })
    it('rebase', () => {
      expect(() => assertGitAllowed(['rebase', '-i', 'HEAD~3'])).toThrow(/rebase/)
    })
    it('filter-branch', () => {
      expect(() => assertGitAllowed(['filter-branch', '--all'])).toThrow()
    })
    it('fetch / pull / remote (сеть)', () => {
      expect(() => assertGitAllowed(['fetch'])).toThrow()
      expect(() => assertGitAllowed(['pull'])).toThrow()
      expect(() => assertGitAllowed(['remote', 'add', 'x', 'y'])).toThrow()
    })
    it('branch -D (force delete)', () => {
      expect(() => assertGitAllowed(['branch', '-D', 'feature'])).toThrow()
    })
  })

  describe('пропускает разрешённое (не бросает)', () => {
    it('status', () => {
      expect(() => assertGitAllowed(['status', '--porcelain=v1', '--branch'])).not.toThrow()
    })
    it('diff', () => {
      expect(() => assertGitAllowed(['diff', '--numstat'])).not.toThrow()
    })
    it('log', () => {
      expect(() => assertGitAllowed(['log', '-n20'])).not.toThrow()
    })
    it('add -- paths', () => {
      expect(() => assertGitAllowed(['add', '--', 'src/foo.ts'])).not.toThrow()
    })
    it('commit -m', () => {
      expect(() => assertGitAllowed(['commit', '-m', 'feat: x'])).not.toThrow()
    })
    it('checkout -b (создание ветки)', () => {
      expect(() => assertGitAllowed(['checkout', '-b', 'verstak/task-123'])).not.toThrow()
    })
    it('checkout существующей ветки', () => {
      expect(() => assertGitAllowed(['checkout', 'verstak/task-123'])).not.toThrow()
    })
    it('rev-parse HEAD', () => {
      expect(() => assertGitAllowed(['rev-parse', 'HEAD'])).not.toThrow()
    })
    it('branch --list', () => {
      expect(() => assertGitAllowed(['branch', '--list', 'main'])).not.toThrow()
    })
  })
})
