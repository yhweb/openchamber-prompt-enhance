# OpenChamber Prompt Enhancer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the prompt enhancer as an installable OpenChamber panel that generates privately, previews, regenerates, copies, and preserves portable settings.

**Architecture:** Add a standalone panel entry and bundle its TypeScript into a classic browser IIFE with the documented OpenChamber SDK. The panel manually owns the draft/result and calls only `generate`, `writeClipboard`, and namespaced extension storage; it will not read or write composer state or call conversation APIs.

**Tech Stack:** TypeScript, OpenChamber SDK 2.7.2 API, esbuild, Vitest, npm.

**Spec:** `docs/openchamber-migration-design.md`

## Global Constraints
- Use `host.generate()` with the `model` capability and `host.writeClipboard()`.
- Never read or write the chat composer, inspect history, or call `compose`, `prompt`, or send APIs.
- Do not modify OpenChamber core or add composer-adjacent shortcuts or floating windows.
- Do not claim arbitrary provider/model routing, temperature, or reasoning-effort settings are supported.
- Keep entered draft intact after generation failures and make retry possible.

## Review Focus
- Empty/whitespace-only input: disable/refuse generation and never call `generate`.
- Model failure or no model: preserve original text, expose an error and retry path.
- A late response after a newer request: do not overwrite the latest result.
- Clipboard rejection or an output over the host's 32,000-character limit: report copy failure without losing the result.
- Stored settings with missing or malformed fields: safely fall back to defaults without blocking panel use.

---

### Task 1: Standalone extension manifest and panel bundle

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `scripts/build.mjs`
- Create: `panel/index.html`
- Create: `panel/main.ts`
- Test: `tests/openchamber-panel.test.ts`

**Interfaces:**
- Produces `panel/main.js`, a classic IIFE referenced by `panel/index.html`.
- Manifest id: `dsh-prompt-enhance`; panel entry: `panel/index.html`; capability: `model`.
- Script obtains `connectHost()` and applies `applyHostReady` for host theme.

- [x] **Step 1: Write the failing manifest/bundle contract tests**
  - Assert the manifest has API version 1, the expected id, panel entry and only the `model` capability.
  - Assert the HTML references `main.js` and the build script defines the panel IIFE output.
- [x] **Step 2: Run the focused tests and verify they fail**
  - Run: `npm test -- --run tests/openchamber-panel.test.ts`
  - Expected: FAIL because the extension manifest and panel files are absent.
- [x] **Step 3: Add the manifest and panel build output**
  - Add `@openchamber/sdk` as a runtime dependency and update the npm lockfile.
  - Add the `openchamber` manifest block with `model` capability and panel contribution.
  - Build `panel/main.ts` to `panel/main.js` as a browser IIFE; keep the existing DSH package build intact during migration.
- [x] **Step 4: Run focused tests and build**
  - Run: `npm test -- --run tests/openchamber-panel.test.ts`
  - Run: `npm run build`
  - Expected: PASS; generated classic panel bundle exists and existing builds still succeed.

### Task 2: Enhancement flow, settings, and regression coverage

**Files:**
- Modify: `panel/main.ts`
- Test: `tests/openchamber-flow.test.ts`

**Interfaces:**
- `EnhancerSettings`: `systemPrompt: string`, `maxOutputTokens: number`.
- Settings load/save use the OpenChamber host storage key `settings`.
- Panel uses `host.generate({ prompt: frameUserPrompt(draft), system: settings.systemPrompt, maxOutputTokens: settings.maxOutputTokens })` and `host.writeClipboard(result)` only.

- [x] **Step 1: Add failing tests for generation and preservation**
  - Verify a manual input triggers generation with framed draft and system prompt, then renders the result.
  - Verify empty input does not call generation.
  - Verify a rejected generation leaves original input intact, displays an error, and enables retry.
  - Verify stale earlier responses cannot replace a newer result.
- [x] **Step 2: Run focused tests and verify they fail for expected reasons**
  - Run: `npm test -- --run tests/openchamber-panel.test.ts`
  - Expected: FAIL because panel flow is not implemented.
- [x] **Step 3: Add settings load/save and panel interactions**
  - Reuse `DEFAULT_SYSTEM_PROMPT` and `frameUserPrompt`; do not pass conversation context.
  - Add editable system prompt and bounded output-token setting with portable storage.
  - Implement input, enhance/regenerate, result preview, copy, loading and visible error states.
  - Copy only with `host.writeClipboard`; report rejection or over-limit output safely.
  - Add request sequencing so only the latest request updates the panel.
- [x] **Step 4: Run tests, typecheck, and build**
  - Run: `npm test`
  - Run: `npm run typecheck`
  - Run: `npm run build`
  - Expected: all pass; confirm panel-owned source contains no composer/session API access. The bundled SDK bridge includes its standard method surface, but the panel does not call those methods and requests only the `model` capability.

### Task 3: Final verification and migration notes

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Verify: all changed extension and build files

- [x] **Step 1: Document extension install/build usage and API limitations**
  - Explain folder install, private one-off Small Model generation, portable settings, and unsupported arbitrary model routing.
- [x] **Step 2: Run the complete project verification**
  - Run: `npm test`
  - Run: `npm run typecheck`
  - Run: `npm run build`
  - Expected: PASS.
- [x] **Step 3: Inspect final diff and branch state**
  - Run: `git diff --check` and `git status --short --branch`.
  - Expected: only migration-related files changed, branch remains `openchabmer_plugin`, no unrelated files touched.
