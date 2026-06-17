# PROVIDER_CAPABILITIES.md — что какой провайдер умеет под контролем Verstak

> Источник правды по матрице возможностей. Выводится в коде из
> `providerCapabilities()` (`electron/ai/registry.ts`) — НЕ хардкод-таблица.
> Последняя сверка: 2026-06-17.

Главная мысль (ревью F1/F3): на **API-провайдерах** Verstak полностью контролирует
агентный цикл; на **CLI-провайдерах** инструменты, проверка, таймлайн и crash-guard
работают ВНУТРИ бинаря (Claude Code / Codex / Gemini CLI) и Verstak их не видит.
Поэтому CLI помечен «урезанный контроль» в ModelPicker.

## Матрица (выводится из transport + supportsTools)

| Возможность | API | CLI |
|---|---|---|
| `tools` — агентный tool-loop под контролем Verstak (read/write/run_command) | ✅ | ❌ (внутри CLI) |
| `verification` — attest_verification артефакт + DoD-доказательство | ✅ | ❌ |
| `liveTimeline` — живой прогресс (tick) в Tasks/AgentRuns | ✅ | ❌ |
| `resumeSafe` — crash-resume безопасен (авто-доигрывание не повторит деструктив) | ✅ | ❌ (всегда не-resumable) |
| `mcp` — MCP-инструменты внешних серверов | ✅ | ❌ |
| `delegation` — delegate/orchestrate/swarm | ✅ | ❌ |
| `attachments` — картинки/файлы (иначе текстовый хинт) | ✅ | ❌ |

Правило: `full = transport==='API' && supportsTools`. Все API-провайдеры → полный
контроль; все CLI → деградация. `resumeSafe = transport==='API'`.

## Провайдеры

**API (полный контроль, 18 шт):**
- База: `gemini-api`, `claude`, `grok`, `openai`, `yandex-gpt`, `gigachat`.
- OpenAI-совместимые: `deepseek`, `qwen`, `mistral`, `moonshot`, `groq`,
  `openrouter`, `ollama`, `custom-openai`.

**CLI (урезанный контроль):**
- `gemini-cli`, `claude-cli` (Claude Code), `grok-cli`, `codex-cli`.
- Инструменты/проверка/таймлайн/resume — внутри бинаря. Stop работает, но
  Verstak не видит деталей. Вложения деградируют в текстовый хинт.

## Где применяется

- **UI:** ModelPicker показывает на CLI-строках «· урезанный контроль» +
  tooltip (что именно деградирует). Источник — DTO `capabilities` из
  `providers:list`.
- **Безопасность:** capability-матрица — источник правды о том, что доступно;
  `resumeSafe=false` для CLI согласуется с crash-resume guard
  (`agent-runs.ts isAutoResumable` → CLI всегда false).

## Headless CLI (`scripts/verstak-cli.mjs`)

Отдельный entry-point, поддерживает: `gemini-api`, `claude`, OpenAI-совместимые
(`openai/openrouter/deepseek/mistral/groq/ollama` + `qwen/moonshot/custom`).
**НЕ поддерживает** `yandex-gpt`/`gigachat` (нужны спец-провайдеры с folder-id/
OAuth — только в GUI). Bounded-команды `doctor`/`status`/`models` проверяют
конфигурацию без запуска провайдера.

---

Связано: `SECURITY_MODEL.md` (§10 — CLI как known limitation), `CLAUDE.md` §1.
