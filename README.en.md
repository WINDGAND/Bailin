# Bailin (百灵)

> **A shapeshifting spirit on your desktop** — craft a perspective-driven AI persona in 60 seconds, keep a pixel pet on screen, ask anytime with `Ctrl + Shift + P`.

<!-- README-I18N:START -->

**English** | [汉语](./README.md)

<!-- README-I18N:END -->

<p align="center">
  <img src="assets/logo.png" alt="Bailin logo" width="120" />
</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="#quick-start"><img src="https://img.shields.io/badge/platform-Windows-0078D6.svg" alt="Windows" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20.10-brightgreen.svg" alt="Node >= 20.10" />
  <img src="https://img.shields.io/badge/Electron-32-47848F.svg" alt="Electron 32" />
</p>

<p align="center">
  <a href="#overview">Overview</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#use-cases">Use Cases</a> ·
  <a href="#product-tour">Product Tour</a> ·
  <a href="#inspired-not-impersonation">Inspired, Not Impersonation</a> ·
  <a href="#privacy-and-local-first">Privacy</a> ·
  <a href="#disclaimer">Disclaimer</a> ·
  <a href="#developer-docs">Developers</a>
</p>

---

## Overview

Bailin is a **fully local**, open-source Windows desktop AI character companion. It does two things:

1. **Craft a persona** — Enter a name; ~60 seconds (quick) or 5–15 minutes (deep) to distill a mental framework, expression DNA, and pixel appearance.
2. **Bring them to your desktop** — A pixel pet stays in the corner; press `Ctrl + Shift + P` or click the pet to chat; click the system tray icon to open Settings / Character Library.

> [!TIP]
> This is not “make the AI act like someone.” It is “let the AI look at your problem from that person’s perspective.”

---

## Features

| Capability | Description |
| --- | --- |
| **Quick / deep distillation** | Quick mode ~60s; deep mode with 6 research agents + quality checks |
| **Pixel desktop pet** | DSL or hatch-pet atlas; transparent, always-on-top, draggable, click-through outside pixels |
| **Perspective-driven chat** | System prompts built from mental models, heuristics, and expression DNA |
| **Local memory** | User profile auto-learning; editable and clearable |
| **Proactive companion** | Optional smart screenshot whispers + dedicated bubble window |
| **Zero subscription** | Bring your own OpenAI / Anthropic / compatible API key; Windows DPAPI encryption |

**Shortcuts**

| Action | Shortcut / entry |
| --- | --- |
| Open / close chat | `Ctrl + Shift + P` |
| Open Settings / Character Library | Click system tray icon |
| Close chat window | `Esc` |

---

## Quick Start

> [!NOTE]
> The current release is primarily **source-build**. Prebuilt installers appear under [Releases](../../releases) when published.

### Requirements

- Windows 10 / 11
- [Node.js](https://nodejs.org/) ≥ 20.10
- [pnpm](https://pnpm.io/) 9 (`corepack enable`)

### Install and run

```bash
git clone https://github.com/WINDGAND/Bailin.git
cd Bailin
pnpm install          # builds packages + rebuilds better-sqlite3
pnpm dev              # Vite + tsc watch + Electron
```

First launch runs the **setup wizard**: disclaimer → API key → create or import a character → pet appears on desktop.

For development, configure `.env.dev` at the repo root (see `.env.dev.example`) to inject LLM credentials.

---

## Use Cases

### Stuck while writing

You are editing an important document and the structure feels messy. Press `Ctrl + Shift + P` and ask your desktop advisor how to cut redundancy — you get a perspective, not generic AI filler.

### Need a different angle on a decision

You are hesitating on a career move. Ask: “What is the inverse thinking here?” — three reverse questions often beat a direct answer.

### A little presence on a cold desktop

After a long day, say a few casual words to your companion. No lecturing, no broken persona — the desktop feels less empty.

---

## Product Tour

From creation to desktop in four steps:

### 1. Create a character

Setup wizard or Settings → Create: pick source type (public figure / fictional / original) and track (utility advisor / emotional companion), optional reference images, quick or deep mode.

<p align="center">
  <img src="assets/create.png" alt="Create character — quick and deep modes" width="640" />
</p>

> Built-in starters default to empty. Append `CharacterBundle` entries in `apps/desktop/src/shared/starters.ts`.

### 2. Character library

Search, switch the active pet, inspect mental models, or regenerate appearance / reference images.

<p align="center">
  <img src="assets/library.png" alt="Character library — list and detail" width="720" />
</p>

### 3. Pet on desktop

A pixel character in the bottom-right corner — draggable; transparent areas do not block clicks.

<p align="center">
  <img src="assets/pet.png" alt="Pixel desktop pet" width="280" />
</p>

### 4. Chat on demand

Chat window docks near the pet with streaming Markdown replies without stealing focus.

<p align="center">
  <img src="assets/chat.png" alt="Chat window beside the pet" width="720" />
</p>

<details>
<summary><strong>More settings screenshots</strong></summary>

<p align="center">
  <img src="assets/library-chat-preview.png" alt="In-library chat preview" width="720" />
</p>

<p align="center">
  <img src="assets/user-profile.png" alt="User profile and memory" width="640" />
</p>

<p align="center">
  <img src="assets/desktop-companion.png" alt="Pet scale and proactive bubble" width="640" />
</p>

<p align="center">
  <img src="assets/model-api.png" alt="Model and API key settings" width="640" />
</p>

<p align="center">
  <img src="assets/settings.png" alt="Appearance and language" width="640" />
</p>

</details>

---

## Inspired, Not Impersonation

Bailin does not stuff an AI with “famous quotes from X” — that gets fake fast.

Bailin distills a **thinking skeleton**:

- **Mental models** — lenses for seeing the world
- **Decision heuristics** — habits at forks in the road
- **Expression DNA** — rhythm, signature phrases, topics to avoid
- **Inner tensions** — contradictions and unresolved edges

The LLM uses that skeleton to **address your question from that angle**, not to perform a character.

> Inspired by the [Nuwa Skill](https://github.com/alchaincyf/nuwa-skill) distillation pipeline, productized as a desktop companion.

---

## Privacy and Local-First

- **Zero subscription** — bring any compatible API key
- **Fully local** — characters, chats, and profiles live in SQLite on your machine; no telemetry
- **Encrypted keys** — Windows DPAPI; renderer never sees plaintext keys
- **One-click wipe** — clear all data and keys in Settings

Data directory: `%APPDATA%/Bailin/` (delete the folder to fully uninstall)

---

## Acknowledgments

| Project | Credit | Link |
| --- | --- | --- |
| **Nuwa Skill** by Alchain | Persona distillation methodology and deep research orchestration | [alchaincyf/nuwa-skill](https://github.com/alchaincyf/nuwa-skill) |
| **hatch-pet SKILL** | Canonical portrait + 9-row strips + atlas pipeline | [openai/skills · hatch-pet](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/SKILL.md) |

Pixel art follows open chibi sprite conventions (not copied from specific franchises). If Bailin helps you, **please star the upstream projects**.

---

## Disclaimer

> [!IMPORTANT]
> Read this section before use. Continued use means you accept these terms.

### 1. Nature of this tool

Bailin is a **fully local** open-source tool. It ships no character content — **all personas are created by you**. This tool:

- Provides technical capabilities only (distillation, rendering, chat orchestration)
- Calls models only on **your machine with your API key**; the author does not access your chats
- Forces an **“inspired by, not official / not authorized”** label on outputs
- Uses **abstract pixel art**, not photorealistic likeness

### 2. Real people

If a persona is inspired by any real person, assess portrait, privacy, and publicity rights in your jurisdiction.

- ❌ Do not present outputs as their real statements or positions
- ❌ No defamation, harassment, sexualization, or incitement
- ❌ No commercial or promotional use without authorization
- ⚠️ Strongly prefer personal study only for living persons; do not publicly redistribute

### 3. Fictional / IP characters

- ✅ OK: private appreciation, learning, and research
- ❌ Not OK: distributing `.bailin` packs with others’ IP; monetizing on video, live streams, or social media
- ⚠️ Respect rights holders who explicitly oppose fan works

### 4. Reference images you upload

Images must be yours, public domain, fair use, or explicitly licensed. With Vision enabled, images follow your LLM provider’s upload policy.

### 5. Built-in examples

The open-source build ships **no built-in starters** (`STARTER_BUNDLES` is empty). Any starters you add locally must follow the rules above.

### 6. Author liability

Released under **MIT License** as-is, without warranty. The author is not liable for legal outcomes from your use.

### 7. Takedown

File a GitHub Issue with prefix `[Takedown]`, proof of authority, the disputed material, and your request. We respond within **7 business days** when credentials are sufficient.

---

## Developer Docs

<details>
<summary><strong>Build, protocol, and verification — expand</strong></summary>

### Repository layout

```
bailin/
├── apps/desktop/                 # Electron app (main / preload / renderer)
├── packages/
│   ├── character-protocol/       # CharacterCard / SpriteProgram schema
│   ├── prompts/                  # distillation / research / chat / hatch-pet prompts
│   ├── sprite-runtime/           # DSL renderer + state machine + guard sandbox
│   └── pet-atlas-tools/          # hatch-pet atlas crop / compose / validate
├── assets/                      # README screenshots
├── apps/desktop/src/shared/starters.ts  # optional built-in starters (empty by default)
└── scripts/
    ├── verify/                   # offline regression scripts
    ├── debug/                    # LLM end-to-end debug
    └── smoke/                    # external provider smoke tests
```

### Common commands

```bash
pnpm build            # packages + main + preload + renderer
pnpm typecheck        # monorepo typecheck
pnpm dev              # development mode
```

### Architecture snapshot

| Layer | Role |
| --- | --- |
| **Main** | Tray / shortcuts, LocalVault (SQLite), LLMAdapter, BailinOrchestrator, CharacterRuntime, DPAPI |
| **Pet / Chat / Settings / Bubble** | Four-window MPA; Pet renders SpriteProgram on Canvas + Worker |
| **packages/** | Protocol, prompts, runtime, atlas tools — decoupled from Electron shell |

One character = **`CharacterBundle = { card, sprite, runtime }`** (`packages/character-protocol`).

| Part | Role |
| --- | --- |
| **CharacterCard** | Persona: mental models, heuristics, expression DNA |
| **SpriteProgram** | Appearance: DSL JSON or hatch-pet atlas |
| **RuntimeConfig** | Temperature, context length, etc. |

**Principles**: protocol-first (`schemaVersion` + migrations); sprite code in Worker sandbox; zero-cloud assumption.

### Verification scripts

```bash
node scripts/verify/verify-hatch-pet.mjs
node scripts/verify/verify-sprite-builder.mjs
node scripts/verify/verify-llm-multimodal.mjs
node scripts/verify/verify-starters.mjs
```

Optional accessibility scan (requires `pnpm dev` running):

```bash
cd apps/desktop
pnpm add -D puppeteer axe-core   # first time
node ./scripts/a11y-scan.mjs
```

### Data directory

```
%APPDATA%/Bailin/
├── vault.db
└── research/<charId>/    # deep distillation research archive
```

</details>

---

## Roadmap

| Phase | Theme | Highlights |
| --- | --- | --- |
| **v0.x** (now) | MVP loop | Quick create, desktop pet, local memory, Windows, BYO key |
| **v1.0** | Polish | Deep distillation UX, chat improvements, opt-in auto-update |
| **v1.1** | Multi-pet | Multiple pets on desktop |
| **v1.2+** | Relationship | Long-term memory, proactive companion |
| **v2.0+** | Platform | `.bailin` packs (original / public domain only) |
| **v3.0+** | Cross-platform | macOS / Linux, mobile companion |

---

## Contributing

Early **v0.0.1** — contributions welcome:

- Pixel sprite styles / palettes
- New perspective skills (**original or public-domain figures only**)
- Bug fixes (steps to reproduce + environment)
- Docs / translations

Follow the [Disclaimer](#disclaimer). **PRs with third-party IP character assets will not be merged.**

---

<p align="center">
  <sub>A shapeshifting spirit on your desktop · MIT · zero subscription</sub>
</p>

<p align="center"><sub>Last reviewed: 2026-06-22</sub></p>
