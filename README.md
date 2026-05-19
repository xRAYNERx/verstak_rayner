# GeminiGrok · GGC

**G**emini · **G**rok · **C**laude — desktop AI coding assistant that talks to all three (plus ChatGPT/Codex) through one interface. Chat-first, project-aware, runs on your own keys or your existing subscriptions.

## Why

A clean alternative to Cursor / ClawCode / Antigravity. Open a project folder, pick a provider, ask. Tools (file read/write, terminal, project search) work on any of the 4 API providers. Subscription CLIs run as subprocess so you don't pay per-token if you already pay flat.

## Providers (8)

| Brand   | API (own key)              | CLI (your subscription)            |
| ------- | -------------------------- | ---------------------------------- |
| Gemini  | ✓ with tools               | ✓ Gemini Ultra (`gemini` CLI)      |
| Claude  | ✓ with tools               | ✓ Pro / Max (`claude` CLI)         |
| Grok    | ✓ with tools               | ✓ SuperGrok (`grok` CLI)           |
| ChatGPT | ✓ with tools               | ✓ Plus / Pro (`codex` CLI)         |

Switch in the chat composer's model picker. Each provider has its own list of models (Sonnet 4.5 / Opus 4.5, GPT-5 / o3, grok-4 / grok-code-fast-1, gemini-2.5-pro / 3-flash-preview, …).

## Features

- **Multi-project rail.** Sidebar holds all opened folders, click to switch. Last project auto-opens on startup.
- **Per-project views.** Chat / Tasks / Journal / Plan (others stubbed).
- **Plan mode.** AI generates structured plans via the `create_plan` tool; you run steps one-by-one or "▶▶ Все шаги".
- **Tools across API providers.** read_file, list_directory, write_file (with diff confirm), run_command (with confirm + denylist), search_project (ripgrep), find_files.
- **Multi-file diff.** When AI writes 2+ files in one turn, all confirmations land in a single modal with a file rail.
- **Undo stack.** Every accepted write is recorded; "↶ N" button in the composer reverts the most recent.
- **Loop detection.** Same tool+args called 3× → break with supervisor message; max 8 turns per send.
- **Token counter.** "↑2.1k · ↓0.8k" in the composer, per project session.
- **Project journal.** User messages, tool actions, blocked commands, plans — all logged.
- **System layer.** Immutable agent protocols (7-step cycle, scope discipline, verification) baked into the build. User extends via `AGENTS.md` / `CLAUDE.md` / `GEMINI.md` / `.geminigrok/RULES.md` in the project root.
- **Dark / light theme.** Toggle in Settings.

## Setup

```bash
npm install --legacy-peer-deps
npm run electron-rebuild   # one-time: build native modules (better-sqlite3, node-pty) for Electron
npm run dev
```

Then click ⚙ → pick provider → paste API key (or use a CLI provider if its binary is on your PATH and logged in).

### CLI subscription providers

- **Gemini Ultra:** `npm i -g @google/gemini-cli` → `gemini` (OAuth Google account)
- **Claude Code:** `irm https://claude.ai/install.ps1 | iex` (or curl on macOS/Linux) → `claude` once
- **Grok Build:** installer from grok.com/build → `grok` once
- **Codex:** `npm i -g @openai/codex` → `codex login`

## Stack

Electron · Vite · React · TypeScript · better-sqlite3 · @google/genai · @anthropic-ai/sdk · openai · node-pty · xterm · highlight.js · Zustand · Geist Sans/Mono.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Auto-rebuilds native modules for Electron, starts dev (HMR) |
| `npm run build` | Production bundle into `out/` |
| `npm test` | Rebuilds native modules for Node, runs Vitest |
| `npm run test:fast` | Skips rebuild — only use when bindings are correct |
| `npm run type` | `tsc --noEmit` |

## Status

MVP that's daily-driven. Working: 8 providers, multi-project, full agent loop on 4 APIs, plans with execution, attachments (paste/drop/picker), terminal, theme toggle. Pending: background agents, project context indexing, multi-chat per project, packaged installer.

See `docs/dev-journal.md` for the full history.
