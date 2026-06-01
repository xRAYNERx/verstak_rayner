import { useEffect, useState } from 'react'
import authBgUrl from '../assets/auth-bg.webp'
import authVideoUrl from '../assets/auth-bg.mp4'

/**
 * AuthScreen — экран регистрации/входа. Показывается ПЕРЕД основным приложением
 * если auth_completed не установлен в settings.
 *
 * Логика:
 * - Нет профилей → только Sign Up
 * - Есть профили (>1) → Sign In по умолчанию, ссылка на Sign Up
 * - Ровно 1 профиль → автовход без показа экрана (вызывается из App.tsx)
 */

interface Props {
  onComplete: () => void
}

type Role = 'developer' | 'designer' | 'manager' | 'student'

const ROLES: { value: Role; label: string; icon: string }[] = [
  { value: 'developer', label: 'Developer', icon: '⚡' },
  { value: 'designer',  label: 'Designer',  icon: '🎨' },
  { value: 'manager',   label: 'Manager',   icon: '📋' },
  { value: 'student',   label: 'Student',   icon: '📚' },
]

const ROLE_DEFAULTS: Record<Role, { provider: string; model: string }> = {
  developer: { provider: 'gemini-api', model: 'gemini-2.5-flash' },
  designer:  { provider: 'gemini-api', model: 'gemini-2.5-flash' },
  manager:   { provider: 'gemini-api', model: 'gemini-2.5-flash' },
  student:   { provider: 'gemini-api', model: 'gemini-2.5-flash' },
}

interface Profile {
  id: number
  name: string
  role?: string | null
  isActive?: boolean | null
}

export function AuthScreen({ onComplete }: Props) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  // 'signup' | 'signin'
  const [mode, setMode] = useState<'signup' | 'signin'>('signup')

  // Sign Up state
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('developer')

  // Sign In state
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // fade-out animation при успешном входе
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const list: Profile[] = await window.api.userProfiles.list()
        setProfiles(list)
        if (list.length > 0) {
          setMode('signin')
          const active = list.find(p => p.isActive) ?? list[0]
          setSelectedProfileId(active.id)
        }
      } catch { /* первый запуск */ }
      setLoading(false)
    })()
  }, [])

  async function handleSignUp() {
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    try {
      const preset = ROLE_DEFAULTS[role]
      const profile = await window.api.userProfiles.create({
        name: name.trim(),
        role,
        defaultProvider: preset.provider,
        defaultModel: preset.model,
      })
      await window.api.userProfiles.setActive(profile.id)
      await window.api.settings.setKey('provider', preset.provider)
      await window.api.settings.setKey(`model_${preset.provider}`, preset.model)
      await window.api.settings.setKey('auth_completed', 'true')
      await window.api.settings.setKey('onboarding_completed', '1')
      doLeave()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  async function handleSignIn() {
    if (!selectedProfileId) return
    setBusy(true)
    setError(null)
    try {
      await window.api.userProfiles.setActive(selectedProfileId)
      await window.api.settings.setKey('auth_completed', 'true')
      doLeave()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  function doLeave() {
    setLeaving(true)
    setTimeout(() => onComplete(), 450)
  }

  if (loading) return null

  const hasProfiles = profiles.length > 0

  return (
    <div className={`gg-auth-root${leaving ? ' is-leaving' : ''}`}>
      {/* ── Left panel: visual / animation ── */}
      <div className="gg-auth-left">
        {/* Фоновое видео — Higgsfield Seedance 2.0 loop */}
        <video
          className="gg-auth-bg-video"
          src={authVideoUrl}
          autoPlay
          loop
          muted
          playsInline
          poster={authBgUrl}
        />

        {/* CSS orbs — fallback и подложка */}
        <div className="gg-auth-orb gg-auth-orb-1" />
        <div className="gg-auth-orb gg-auth-orb-2" />
        <div className="gg-auth-orb gg-auth-orb-3" />

        {/* Контент поверх */}
        <div className="gg-auth-left-content">
          <div className="gg-auth-logo-wrap">
            <div className="gg-auth-logo-icon">V</div>
            <span className="gg-auth-logo-text">Verstak</span>
          </div>
          <p className="gg-auth-tagline">AI-ассистент для разработки</p>

          <ul className="gg-auth-features">
            <li>
              <span className="gg-auth-feature-dot" />
              8 AI-провайдеров в одном окне
            </li>
            <li>
              <span className="gg-auth-feature-dot" />
              Память между сессиями
            </li>
            <li>
              <span className="gg-auth-feature-dot" />
              Параллельные агенты
            </li>
          </ul>
        </div>
      </div>

      {/* ── Right panel: auth form ── */}
      <div className="gg-auth-right">
        <div className="gg-auth-form-wrap">
          {/* Tab toggle — только если есть профили */}
          {hasProfiles && (
            <div className="gg-auth-tabs">
              <button
                type="button"
                className={`gg-auth-tab${mode === 'signin' ? ' is-active' : ''}`}
                onClick={() => { setMode('signin'); setError(null) }}
              >
                Войти
              </button>
              <button
                type="button"
                className={`gg-auth-tab${mode === 'signup' ? ' is-active' : ''}`}
                onClick={() => { setMode('signup'); setError(null) }}
              >
                Новый профиль
              </button>
            </div>
          )}

          {!hasProfiles && (
            <div className="gg-auth-form-header">
              <h1 className="gg-auth-form-title">Добро пожаловать</h1>
              <p className="gg-auth-form-sub">Создай профиль чтобы начать</p>
            </div>
          )}

          {/* ── Sign In ── */}
          {mode === 'signin' && hasProfiles && (
            <div className="gg-auth-form">
              <div className="gg-auth-field">
                <label className="gg-auth-label">Профиль</label>
                <select
                  className="gg-auth-input gg-auth-select"
                  value={selectedProfileId ?? ''}
                  onChange={e => setSelectedProfileId(Number(e.target.value))}
                >
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.role ? ` · ${p.role}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {error && <div className="gg-auth-error">{error}</div>}

              <button
                type="button"
                className="gg-auth-submit"
                onClick={() => void handleSignIn()}
                disabled={busy || !selectedProfileId}
              >
                {busy ? 'Вхожу…' : 'Войти →'}
              </button>
            </div>
          )}

          {/* ── Sign Up ── */}
          {(mode === 'signup' || !hasProfiles) && (
            <div className="gg-auth-form">
              <div className="gg-auth-field">
                <label className="gg-auth-label">Имя</label>
                <input
                  type="text"
                  className="gg-auth-input"
                  placeholder="Как тебя зовут?"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && name.trim()) void handleSignUp() }}
                  autoFocus
                />
              </div>

              <div className="gg-auth-field">
                <label className="gg-auth-label">Email <span className="gg-auth-optional">(необязательно)</span></label>
                <input
                  type="email"
                  className="gg-auth-input"
                  placeholder="для будущей облачной синхронизации"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>

              <div className="gg-auth-field">
                <label className="gg-auth-label">Роль</label>
                <div className="gg-auth-roles">
                  {ROLES.map(r => (
                    <button
                      key={r.value}
                      type="button"
                      className={`gg-auth-role-btn${role === r.value ? ' is-active' : ''}`}
                      onClick={() => setRole(r.value)}
                    >
                      <span className="gg-auth-role-icon">{r.icon}</span>
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {error && <div className="gg-auth-error">{error}</div>}

              <button
                type="button"
                className="gg-auth-submit"
                onClick={() => void handleSignUp()}
                disabled={busy || !name.trim()}
              >
                {busy ? 'Создаю профиль…' : 'Начать работу →'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
