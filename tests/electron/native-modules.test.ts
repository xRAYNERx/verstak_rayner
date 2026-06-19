import { describe, expect, it } from 'vitest'
import {
  isNativeModuleError,
  probeBetterSqlite3Node,
} from '../../electron/native-modules'

describe('native-modules', () => {
  it('probeBetterSqlite3Node returns missing for absent path', () => {
    expect(probeBetterSqlite3Node('Z:\\no-such\\better_sqlite3.node')).toBe('missing')
  })

  it('isNativeModuleError detects ABI mismatch text', () => {
    expect(
      isNativeModuleError(
        'The module was compiled against a different NODE_MODULE_VERSION',
      ),
    ).toBe(true)
    expect(isNativeModuleError('database is locked')).toBe(false)
  })
})