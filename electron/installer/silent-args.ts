export type SilentInstallArgs = {
  silent: boolean
  installDir: string | null
  restart: boolean
}

function stripQuotes(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

/** CLI: --silent --install-dir=C:\...\Verstak --restart (пробрасывается portable NSIS). */
export function parseSilentInstallArgs(argv: string[]): SilentInstallArgs {
  let silent = false
  let installDir: string | null = null
  let restart = false

  for (const raw of argv) {
    const arg = raw.trim()
    if (arg === '--silent' || arg === '/silent') silent = true
    else if (arg === '--restart') restart = true
    else if (arg.startsWith('--install-dir=')) {
      installDir = stripQuotes(arg.slice('--install-dir='.length))
    }
  }

  return { silent, installDir, restart }
}