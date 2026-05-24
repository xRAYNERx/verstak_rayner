import { useEffect, useMemo, useState } from 'react'
import type { ProviderId } from '../hooks/useProvider'
import { useTheme } from '../hooks/useTheme'
import type { AutonomousStatus } from '../types/api'
import { ProfilesTab } from './ProfilesTab'
import { buildCatalog, connectionStatus, type ConnectionStatus } from '../lib/model-catalog'

interface ProviderConfig {
  id: ProviderId
  name: string
  transport: 'API' | 'CLI'
  description: string
  models: string[]
  defaultModel: string
  secretKey: string | null
  keyHint: string
  keyLink?: { url: string; label: string }
  supportsTools: boolean
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: 'gemini-api',
    name: 'Gemini',
    transport: 'API',
    description: 'Google. Полный агентский режим с tools.',
    models: ['gemini-3-pro', 'gemini-3.5-flash', 'gemini-3-flash', 'gemini-2.5-pro', 'gemini-2.5-flash'],
    defaultModel: 'gemini-3.5-flash',
    secretKey: 'gemini_api_key',
    keyHint: 'AIzaSy…',
    keyLink: { url: 'https://aistudio.google.com', label: 'AI Studio' },
    supportsTools: true
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    transport: 'CLI',
    description: 'Твоя Gemini Ultra подписка через gemini-cli. Без API ключа.',
    models: ['auto', 'gemini-3-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-pro', 'gemini-2.5-flash'],
    defaultModel: 'auto',
    secretKey: null,
    keyHint: '',
    supportsTools: false
  },
  {
    id: 'claude',
    name: 'Claude',
    transport: 'API',
    description: 'Anthropic. Полный агентский режим с tools.',
    models: ['claude-opus-4-5-20251101', 'claude-sonnet-4-5-20251101', 'claude-haiku-4-5-20251101'],
    defaultModel: 'claude-sonnet-4-5-20251101',
    secretKey: 'anthropic_api_key',
    keyHint: 'sk-ant-…',
    keyLink: { url: 'https://console.anthropic.com', label: 'Anthropic Console' },
    supportsTools: true
  },
  {
    id: 'claude-cli',
    name: 'Claude Code',
    transport: 'CLI',
    description: 'Твоя Claude Pro/Max подписка через claude CLI.',
    models: ['auto', 'claude-sonnet-4-6', 'claude-opus-4-5', 'claude-haiku-4-5', 'claude-sonnet-4-5'],
    defaultModel: 'auto',
    secretKey: null,
    keyHint: '',
    supportsTools: false
  },
  {
    id: 'grok',
    name: 'Grok',
    transport: 'API',
    description: 'xAI. Полный агентский режим с tools.',
    models: ['grok-4', 'grok-4-fast', 'grok-3'],
    defaultModel: 'grok-4',
    secretKey: 'xai_api_key',
    keyHint: 'xai-…',
    keyLink: { url: 'https://console.x.ai', label: 'xAI Console' },
    supportsTools: true
  },
  {
    id: 'grok-cli',
    name: 'Grok Build',
    transport: 'CLI',
    description: 'Твоя x.com/SuperGrok подписка через grok CLI.',
    models: ['auto', 'grok-4', 'grok-4-fast', 'grok-code-fast-1', 'grok-3'],
    defaultModel: 'auto',
    secretKey: null,
    keyHint: '',
    supportsTools: false
  },
  {
    id: 'openai',
    name: 'ChatGPT',
    transport: 'API',
    description: 'OpenAI. Полный агентский режим с tools.',
    models: ['gpt-5', 'gpt-5-mini', 'gpt-4o', 'gpt-4o-mini', 'o1', 'o1-mini'],
    defaultModel: 'gpt-5',
    secretKey: 'openai_api_key',
    keyHint: 'sk-…',
    keyLink: { url: 'https://platform.openai.com/api-keys', label: 'OpenAI Platform' },
    supportsTools: true
  },
  {
    id: 'codex-cli',
    name: 'Codex CLI',
    transport: 'CLI',
    description: 'Твоя ChatGPT Plus/Pro подписка через codex CLI.',
    models: ['auto', 'gpt-5-codex', 'gpt-5', 'gpt-5-mini', 'o3', 'o3-mini', 'gpt-4o'],
    defaultModel: 'auto',
    secretKey: null,
    keyHint: '',
    supportsTools: false
  }
]

type Tab = 'appearance' | 'profiles' | 'providers' | 'models' | 'connectors' | 'autonomous'

// Группы для левой sidebar — повторяет OpenCode Desktop структуру.
const TAB_GROUPS: ReadonlyArray<{ title: string; tabs: ReadonlyArray<{ id: Tab; label: string; icon: string }> }> = [
  { title: 'Приложение', tabs: [
    { id: 'appearance', label: 'Внешний вид',  icon: '🎨' },
    { id: 'profiles',   label: 'Профили',      icon: '👤' }
  ] },
  { title: 'Сервер', tabs: [
    { id: 'providers',  label: 'Провайдеры',   icon: '🔌' },
    { id: 'models',     label: 'Модели',       icon: '✨' },
    { id: 'connectors', label: 'Коннекторы',   icon: '🧩' },
    { id: 'autonomous', label: 'Ночной режим', icon: '🌙' }
  ] }
]

function modelKey(providerId: ProviderId, model: string): string {
  return `${providerId}::${model}`
}
function allModelsSet(): Set<string> {
  const s = new Set<string>()
  for (const p of PROVIDERS) {
    for (const m of p.models) s.add(modelKey(p.id, m))
  }
  return s
}

export function Settings({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('providers')
  const [activeProvider, setActiveProvider] = useState<ProviderId>('gemini-api')
  const [keys, setKeys] = useState<Record<string, string>>({})
  const [models, setModels] = useState<Record<string, string>>({})
  const [enabledModels, setEnabledModels] = useState<Set<string>>(new Set())
  const [saved, setSaved] = useState(false)
  const [onec, setOneC] = useState({ url: '', user: '', pass: '' })
  const [autonomous, setAutonomousState] = useState<AutonomousStatus>({
    enabled: false, intervalMin: 30, lastRunAt: null, lastRunSuggestions: 0, lastRunError: null, nextRunAt: null
  })
  const [httpEndpoints, setHttpEndpoints] = useState<Array<{ name: string; base: string; auth: string; paths: string }>>(
    [{ name: '', base: '', auth: '', paths: '' }, { name: '', base: '', auth: '', paths: '' }, { name: '', base: '', auth: '', paths: '' }, { name: '', base: '', auth: '', paths: '' }]
  )
  // V3 — российские коннекторы (раздел 5 плана).
  const [gsheetsJson, setGsheetsJson] = useState('')
  const [telegramBotToken, setTelegramBotToken] = useState('')
  const [telegramWhitelist, setTelegramWhitelist] = useState('')
  const [sshHost, setSshHost] = useState('')
  const [sshKeyPath, setSshKeyPath] = useState('')
  const [bitrixWebhook, setBitrixWebhook] = useState('')
  const [yDirectToken, setYDirectToken] = useState('')
  const [yDirectLogin, setYDirectLogin] = useState('')
  const [skillsServerBase, setSkillsServerBase] = useState('')
  const [claudeOauthToken, setClaudeOauthToken] = useState('')
  const [yDiskToken, setYDiskToken] = useState('')
  const [costCap, setCostCap] = useState('')
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    void (async () => {
      const provider = await window.api.settings.getKey('provider')
      const valid = ['gemini-api', 'gemini-cli', 'claude', 'grok', 'openai'].includes(provider ?? '') ? (provider as ProviderId) : 'gemini-api'
      setActiveProvider(valid)
      const keyVals: Record<string, string> = {}
      const modelVals: Record<string, string> = {}
      for (const p of PROVIDERS) {
        if (p.secretKey) {
          const v = await window.api.settings.getKey(p.secretKey)
          if (v) keyVals[p.secretKey] = v
        }
        let m = await window.api.settings.getKey(`model_${p.id}`)
        // Migration: drop saved model values that aren't in the current list
        // (e.g. gemini-3.5-flash for gemini-cli — alias only works for API)
        if (m && !p.models.includes(m)) {
          await window.api.settings.setKey(`model_${p.id}`, p.defaultModel)
          m = p.defaultModel
        }
        modelVals[p.id] = m ?? p.defaultModel
      }
      setKeys(keyVals)
      setModels(modelVals)
      // 1С connector creds
      const url = await window.api.settings.getKey('onec_base_url')
      const user = await window.api.settings.getKey('onec_username')
      const pass = await window.api.settings.getKey('onec_password')
      setOneC({ url: url ?? '', user: user ?? '', pass: pass ?? '' })
      // HTTP endpoints
      const eps: typeof httpEndpoints = []
      for (let i = 1; i <= 4; i++) {
        eps.push({
          name:  (await window.api.settings.getKey(`http_endpoint_${i}_name`))  ?? '',
          base:  (await window.api.settings.getKey(`http_endpoint_${i}_base`))  ?? '',
          auth:  (await window.api.settings.getKey(`http_endpoint_${i}_auth`))  ?? '',
          paths: (await window.api.settings.getKey(`http_endpoint_${i}_paths`)) ?? ''
        })
      }
      setHttpEndpoints(eps)
      // Autonomous loop status
      try {
        const st = await window.api.autonomous.status()
        setAutonomousState(st)
      } catch { /* ignore */ }
      // V3 коннекторы
      setGsheetsJson((await window.api.settings.getKey('gsheets_service_account_json')) ?? '')
      setTelegramBotToken((await window.api.settings.getKey('telegram_bot_token')) ?? '')
      setTelegramWhitelist((await window.api.settings.getKey('telegram_chat_whitelist')) ?? '')
      setSshHost((await window.api.settings.getKey('ssh_default_host')) ?? '')
      setSshKeyPath((await window.api.settings.getKey('ssh_key_path')) ?? '')
      setBitrixWebhook((await window.api.settings.getKey('bitrix24_webhook_url')) ?? '')
      setYDirectToken((await window.api.settings.getKey('yandex_direct_token')) ?? '')
      setYDirectLogin((await window.api.settings.getKey('yandex_direct_login')) ?? '')
      setSkillsServerBase((await window.api.settings.getKey('skills_server_base')) ?? '')
      setClaudeOauthToken((await window.api.settings.getKey('claude_code_oauth_token')) ?? '')
      setYDiskToken((await window.api.settings.getKey('yandex_disk_token')) ?? '')
      setCostCap((await window.api.settings.getKey('cost_cap_usd_per_session')) ?? '')
      // Какие модели «включены» в picker'е. Пусто = все.
      const em = await window.api.settings.getKey('enabled_models')
      if (em) {
        try {
          const arr = JSON.parse(em) as string[]
          setEnabledModels(Array.isArray(arr) && arr.length > 0 ? new Set(arr) : allModelsSet())
        } catch {
          setEnabledModels(allModelsSet())
        }
      } else {
        setEnabledModels(allModelsSet())
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function save() {
    await window.api.settings.setKey('provider', activeProvider)
    for (const p of PROVIDERS) {
      if (p.secretKey && keys[p.secretKey] !== undefined) {
        await window.api.settings.setKey(p.secretKey, keys[p.secretKey])
      }
      if (models[p.id]) {
        await window.api.settings.setKey(`model_${p.id}`, models[p.id])
      }
    }
    await window.api.settings.setKey('onec_base_url', onec.url)
    await window.api.settings.setKey('onec_username', onec.user)
    await window.api.settings.setKey('onec_password', onec.pass)
    for (let i = 0; i < httpEndpoints.length; i++) {
      const e = httpEndpoints[i]
      await window.api.settings.setKey(`http_endpoint_${i + 1}_name`,  e.name)
      await window.api.settings.setKey(`http_endpoint_${i + 1}_base`,  e.base)
      await window.api.settings.setKey(`http_endpoint_${i + 1}_auth`,  e.auth)
      await window.api.settings.setKey(`http_endpoint_${i + 1}_paths`, e.paths)
    }
    // V3 — российские коннекторы и server skills
    await window.api.settings.setKey('gsheets_service_account_json', gsheetsJson)
    await window.api.settings.setKey('telegram_bot_token', telegramBotToken)
    await window.api.settings.setKey('telegram_chat_whitelist', telegramWhitelist)
    await window.api.settings.setKey('ssh_default_host', sshHost)
    await window.api.settings.setKey('ssh_key_path', sshKeyPath)
    await window.api.settings.setKey('bitrix24_webhook_url', bitrixWebhook)
    await window.api.settings.setKey('yandex_direct_token', yDirectToken)
    await window.api.settings.setKey('yandex_direct_login', yDirectLogin)
    await window.api.settings.setKey('skills_server_base', skillsServerBase)
    await window.api.settings.setKey('claude_code_oauth_token', claudeOauthToken)
    await window.api.settings.setKey('yandex_disk_token', yDiskToken)
    await window.api.settings.setKey('cost_cap_usd_per_session', costCap)
    await window.api.settings.setKey('enabled_models', JSON.stringify([...enabledModels]))
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="gg-modal-backdrop" onClick={onClose}>
      <div className="gg-modal gg-modal-large" onClick={e => e.stopPropagation()}>
        <div className="gg-modal-header">
          <div className="gg-modal-title">Настройки</div>
          <button className="gg-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="gg-settings-shell">
          <aside className="gg-settings-nav" role="tablist" aria-label="Разделы настроек">
            {TAB_GROUPS.map(g => (
              <div key={g.title} className="gg-settings-nav-group">
                <div className="gg-settings-nav-title">{g.title}</div>
                {g.tabs.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.id}
                    className={`gg-settings-nav-item ${tab === t.id ? 'is-active' : ''}`}
                    onClick={() => setTab(t.id)}
                  >
                    <span className="gg-settings-nav-icon" aria-hidden>{t.icon}</span>
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </aside>

          <div className="gg-settings-content">

        {tab === 'providers' && (
        <ProvidersPage
          providers={PROVIDERS}
          keys={keys}
          setKeys={setKeys}
          activeProvider={activeProvider}
          setActiveProvider={setActiveProvider}
        />
        )}

        {tab === 'models' && (
        <ModelsPage
          providers={PROVIDERS}
          enabledModels={enabledModels}
          setEnabledModels={setEnabledModels}
          models={models}
          setModels={setModels}
          activeProvider={activeProvider}
          setActiveProvider={setActiveProvider}
          keys={keys}
        />
        )}

        {tab === 'connectors' && (
        <div className="gg-settings-extra">
          <div className="gg-settings-section-title">💰 Hard cost cap (auto-stop)</div>
          <div className="gg-settings-row">
            <label className="gg-settings-label">Лимит $/сессия</label>
            <input
              className="gg-input"
              type="text"
              value={costCap}
              onChange={e => setCostCap(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="Например: 5 (max $5 за сессию). Пусто = guard выключен."
              style={{ maxWidth: 200 }}
            />
          </div>
          <div className="gg-settings-hint">
            Если AI-сессия (API-провайдер) превысит этот лимит — auto-stop с
            сообщением «лимит израсходован». CLI-провайдеры (подписки) идут
            мимо лимита — они $0. Лимит на ОДНУ сессию, не суммарно за день.
            Стандартный chat = $0.05-0.50. Длинный agent loop с большим
            проектом = $2-10. Безопасный default: 5.
          </div>

          <div className="gg-settings-section-title" style={{ marginTop: 24 }}>🔑 Claude Code OAuth (для Max подписки в headless)</div>
          <div className="gg-settings-row">
            <label className="gg-settings-label">Long-lived OAuth token</label>
            <input
              className="gg-input"
              type="password"
              value={claudeOauthToken}
              onChange={e => setClaudeOauthToken(e.target.value)}
              placeholder="sk-ant-oat01-... (из `claude setup-token` в PowerShell)"
              autoComplete="new-password"
            />
          </div>
          <div className="gg-settings-hint">
            Claude Code v2.1+ в headless режиме (через нашу программу) НЕ использует Max OAuth напрямую — требует
            long-lived token. Получи: <code>claude setup-token</code> в PowerShell → подтверди в браузере →
            копируй token сюда. GeminiGrok будет передавать его как env var <code>CLAUDE_CODE_OAUTH_TOKEN</code>
            при запуске claude. Решает «401 Invalid credentials» при выборе провайдера Claude Code.
            Хранится зашифрованным через safeStorage. Действителен 1 год.
          </div>

          <div className="gg-settings-section-title" style={{ marginTop: 24 }}>1С OData</div>
          <div className="gg-settings-row">
            <label className="gg-settings-label">1С OData base URL</label>
            <input
              className="gg-input"
              value={onec.url}
              onChange={e => setOneC(s => ({ ...s, url: e.target.value }))}
              placeholder="https://1c.example.com/base/odata/standard.odata"
              spellCheck={false}
            />
          </div>
          <div className="gg-settings-row">
            <label className="gg-settings-label">Логин</label>
            <input
              className="gg-input"
              value={onec.user}
              onChange={e => setOneC(s => ({ ...s, user: e.target.value }))}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="gg-settings-row">
            <label className="gg-settings-label">Пароль</label>
            <input
              className="gg-input"
              type="password"
              value={onec.pass}
              onChange={e => setOneC(s => ({ ...s, pass: e.target.value }))}
              autoComplete="new-password"
            />
          </div>
          <div className="gg-settings-hint">
            Кред хранится зашифрованным в Electron safeStorage. AI может звать
            tool <code>connector_query</code> с id=<code>onec</code>; пароль
            никогда не попадает в промпт.
          </div>

          <div className="gg-settings-section-title" style={{ marginTop: 18 }}>HTTP коннекторы</div>
          {httpEndpoints.map((ep, i) => (
            <div key={i} className="gg-http-endpoint">
              <div className="gg-http-endpoint-head">#{i + 1}</div>
              <div className="gg-settings-row">
                <label className="gg-settings-label">Имя</label>
                <input className="gg-input" value={ep.name} placeholder='напр. "github" или "internal-api"'
                  onChange={e => setHttpEndpoints(arr => arr.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                  spellCheck={false} />
              </div>
              <div className="gg-settings-row">
                <label className="gg-settings-label">Base URL</label>
                <input className="gg-input" value={ep.base} placeholder="https://api.github.com"
                  onChange={e => setHttpEndpoints(arr => arr.map((x, j) => j === i ? { ...x, base: e.target.value } : x))}
                  spellCheck={false} />
              </div>
              <div className="gg-settings-row">
                <label className="gg-settings-label">Authorization</label>
                <input className="gg-input" type="password" value={ep.auth} placeholder='напр. "Bearer ghp_…"'
                  onChange={e => setHttpEndpoints(arr => arr.map((x, j) => j === i ? { ...x, auth: e.target.value } : x))}
                  autoComplete="new-password" />
              </div>
              <div className="gg-settings-row">
                <label className="gg-settings-label">Allow-paths</label>
                <input className="gg-input" value={ep.paths} placeholder="/repos,/user (пусто = всё под base)"
                  onChange={e => setHttpEndpoints(arr => arr.map((x, j) => j === i ? { ...x, paths: e.target.value } : x))}
                  spellCheck={false} />
              </div>
            </div>
          ))}
          <div className="gg-settings-hint">
            AI вызывает <code>connector_query</code> с <code>id="http"</code>,
            <code>endpoint=&lt;имя&gt;</code> и path/method/query/body/headers.
            Auth-заголовок подставляется из настроек, AI его не видит.
            Allow-paths ограничивает к каким путям эндпоинта можно обращаться.
          </div>

          {/* ============================================================
              V3 — российские коннекторы (раздел 5 плана).
              ============================================================ */}
          <div className="gg-settings-section-title" style={{ marginTop: 24 }}>📊 Google Sheets</div>
          <div className="gg-settings-row">
            <label className="gg-settings-label">Service Account JSON</label>
            <textarea
              className="gg-input"
              value={gsheetsJson}
              onChange={e => setGsheetsJson(e.target.value)}
              placeholder='{"type": "service_account", "client_email": "...", "private_key": "-----BEGIN PRIVATE KEY-----\\n...", ...}'
              rows={5}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}
              spellCheck={false}
            />
          </div>
          <div className="gg-settings-hint">
            JSON service account (как в <code>/opt/los/creds.json</code>). Шифруется через safeStorage.
            AI вызывает <code>connector_query</code> с <code>id="gsheets"</code> и <code>op="read_as_records"</code> /
            <code>"update_row"</code> / etc. См. electron/connectors/gsheets.ts.
          </div>

          <div className="gg-settings-section-title" style={{ marginTop: 24 }}>✉ Telegram bot</div>
          <div className="gg-settings-row">
            <label className="gg-settings-label">Bot token</label>
            <input
              className="gg-input"
              type="password"
              value={telegramBotToken}
              onChange={e => setTelegramBotToken(e.target.value)}
              placeholder="1234567890:AAH... (от @BotFather)"
              autoComplete="new-password"
            />
          </div>
          <div className="gg-settings-row">
            <label className="gg-settings-label">Chat whitelist (JSON)</label>
            <input
              className="gg-input"
              value={telegramWhitelist}
              onChange={e => setTelegramWhitelist(e.target.value)}
              placeholder='["-1003242936373", "@private_chat"]'
              style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
              spellCheck={false}
            />
          </div>
          <div className="gg-settings-hint">
            JSON-массив chat_id куда боту разрешено отправлять. Пустая строка = всем (только dev).
            Rate limit 20 send/min на chat_id вшит в коннектор. Read истории — через SSH к Telethon скрипту.
          </div>

          <div className="gg-settings-section-title" style={{ marginTop: 24 }}>🔧 SSH executor</div>
          <div className="gg-settings-row">
            <label className="gg-settings-label">Default host</label>
            <input
              className="gg-input"
              value={sshHost}
              onChange={e => setSshHost(e.target.value)}
              placeholder="user@178.62.230.241 или alias из ~/.ssh/config"
              spellCheck={false}
            />
          </div>
          <div className="gg-settings-row">
            <label className="gg-settings-label">Path к private key</label>
            <input
              className="gg-input"
              value={sshKeyPath}
              onChange={e => setSshKeyPath(e.target.value)}
              placeholder="C:/Users/Pavel/.ssh/id_ed25519 (или путь к ключу gemini-agent)"
              spellCheck={false}
            />
          </div>
          <div className="gg-settings-hint">
            Whitelist: только default host разрешён для запросов. Команды денилист:
            rm -rf системных корней, mkfs, dd на /dev, passwd, sudo su, systemctl stop, и т.п.
            Через connector_query с <code>id="ssh"</code> и <code>op="run_remote"</code>.
          </div>

          <div className="gg-settings-section-title" style={{ marginTop: 24 }}>💼 Битрикс24</div>
          <div className="gg-settings-row">
            <label className="gg-settings-label">Incoming webhook URL</label>
            <input
              className="gg-input"
              type="password"
              value={bitrixWebhook}
              onChange={e => setBitrixWebhook(e.target.value)}
              placeholder="https://your-portal.bitrix24.ru/rest/USER_ID/TOKEN/"
              autoComplete="new-password"
            />
          </div>
          <div className="gg-settings-hint">
            Создать в Битрикс24: Разработчикам → Другое → Входящий вебхук. Полный URL с токеном.
            Denied methods: *.delete (crm.deal/lead/contact/company/user). Allowed prefixes: crm.*, tasks.*, user.*.
          </div>

          <div className="gg-settings-section-title" style={{ marginTop: 24 }}>📈 Яндекс.Директ</div>
          <div className="gg-settings-row">
            <label className="gg-settings-label">OAuth token</label>
            <input
              className="gg-input"
              type="password"
              value={yDirectToken}
              onChange={e => setYDirectToken(e.target.value)}
              placeholder="Получить: oauth.yandex.ru, scope: direct:api"
              autoComplete="new-password"
            />
          </div>
          <div className="gg-settings-row">
            <label className="gg-settings-label">Client-Login (опц.)</label>
            <input
              className="gg-input"
              value={yDirectLogin}
              onChange={e => setYDirectLogin(e.target.value)}
              placeholder="Login клиента — для агентских аккаунтов"
              spellCheck={false}
            />
          </div>
          <div className="gg-settings-hint">
            Reports API асинхронный — connector polls до 30s. Если отчёт большой,
            возвращается <code>processing: true</code>, повторяй запрос.
          </div>

          <div className="gg-settings-section-title" style={{ marginTop: 24 }}>📦 Yandex Disk</div>
          <div className="gg-settings-row">
            <label className="gg-settings-label">OAuth token</label>
            <input
              className="gg-input"
              type="password"
              value={yDiskToken}
              onChange={e => setYDiskToken(e.target.value)}
              placeholder="oauth.yandex.ru со scope cloud_api:disk.write"
              autoComplete="new-password"
            />
          </div>
          <div className="gg-settings-hint">
            Используется агентом для шеринга артефактов с клиентами:
            upload_file → get_public_url → отправка ссылки в TG.
            Загрузка идёт в <code>/Geminigrok/{`{дата}`}/</code> чтобы не засорять корень Диска.
          </div>

          <div className="gg-settings-section-title" style={{ marginTop: 24 }}>🎭 Сервер скиллов</div>
          <div className="gg-settings-row">
            <label className="gg-settings-label">Skills server base URL</label>
            <input
              className="gg-input"
              value={skillsServerBase}
              onChange={e => setSkillsServerBase(e.target.value)}
              placeholder="https://aioperatingsystem.ru (или пусто для built-in only)"
              spellCheck={false}
            />
          </div>
          <div className="gg-settings-hint">
            Сервер должен предоставлять <code>GET /api/skills</code> возвращающий
            <code>{`{skills: [{id, raw, sourceRef}]}`}</code>. Если недоступен — используются built-in
            (bos-sales / bos-mkt / client-cycle) + локальные из ~/.geminigrok/skills/.
          </div>
        </div>
        )}

        {tab === 'autonomous' && (
        <div className="gg-settings-extra">
          <div className="gg-settings-section-title">🌙 Ночной режим — autonomous improvement loop</div>
          <div className="gg-settings-hint" style={{ marginBottom: 14 }}>
            Фоновый цикл который без участия пользователя читает журнал и project_map активного проекта, отправляет AI задачу «предложи 3 улучшения с обоснованием из истории», парсит ответ и пишет предложения в Journal как заметки. Утром открываешь Journal → видишь N предложений за ночь. <strong>Не делает write_file / run_command автоматически</strong> — только генерирует идеи.
          </div>

          <div className="gg-settings-row">
            <label className="gg-settings-label">Статус</label>
            <div style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
              {autonomous.enabled
                ? <span style={{ color: 'var(--success, #4ade80)' }}>● Активен · каждые {autonomous.intervalMin} мин</span>
                : <span style={{ color: 'var(--text-tertiary)' }}>○ Остановлен</span>}
            </div>
          </div>

          <div className="gg-settings-row">
            <label className="gg-settings-label">Интервал (мин)</label>
            <input
              className="gg-input"
              type="number"
              min={5}
              max={240}
              value={autonomous.intervalMin}
              onChange={e => setAutonomousState(s => ({ ...s, intervalMin: parseInt(e.target.value, 10) || 30 }))}
              style={{ maxWidth: 100 }}
            />
          </div>

          <div className="gg-settings-row">
            <label className="gg-settings-label">Управление</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {!autonomous.enabled ? (
                <button
                  className="gg-btn gg-btn-primary"
                  onClick={async () => {
                    const st = await window.api.autonomous.start(autonomous.intervalMin)
                    setAutonomousState(st)
                  }}
                >▶ Запустить</button>
              ) : (
                <button
                  className="gg-btn gg-btn-danger"
                  onClick={async () => {
                    const st = await window.api.autonomous.stop()
                    setAutonomousState(st)
                  }}
                >■ Остановить</button>
              )}
              <button
                className="gg-btn gg-btn-ghost"
                onClick={async () => {
                  const st = await window.api.autonomous.runOnce()
                  setAutonomousState(st)
                }}
              >Запустить цикл прямо сейчас</button>
            </div>
          </div>

          {autonomous.lastRunAt && (
            <div className="gg-settings-row">
              <label className="gg-settings-label">Последний запуск</label>
              <div style={{ flex: 1, fontSize: 'var(--text-sm)' }}>
                {new Date(autonomous.lastRunAt).toLocaleString()}
                {' · '}
                {autonomous.lastRunError
                  ? <span style={{ color: 'var(--error)' }}>ошибка: {autonomous.lastRunError}</span>
                  : <span>предложений: {autonomous.lastRunSuggestions}</span>}
              </div>
            </div>
          )}

          {autonomous.nextRunAt && autonomous.enabled && (
            <div className="gg-settings-row">
              <label className="gg-settings-label">Следующий</label>
              <div style={{ flex: 1, fontSize: 'var(--text-sm)' }}>
                {new Date(autonomous.nextRunAt).toLocaleString()}
              </div>
            </div>
          )}

          <div className="gg-settings-hint" style={{ marginTop: 14 }}>
            <strong>Требования:</strong> провайдер должен быть API-типа с ключом (Gemini / Claude / Grok / ChatGPT API).
            CLI-провайдеры (Claude Code, Codex и т.д.) не годятся — нет неинтерактивного канала.
            Активный проект должен быть открыт.
          </div>
        </div>
        )}

        {tab === 'profiles' && (<ProfilesTab />)}

        {tab === 'appearance' && (
        <div className="gg-settings-extra">
          <div className="gg-settings-section-title">Тема оформления</div>
          <div className="gg-theme-toggle" role="group" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className={`gg-theme-btn ${theme === 'dark' ? 'is-active' : ''}`}
              onClick={() => void setTheme('dark')}
            >
              <span aria-hidden>🌙</span> Тёмная
            </button>
            <button
              type="button"
              className={`gg-theme-btn ${theme === 'light' ? 'is-active' : ''}`}
              onClick={() => void setTheme('light')}
            >
              <span aria-hidden>☀</span> Светлая
            </button>
          </div>
          <div className="gg-settings-hint">
            Тема применяется мгновенно. Ширина боковой панели запоминается автоматически — потяни за её правый край.
          </div>
        </div>
        )}

          </div>{/* /gg-settings-content */}
        </div>{/* /gg-settings-shell */}

        <div className="gg-modal-footer">
          <button className="gg-btn gg-btn-ghost" onClick={onClose}>Закрыть</button>
          <button className="gg-btn gg-btn-primary" onClick={save}>
            {saved ? '✓ Сохранено' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ProvidersPage — OpenCode Desktop-style: «Подключённые» (с бейджем + Отключить)
// + «Доступные» (карточки с кнопкой Подключить, раскрывается inline-форма с
// ключом / hint'ом). Источник провайдеров — массив PROVIDERS (тот же что в
// Models). «Подключение» = задание API-ключа; для CLI-провайдеров «подключение»
// = установка CLI вне приложения, мы только подтверждаем галкой.
// ════════════════════════════════════════════════════════════════════════════

interface ProvidersPageProps {
  providers: ProviderConfig[]
  keys: Record<string, string>
  setKeys: React.Dispatch<React.SetStateAction<Record<string, string>>>
  activeProvider: ProviderId
  setActiveProvider: (id: ProviderId) => void
}

function statusBadge(status: ConnectionStatus, transport: 'API' | 'CLI'): { label: string; tone: 'ready' | 'cli' | 'missing' } {
  if (transport === 'CLI') return { label: 'Среда', tone: 'cli' }
  if (status === 'ready')  return { label: 'API ключ', tone: 'ready' }
  return { label: 'Нет ключа', tone: 'missing' }
}

function ProvidersPage(props: ProvidersPageProps) {
  const { providers, keys, setKeys, activeProvider, setActiveProvider } = props
  const [expanded, setExpanded] = useState<ProviderId | null>(null)

  const connected = providers.filter(p =>
    p.transport === 'CLI' || (p.secretKey != null && keys[p.secretKey])
  )
  const available = providers.filter(p =>
    p.transport === 'API' && p.secretKey != null && !keys[p.secretKey]
  )

  function disconnect(p: ProviderConfig) {
    if (p.secretKey) {
      setKeys(k => {
        const next = { ...k }
        delete next[p.secretKey!]
        return next
      })
    }
    if (activeProvider === p.id) {
      const fallback = providers.find(x => x.id !== p.id && (x.transport === 'CLI' || (x.secretKey && keys[x.secretKey])))
      if (fallback) setActiveProvider(fallback.id)
    }
  }

  return (
    <div className="gg-settings-extra gg-providers-page">
      <h2 className="gg-settings-page-title">Провайдеры</h2>

      <div className="gg-settings-section-title" style={{ marginTop: 8 }}>Подключённые провайдеры</div>
      <div className="gg-prov-list">
        {connected.length === 0 && (
          <div className="gg-text-tertiary" style={{ padding: 14, fontSize: 'var(--text-sm)' }}>
            Пока нет подключённых. Внизу — доступные.
          </div>
        )}
        {connected.map(p => {
          const status = connectionStatus(p.id, p.secretKey, keys)
          const badge = statusBadge(status, p.transport)
          return (
            <div key={p.id} className="gg-prov-card">
              <div className="gg-prov-card-main">
                <div className="gg-prov-card-name">
                  {p.name}
                  <span className={`gg-prov-badge is-${badge.tone}`}>{badge.label}</span>
                </div>
                <div className="gg-prov-card-desc">{p.description}</div>
              </div>
              <div className="gg-prov-card-actions">
                {p.transport === 'API' && (
                  <button
                    type="button"
                    className="gg-btn gg-btn-ghost"
                    onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                  >{expanded === p.id ? 'Скрыть' : 'Изменить ключ'}</button>
                )}
                <button
                  type="button"
                  className="gg-btn gg-btn-ghost"
                  onClick={() => disconnect(p)}
                  disabled={p.transport === 'CLI'}
                  title={p.transport === 'CLI' ? 'CLI отключается удалением самого бинаря на машине' : ''}
                >Отключить</button>
              </div>
              {expanded === p.id && p.secretKey && (
                <div className="gg-prov-card-expand">
                  <div className="gg-label">API ключ</div>
                  <input
                    className="gg-input"
                    type="password"
                    value={keys[p.secretKey] ?? ''}
                    onChange={e => setKeys(k => ({ ...k, [p.secretKey!]: e.target.value }))}
                    placeholder={p.keyHint}
                    autoFocus
                  />
                  {p.keyLink && (
                    <div className="gg-text-tertiary" style={{ fontSize: 'var(--text-xs)', marginTop: 6 }}>
                      Получить ключ: <a href={p.keyLink.url} target="_blank" rel="noreferrer">{p.keyLink.label}</a>. Хранится зашифрованно через safeStorage.
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="gg-settings-section-title" style={{ marginTop: 22 }}>Доступные провайдеры</div>
      <div className="gg-prov-list">
        {available.length === 0 && (
          <div className="gg-text-tertiary" style={{ padding: 14, fontSize: 'var(--text-sm)' }}>
            Все API-провайдеры подключены.
          </div>
        )}
        {available.map(p => (
          <div key={p.id} className="gg-prov-card">
            <div className="gg-prov-card-main">
              <div className="gg-prov-card-name">{p.name}<span className="gg-prov-badge is-recommended">Рекомендуемый</span></div>
              <div className="gg-prov-card-desc">{p.description}</div>
            </div>
            <div className="gg-prov-card-actions">
              <button
                type="button"
                className="gg-btn gg-btn-primary"
                onClick={() => setExpanded(p.id)}
              >+ Подключить</button>
            </div>
            {expanded === p.id && p.secretKey && (
              <div className="gg-prov-card-expand">
                <div className="gg-label">API ключ</div>
                <input
                  className="gg-input"
                  type="password"
                  value={keys[p.secretKey] ?? ''}
                  onChange={e => setKeys(k => ({ ...k, [p.secretKey!]: e.target.value }))}
                  placeholder={p.keyHint}
                  autoFocus
                />
                {p.keyLink && (
                  <div className="gg-text-tertiary" style={{ fontSize: 'var(--text-xs)', marginTop: 6 }}>
                    Получить ключ: <a href={p.keyLink.url} target="_blank" rel="noreferrer">{p.keyLink.label}</a>. Хранится зашифрованно через safeStorage.
                  </div>
                )}
                <div className="gg-text-tertiary" style={{ fontSize: 'var(--text-xs)', marginTop: 6 }}>
                  Нажми «Сохранить» внизу — провайдер появится в подключённых.
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="gg-settings-hint" style={{ marginTop: 18 }}>
        CLI-провайдеры (Gemini CLI / Claude Code / Grok Build / Codex) подключаются установкой соответствующего CLI вне приложения и логином через подписку. После этого они появляются как «Среда».
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ModelsPage — OpenCode Desktop-style: поиск + группировка по провайдеру +
// toggle per-модель. Toggle сохраняется в enabled_models — это управляет тем,
// какие модели появляются в чат-picker'е. Все включены по умолчанию.
// ════════════════════════════════════════════════════════════════════════════

interface ModelsPageProps {
  providers: ProviderConfig[]
  enabledModels: Set<string>
  setEnabledModels: React.Dispatch<React.SetStateAction<Set<string>>>
  models: Record<string, string>
  setModels: React.Dispatch<React.SetStateAction<Record<string, string>>>
  activeProvider: ProviderId
  setActiveProvider: (id: ProviderId) => void
  keys: Record<string, string>
}

function ModelsPage(props: ModelsPageProps) {
  const { providers, enabledModels, setEnabledModels, models, setModels, activeProvider, setActiveProvider, keys } = props
  const [search, setSearch] = useState('')

  // Каталог нужен только для метаданных (теги, цена); группировка по providerId.
  const catalog = useMemo(() => buildCatalog(providers), [providers])
  const grouped = useMemo(() => {
    const map = new Map<ProviderId, typeof catalog>()
    const t = search.trim().toLowerCase()
    for (const e of catalog) {
      if (t && !`${e.model} ${e.providerName}`.toLowerCase().includes(t)) continue
      const list = map.get(e.providerId) ?? []
      list.push(e)
      map.set(e.providerId, list)
    }
    return map
  }, [catalog, search])

  function toggle(key: string) {
    setEnabledModels(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function setDefault(providerId: ProviderId, model: string) {
    setActiveProvider(providerId)
    setModels(m => ({ ...m, [providerId]: model }))
  }

  return (
    <div className="gg-settings-extra gg-models-page">
      <h2 className="gg-settings-page-title">Модели</h2>

      <div className="gg-models-search-wrap">
        <input
          className="gg-input gg-models-search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔎 Поиск моделей"
          spellCheck={false}
        />
      </div>

      {providers.map(p => {
        const list = grouped.get(p.id)
        if (!list || list.length === 0) return null
        const status = connectionStatus(p.id, p.secretKey, keys)
        const isProviderReady = status === 'ready' || status === 'unknown' // unknown = CLI
        return (
          <div key={p.id} className="gg-models-group">
            <div className="gg-models-group-head">
              <span className="gg-models-group-name">{p.name}</span>
              {!isProviderReady && (
                <span className="gg-models-group-warn">нет ключа — подключи на вкладке «Провайдеры»</span>
              )}
            </div>
            <div className="gg-models-group-list">
              {list.map(e => {
                const enabled = enabledModels.has(e.key)
                const isDefault = activeProvider === p.id && (models[p.id] ?? p.defaultModel) === e.model
                return (
                  <div key={e.key} className={`gg-models-row ${enabled ? 'is-on' : ''}`}>
                    <button
                      type="button"
                      className="gg-models-row-main"
                      onClick={() => setDefault(p.id, e.model)}
                      title="Сделать активной моделью для этого провайдера"
                    >
                      <span className="gg-models-row-name">{e.model}</span>
                      {isDefault && <span className="gg-models-row-default">по умолчанию</span>}
                      <span className="gg-models-row-tags">
                        {e.tags.map(t => (
                          <span key={t} className={`gg-mpal-tag is-${t.toLowerCase().replace(/\$/g, 'd')}`}>{t}</span>
                        ))}
                      </span>
                    </button>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      className={`gg-toggle ${enabled ? 'is-on' : ''}`}
                      onClick={() => toggle(e.key)}
                      title={enabled ? 'Отключить из picker’а' : 'Включить в picker'}
                    >
                      <span className="gg-toggle-knob" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {grouped.size === 0 && (
        <div className="gg-text-tertiary" style={{ padding: 18, textAlign: 'center', fontSize: 'var(--text-sm)' }}>
          Ничего не найдено
        </div>
      )}

      <div className="gg-settings-hint" style={{ marginTop: 16 }}>
        Toggle справа управляет тем, какие модели появляются в picker’е чата.
        Клик по строке делает модель дефолтом провайдера и переключает активного провайдера.
        Поиск работает по имени модели и провайдера.
      </div>
    </div>
  )
}
