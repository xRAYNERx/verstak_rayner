import { SYSTEM_LAYER_PROMPT, SYSTEM_LAYER_VERSION } from './system-layer'
import type { UserLayer } from './user-layer'

export interface ComposedPrompt {
  /** Final string to put in the API's `system` field (or system message). */
  system: string
  /** Metadata for telemetry / UI. */
  meta: {
    systemLayerVersion: string
    userLayerPath: string | null
    userLayerBytes: number
  }
}

export function composeSystemPrompt(userLayer: UserLayer): ComposedPrompt {
  const trimmedUser = userLayer.content.trim()
  const system = trimmedUser
    ? `${SYSTEM_LAYER_PROMPT}\n\n<user_layer source="${userLayer.path}">\n${trimmedUser}\n</user_layer>`
    : SYSTEM_LAYER_PROMPT

  return {
    system,
    meta: {
      systemLayerVersion: SYSTEM_LAYER_VERSION,
      userLayerPath: userLayer.path,
      userLayerBytes: trimmedUser.length
    }
  }
}
