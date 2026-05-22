import type { Database } from 'better-sqlite3'

export interface SafeStorageLike {
  isEncryptionAvailable: () => boolean
  encryptString: (plaintext: string) => Buffer
  decryptString: (encrypted: Buffer) => string
}

export interface Settings {
  getSecret: (key: string) => string | null
  setSecret: (key: string, value: string) => void
}

export function createSettings(db: Database, safe: SafeStorageLike): Settings {
  const stmtGet = db.prepare('SELECT value FROM settings WHERE key = ?')
  const stmtSet = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  )
  return {
    getSecret(key) {
      const row = stmtGet.get(key) as { value: string } | undefined
      if (!row) return null
      const buf = Buffer.from(row.value, 'base64')
      return safe.decryptString(buf)
    },
    setSecret(key, value) {
      const encrypted = safe.encryptString(value).toString('base64')
      stmtSet.run(key, encrypted)
    }
  }
}
