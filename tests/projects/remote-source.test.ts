import { describe, it, expect } from 'vitest'
import { parseRemoteSource, isRemoteSource, remoteProjectPath, type RemoteSource } from '../../electron/projects/remote-source'

describe('parseRemoteSource', () => {
  it('https GitHub → git clone', () => {
    const r = parseRemoteSource('https://github.com/frolofpavel/verstak')
    expect(isRemoteSource(r) && r.kind).toBe('git')
    if (isRemoteSource(r) && r.kind === 'git') {
      expect(r.cloneUrl).toBe('https://github.com/frolofpavel/verstak')
      expect(r.name).toBe('verstak')
    }
  })

  it('https с .git → имя без .git', () => {
    const r = parseRemoteSource('https://github.com/owner/my-repo.git')
    expect(isRemoteSource(r) && r.kind === 'git' && r.name).toBe('my-repo')
  })

  it('git@host:owner/repo.git → git (ssh-транспорт)', () => {
    const r = parseRemoteSource('git@github.com:owner/repo.git')
    expect(isRemoteSource(r) && r.kind).toBe('git')
    if (isRemoteSource(r) && r.kind === 'git') expect(r.name).toBe('repo')
  })

  it('user@host:/abs/path → ssh-live (B)', () => {
    const r = parseRemoteSource('root@agi-iri.ru:/var/www/agi-iri.ru')
    expect(isRemoteSource(r) && r.kind).toBe('ssh')
    if (isRemoteSource(r) && r.kind === 'ssh') {
      expect(r.user).toBe('root')
      expect(r.host).toBe('agi-iri.ru')
      expect(r.remotePath).toBe('/var/www/agi-iri.ru')
      expect(r.name).toBe('agi-iri.ru')
    }
  })

  it('user@host:~/site → ssh-live (домашний путь)', () => {
    const r = parseRemoteSource('deploy@server:~/sites/blog')
    expect(isRemoteSource(r) && r.kind).toBe('ssh')
    if (isRemoteSource(r) && r.kind === 'ssh') {
      expect(r.remotePath).toBe('~/sites/blog')
      expect(r.name).toBe('blog')
    }
  })

  it('host:/path без user → ssh, user=null', () => {
    const r = parseRemoteSource('agi-iri.ru:/var/www')
    expect(isRemoteSource(r) && r.kind === 'ssh' && r.user).toBeNull()
  })

  it('мусор → ошибка', () => {
    expect(isRemoteSource(parseRemoteSource(''))).toBe(false)
    expect(isRemoteSource(parseRemoteSource('просто текст'))).toBe(false)
    expect(isRemoteSource(parseRemoteSource('https://github.com/'))).toBe(false)
  })

  it('remoteProjectPath: git → папка клона, ssh → ssh:// id', () => {
    const git: RemoteSource = { kind: 'git', cloneUrl: 'x', name: 'verstak' }
    expect(remoteProjectPath(git, '/home/.verstak/projects')).toBe('/home/.verstak/projects/verstak')
    const ssh: RemoteSource = { kind: 'ssh', user: 'root', host: 'agi-iri.ru', remotePath: '/var/www/agi-iri.ru', name: 'agi-iri.ru' }
    expect(remoteProjectPath(ssh, '/x')).toBe('ssh://root@agi-iri.ru/var/www/agi-iri.ru')
    const sshNoUser: RemoteSource = { kind: 'ssh', user: null, host: 'srv', remotePath: '~/site', name: 'site' }
    expect(remoteProjectPath(sshNoUser, '/x')).toBe('ssh://srv/~/site')
  })
})
