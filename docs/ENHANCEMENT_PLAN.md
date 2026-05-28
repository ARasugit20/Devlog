# DevLog — Agent Handoff & Enhancement Plan

> **Purpose:** Onboard a new agent (or contributor) with full context from product review (May 2026). Use this as the source of truth before implementing enhancements.

---

## 1. Project snapshot

| Item | Detail |
|------|--------|
| **Product** | DevLog — VS Code/Cursor extension that watches workspace file changes, batches related edits, calls Google Gemini for plain-English “lessons,” and shows them in an activity-bar sidebar webview. |
| **Version** | `0.1.1` (preview, not yet on Marketplace) |
| **Repo layout** | Extension code lives in `devlog/`; root README duplicates install/docs. |
| **Target users** | Beginners, vibe-coders, students learning from AI-assisted coding who don’t read diffs. |
| **Differentiator** | Persistent **learning journal** of what changed — not inline chat. Batches multi-file edits into one lesson. |

### Core pipeline

```
chokidar (watch) → DiffEngine (baseline + unified diff) → 2s debounce buffer
  → translateBatch (Gemini or demo/fallback) → logger → sidebar webview
  → optional Google Docs append
```

### Key files (edit these for most features)

| File | Role |
|------|------|
| `devlog/src/watcher.ts` | File watch, 2s debounce (`DEBOUNCE_MS=2000`), batch flush |
| `devlog/src/diffEngine.ts` | Excludes, binary/large file handling, diff truncation |
| `devlog/src/translator.ts` | Gemini prompts, batch translation, demo/fallback/quota |
| `devlog/src/sidebar.ts` + `devlog/webview/*` | Webview UI |
| `devlog/src/settings.ts` | Default exclude globs |
| `devlog/package.json` | Extension manifest, `contributes.configuration` |
| `devlog/src/extension.ts` | Activation, first-run, commands |
| `devlog/src/storage.ts` | Workspace-persisted lessons (`devlog.lessons`) |
| `devlog/src/logger.ts` | In-memory lesson list + events |

---

## 2. What works today (preserve)

- **2-second batching** of related file changes into one lesson (good for AI coding sessions).
- **Beginner-friendly Gemini prompt** — 3–4 sentences, one `concept` label, JSON response.
- **Privacy:** secret redaction, prompt/diff size limits, API key in Secret Storage.
- **Reliability:** retry, quota pause, local fallback entries.
- **Demo mode** (`devlog.demoMode`) — no API calls.
- **Tests:** Vitest on watcher, translator, diff, storage, privacy (CI mocks external APIs).
- **Optional Google Docs sync** (OAuth — powerful but heavy for mass adoption).

---

## 3. Problems observed (real user session)

Example project: `dk-picks-optimizer` (Python ML / sports betting tool). Sidebar showed:

| Lesson | Issue |
|--------|--------|
| **ML Pipeline Initialization** (25 files) | Good batch narrative — core value prop works. |
| **API Client** (`player_stats_espn.py`) | Good — clear, useful. |
| **Program Update** (`__pycache__/*.pyc`) | **Bad** — metaphor-heavy explanation of bytecode; wastes trust and API quota. |
| **ML Pipeline Expansion** (41 files) | Overlaps prior batch; no session-level dedup or digest. |

### Root causes in code

1. **Default excludes omit Python/build artifacts** — `settings.ts` / `package.json` exclude `node_modules`, `dist`, `out`, etc., but NOT `__pycache__`, `*.pyc`, `.venv`, `.pytest_cache`, etc.
2. **No pre-Gemini filter** — skipped/binary files can still trigger full lessons if they pass watch.
3. **Prompt doesn’t say “ignore generated artifacts.”**
4. **UI is minimal** — concept as title, filename meta, paragraph body; no open file, copy, loading, skill tags, session summary.
5. **Onboarding** — BYOK Gemini friction; first-run mentions demo but `demoMode` defaults `false`.
6. **Distribution** — manual VSIX; Marketplace publisher placeholder; weak “instant wow” in README.

---

## 4. Product vision (enhanced)

**One-liner:** *Automatic study notes while you code — batched, plain-English, reviewable before the interview or exam.*

**Positioning vs alternatives:**

| Alternative | Gap DevLog fills |
|-------------|------------------|
| Cursor/Chat “what does this do?” | Ephemeral, no session history |
| Git commits | Jargon, not teaching |
| DevLog | Persistent sidebar journal + batching |

**Enhanced lesson card (target UX):**

```
[Concept badge]  API Client                    [Open file] [Copy]
src/.../player_stats_espn.py · May 28, 9:09 AM

Summary: One line — what changed.

Explanation: 2–3 sentences, beginner-friendly.

Why it matters: One sentence tying to the project goal.

Optional: “Check yourself” — one short question.
```

**Session layer (new):**

- Group lessons by day/session.
- **Digest command:** “Today you learned: APIs, ML pipeline, data layer.”
- Optional merge/dedup if same concept within N minutes.

---

## 5. Enhancement roadmap (prioritized)

### Tier 1 — Trust & install conversion (do first)

| # | Task | Files / notes |
|---|------|----------------|
| 1.1 | Add default excludes: `**/__pycache__/**`, `**/*.pyc`, `**/.venv/**`, `**/.pytest_cache/**`, `**/.mypy_cache/**`, `**/*.min.js`, `**/.DS_Store` | `settings.ts`, `package.json` defaults |
| 1.2 | Pre-Gemini gate: if batch is all skipped/binary/artifact paths → skip API or one-line local entry | `translator.ts`, maybe `watcher.ts` |
| 1.3 | Prompt v2: structured JSON (`summary`, `explanation`, `whyItMatters`, `concept`); instruct to ignore build artifacts | `translator.ts`, update `LogEntry` in `types.ts`, webview |
| 1.4 | Webview actions: Open file (vscode command), Copy lesson, “Translating…” when `translator: working` | `sidebar.ts`, `panel.js`, postMessage |
| 1.5 | First-run: enable `demoMode` until API key set (align with `showFirstRunMessage`) | `extension.ts` |
| 1.6 | Theme-aware CSS using `var(--vscode-*)` | `panel.css` |
| 1.7 | Tests for new excludes and artifact skip | `settings.test.ts`, `translator.test.ts` |

**Tier 1 success criteria:** No `.pyc` / `__pycache__` lessons in a Python project; sidebar feels native; new user sees demo lesson without API key.

### Tier 2 — Retention & learning outcomes

| # | Task |
|---|------|
| 2.1 | `devlog.audienceLevel`: `beginner` \| `intermediate` \| `vibe-coder` → system prompt variants |
| 2.2 | **DevLog: Session digest** command — summarize last N lessons via one Gemini call |
| 2.3 | Configurable debounce (`devlog.batchDebounceMs`) |
| 2.4 | Merge/dedup: if same `concept` within 10 min, append to previous card vs new card |
| 2.5 | **DevLog: Explain current file** command (on-demand, not watch-only) |
| 2.6 | Export lessons → `DEVLOG.md` in workspace (lighter than Google Docs) |

### Tier 3 — Scale & platform

| # | Task |
|---|------|
| 3.1 | Translation queue + max concurrent requests; show queue depth in status banner |
| 3.2 | Chunk large batches (by top-level folder or max files per prompt) |
| 3.3 | Pluggable model provider setting (Gemini default; document BYOK) |
| 3.4 | Marketplace publish: fix `publisher` in `package.json`, screenshots, 15s GIF |
| 3.5 | Golden demo lessons in repo for marketing / demo mode samples |
| 3.6 | `QUICKSTART.md` for learners (separate from `CONTRIBUTING.md`) |

---

## 6. Technical constraints (do not break)

- **CI must not call Gemini or Google APIs** — mock in tests (`devlog/src/test/vscodeMock.ts`, vitest).
- **Never commit API keys** — use Secret Storage command `devlog.setApiKey`.
- **Minimize scope per PR** — Tier 1 can ship as one focused PR.
- **Match existing style:** esbuild bundle, EventEmitter logger, chokidar watcher.
- **Extension host:** must work in VS Code and Cursor (`engines.vscode ^1.85.0`).

---

## 7. Prompt template (current → target)

**Current** (`BATCH_SYSTEM_PROMPT` in `translator.ts`):

- Output: `{ explanation, concept }`
- Style: 3–4 sentences, no jargon, one concept name

**Target:**

```json
{
  "concept": "API Client",
  "summary": "One sentence headline.",
  "explanation": "2-3 sentences, beginner-friendly.",
  "whyItMatters": "One sentence linking to project goals.",
  "reflectionQuestion": "Optional short question."
}
```

Add system rules:

- If changes are only build artifacts, caches, or compiled output → return `{ "skip": true, "reason": "..." }` (handle in `translateBatch`).
- Do not explain `.pyc`, minified bundles, or lockfiles unless they are the only changes and user-facing.

---

## 8. Distribution & marketing (parallel track)

1. Publish to Visual Studio Marketplace (`vsce publish`, real publisher id).
2. README lead: GIF + 3 bullet value props + install button (not VSIX steps first).
3. Keywords: learning, vibe coding, AI coding journal, beginner, Cursor.
4. Open VSX optional for Cursor OpenVSX users.

---

## 9. Suggested implementation order (single agent sprint)

```
Week 1: Tier 1.1–1.3 (excludes, artifact gate, prompt v2 + types)
Week 1: Tier 1.4–1.6 (webview actions, theme, first-run demo)
Week 1: Tests + CHANGELOG + bump 0.1.2

Week 2: Tier 2.1–2.2 (audience level, session digest)
Week 2: Tier 2.5–2.6 (explain file, DEVLOG.md export)

Week 3+: Tier 3 (queue, chunking, marketplace assets)
```

---

## 10. Copy-paste prompt for a new agent

```
You are enhancing DevLog, a VS Code/Cursor extension in devlog/ that turns batched file diffs into beginner-friendly sidebar lessons via Gemini.

Read docs/ENHANCEMENT_PLAN.md and devlog/README.md first.

Priority: Tier 1 — fix trust issues (__pycache__/*.pyc lessons), structured prompt v2, webview open/copy/loading, demo-on-first-run, vscode theme CSS. Add tests; do not call real APIs in CI.

Architecture: watcher.ts → diffEngine.ts → translateBatch in translator.ts → logger → webview. Default excludes in settings.ts and package.json.

Do not over-engineer Tier 3 until Tier 1 ships. Match existing patterns (EventEmitter, vitest, esbuild). User has not requested git commits unless asked.
```

---

## 11. Open questions (resolve with user if blocked)

- Default **demo mode on first install** globally vs workspace?
- **Dedup/merge** lessons by concept — opt-in setting?
- **Marketplace publisher id** — user must provide before publish.
- Support **Ollama/local LLM** in v0.2 or defer?

---

*Last updated: May 2026 — from codebase review + user screenshot/samples (dk-picks-optimizer session).*
