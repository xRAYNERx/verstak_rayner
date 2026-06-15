import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import type { ProviderId } from '../hooks/useProvider'
import { isProviderAuthorized, type CliAuthId, type CliAuthStatus } from '../lib/model-catalog'
import type { ProviderDescriptorDTO } from '../types/api'

type CliStatusMap = Partial<Record<CliAuthId, CliAuthStatus>>

interface Props {
  /** Не показывать, пока открыт онбординг или другой полноэкранный шаг. */
  active: boolean
  /** Меняется при закрытии настроек — перепроверить авторизацию. */
  recheckToken?: number
  onOpenModelsSettings: () => void
}

async function hasAnyAuthorizedProvider(): Promise<boolean> {
  const list = await window.api.providers.list()
  const [cliStatus, rawCustomUrl, ...keyRows] = await Promise.all([
    window.api.cliAuth.statusAll().catch(() => null as CliStatusMap | null),
    window.api.settings.getKey('custom_openai_baseurl'),
    ...list.map(async p => ({
      keyVal: p.secretKey ? await window.api.settings.getKey(p.secretKey) : null,
    })),
  ])

  const keys: Record<string, string> = {}
  list.forEach((p, i) => {
    if (p.secretKey && keyRows[i].keyVal) keys[p.secretKey] = keyRows[i].keyVal
  })

  return list.some(p => isProviderAuthorized(
    toProviderLite(p),
    keys,
    cliStatus,
    { customOpenaiBaseUrl: rawCustomUrl ?? '' },
  ))
}

function toProviderLite(p: ProviderDescriptorDTO) {
  return {
    id: p.id as ProviderId,
    name: p.name,
    transport: p.transport,
    supportsTools: p.supportsTools,
    models: p.models,
    defaultModel: p.defaultModel,
    secretKey: p.secretKey,
  }
}

const STARTUP_GRACE_MS = 3000

export function ModelRequiredPrompt({ active, recheckToken = 0, onOpenModelsSettings }: Props) {
  const t = useT()
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [graceElapsed, setGraceElapsed] = useState(false)

  useEffect(() => {
    if (!active) {
      setGraceElapsed(false)
      return
    }
    const timer = window.setTimeout(() => setGraceElapsed(true), STARTUP_GRACE_MS)
    return () => window.clearTimeout(timer)
  }, [active])

  useEffect(() => {
    if (!active || dismissed || !graceElapsed) {
      setVisible(false)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const ok = await hasAnyAuthorizedProvider()
        if (!cancelled) setVisible(!ok)
      } catch {
        if (!cancelled) setVisible(false)
      }
    })()
    return () => { cancelled = true }
  }, [active, dismissed, recheckToken, graceElapsed])

  if (!visible) return null

  return (
    <div className="gg-modal-backdrop" role="dialog" aria-modal="true">
      <div className="gg-modal gg-models-required-modal" onClick={e => e.stopPropagation()}>
        <div className="gg-modal-header">
          <div className="gg-modal-title">{t.modelRequired.title}</div>
          <button
            type="button"
            className="gg-modal-close"
            onClick={() => setDismissed(true)}
            aria-label={t.modelRequired.later}
          >
            ×
          </button>
        </div>
        <div className="gg-modal-body">
          <p className="gg-models-required-text">{t.modelRequired.body}</p>
        </div>
        <div className="gg-modal-footer">
          <button
            type="button"
            className="gg-btn gg-btn-ghost"
            onClick={() => setDismissed(true)}
          >
            {t.modelRequired.later}
          </button>
          <button
            type="button"
            className="gg-btn gg-btn-primary"
            onClick={onOpenModelsSettings}
          >
            {t.modelRequired.openModels}
          </button>
        </div>
      </div>
    </div>
  )
}