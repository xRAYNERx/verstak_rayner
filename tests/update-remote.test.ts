import { describe, expect, it } from 'vitest'
import {
  cleanReleaseBody,
  isBenignUpdaterError,
  maxSemver,
  normalizeVersion,
  parseLatestYmlArtifact,
  releaseFeedBase,
  semverGt,
} from '../electron/update-remote'

describe('update-remote semver', () => {
  it('normalizeVersion strips v prefix', () => {
    expect(normalizeVersion('v1.3.1')).toBe('1.3.1')
  })

  it('semverGt compares patch versions', () => {
    expect(semverGt('1.3.1', '1.3.0')).toBe(true)
    expect(semverGt('1.3.0', '1.3.1')).toBe(false)
    expect(semverGt('1.3.0', '1.3.0')).toBe(false)
  })

  it('maxSemver picks highest', () => {
    expect(maxSemver(['v1.2.0', 'v1.3.1', 'v1.3.0'])).toBe('1.3.1')
  })

  it('releaseFeedBase builds tag download url', () => {
    expect(releaseFeedBase('1.3.1')).toBe(
      'https://github.com/frolofpavel/verstak/releases/download/v1.3.1',
    )
  })
})

describe('cleanReleaseBody', () => {
  it('strips install footer after horizontal rule', () => {
    const raw = '## Verstak 1.4.0\n\n- Feature A\n\n---\nУстановка: setup.exe'
    expect(cleanReleaseBody(raw)).toBe('## Verstak 1.4.0\n\n- Feature A')
  })
})

describe('parseLatestYmlArtifact', () => {
  it('parses path, sha512 and size', () => {
    const yml = `version: 1.5.7
files:
  - url: Verstak-Setup-1.5.7-x64.exe
    sha512: abc==
    size: 253272554
path: Verstak-Setup-1.5.7-x64.exe
sha512: abc==
`
    expect(parseLatestYmlArtifact(yml, '1.5.7')).toEqual({
      version: '1.5.7',
      fileName: 'Verstak-Setup-1.5.7-x64.exe',
      sha512: 'abc==',
      size: 253272554,
    })
  })
})

describe('isBenignUpdaterError', () => {
  it('treats missing latest.yml as benign', () => {
    expect(isBenignUpdaterError('Cannot find latest.yml in the latest release')).toBe(true)
  })

  it('keeps unexpected errors', () => {
    expect(isBenignUpdaterError('disk full')).toBe(false)
  })
})