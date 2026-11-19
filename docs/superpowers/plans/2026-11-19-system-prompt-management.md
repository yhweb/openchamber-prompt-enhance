# System Prompt Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing enhancement settings with editable/restorable default prompts and persistent, selectable, addable, editable, and deletable system enhancement prompts without changing the generation contract.

**Architecture:** Keep `systemPrompt` as the backward-compatible editable default prompt inside the existing `settings` storage object. Add sanitized `enhancedPrompts` records and `selectedPromptId`; resolve the effective prompt in the panel before calling the unchanged `host.generate({ system })` API. Render a fixed-width prompt `<select>` with a visible active-template hint and use an in-page `<dialog>` for adding a title and content.

**Tech Stack:** TypeScript panel logic, HTML/CSS panel UI, OpenChamber SDK `host.storage`, Vitest/jsdom tests, esbuild browser IIFE build.

**Spec:** `docs/superpowers/specs/2026-11-19-system-prompt-management-design.md`

## Global Constraints

- Preserve the existing `settings.systemPrompt` field and its old stored value.
- Do not change `host.generate` or the server-side system prompt mechanism.
- Missing or invalid new fields in old settings must fall back to the default prompt.
- Default prompt content comes from `DEFAULT_SYSTEM_PROMPT`; its source text is unchanged.
- Active system prompt text must respect the SDK's 8,000-character limit.
- Keep the combined settings payload below the host's storage limit; reject an oversized write without losing the in-memory draft.
- The committed `panel/main.js` must be regenerated after changing `panel/main.ts`.

## Review Focus

- Legacy `{ systemPrompt, maxOutputTokens }` settings retain the custom default prompt after load and save.
- A missing, duplicate, or deleted `selectedPromptId` resolves to `default` and never sends an unknown prompt.
- Switching the selector after editing keeps the in-memory text for that prompt until save; generation uses only the selected prompt.
- Empty titles/content and prompts over 8,000 characters are rejected without adding or deleting data.
- Storage failure or an oversized settings payload does not silently replace the user's current settings.

---

### Task 1: Add prompt data model and persistence behavior

**Files:**
- Modify: `panel/main.ts` settings types, sanitization, loading, persistence, and prompt-resolution helpers.
- Test: `tests/openchamber-panel.test.ts`.

**Interfaces:**
- Consumes: existing `DEFAULT_SYSTEM_PROMPT`, `host.storage`, and `EnhancerSettings`.
- Produces: `EnhancedPrompt`, extended `EnhancerSettings`, `sanitizeSettings(value: unknown)`, `selectedSystemPrompt(settings)`, and persistence helpers used by the UI task.

- [ ] **Step 1: Write failing tests for model and generation resolution**

  Add tests that load legacy settings unchanged, load a list with a selected enhancement, send that content in `host.generate`, fall back when the selected id is missing, and keep the default prompt behavior when no enhancement exists.

- [ ] **Step 2: Run the focused tests and verify they fail**

  Run: `npx vitest run tests/openchamber-panel.test.ts -t "system prompt|enhanced prompt|selected prompt"`

  Expected: FAIL because the panel has no enhanced prompt fields or selection logic.

- [ ] **Step 3: Implement the sanitized settings model in `panel/main.ts`**

  Add `EnhancedPrompt { id, title, content }`, `enhancedPrompts`, and `selectedPromptId` while retaining the old two fields. Normalize invalid entries, drop duplicate ids, enforce non-empty trimmed titles/content, resolve unknown selection ids to `default`, and use `DEFAULT_SYSTEM_PROMPT` for a missing/blank default prompt. Add constants for `default`, the 8,000-character active prompt limit, and the storage payload safety limit.

- [ ] **Step 4: Implement effective prompt resolution and safe settings persistence**

  `selectedSystemPrompt()` returns `settings.systemPrompt` for `default`, the selected enhancement's `content` otherwise, and the built-in default for an invalid selection. The persistence helper checks serialized byte size, calls `host.storage.set('settings', next)`, and only replaces in-memory `settings` after a successful write.

- [ ] **Step 5: Run the focused tests and verify they pass**

  Run: `npx vitest run tests/openchamber-panel.test.ts -t "system prompt|enhanced prompt|selected prompt"`

  Expected: PASS, including the legacy compatibility and generation assertions.

- [ ] **Step 6: Commit the model/persistence task**

  ```bash
  git add panel/main.ts tests/openchamber-panel.test.ts
  git commit -m "feat: model selectable system prompts"
  ```

### Task 2: Add prompt-management UI and interactions

**Files:**
- Modify: `panel/index.html` settings markup and styles.
- Modify: `panel/main.ts` prompt tab rendering, dialog actions, save/reset/delete handlers, and selection persistence.
- Test: `tests/openchamber-panel.test.ts`.

**Interfaces:**
- Consumes: Task 1's prompt model, resolver, and persistence helper.
- Produces: A settings UI with `#prompt-select`, `#prompt-active-hint`, `#add-prompt`, `#delete-prompt`, `#reset-system`, `#prompt-dialog`, `#prompt-title`, and `#prompt-content`; interactions update and persist the selected prompt.

- [ ] **Step 1: Write failing interaction tests**

  Add tests for default reset, adding a prompt with title and content, rendering multiple select options, selecting a prompt and persisting its id, editing/saving the selected enhancement, deleting it and falling back to default, validation errors, and restoring the last valid selection on reload.

- [ ] **Step 2: Run the focused tests and verify they fail**

  Run: `npx vitest run tests/openchamber-panel.test.ts -t "prompt management|prompt select|reset default|delete prompt|add prompt"`

  Expected: FAIL because the new controls and handlers do not exist.

- [ ] **Step 3: Implement the markup and fixed-width prompt selector**

  In `panel/index.html`, replace the single settings label/text area block with a prompt selector row containing a fixed-width `#prompt-select`, add/delete controls, and a wrapping `#prompt-active-hint` that names the active generation template; retain the existing `#system` textarea and reset/save controls. Add a hidden `<dialog>` with title/content fields and cancel/save buttons. Keep the existing `details`, token input, and panel layout intact.

- [ ] **Step 4: Implement rendering and handlers in `panel/main.ts`**

  Render a non-deletable default option and one option per enhancement. Update the visible active-template hint whenever selection changes. Capture textarea input into the currently selected in-memory record so switching prompts does not discard edits. Persist selection immediately after a successful change. The add dialog rejects blank title/content and content over 8,000 characters, creates a unique id, writes the new record and selects it in one storage write. Save updates the selected record/default prompt. Reset writes `DEFAULT_SYSTEM_PROMPT` immediately. Delete removes only enhancement records, selects `default`, and persists the fallback.

- [ ] **Step 5: Run focused panel tests and verify they pass**

  Run: `npx vitest run tests/openchamber-panel.test.ts`

  Expected: all panel tests pass, including the existing history/layout tests.

  Also run `npx vitest run tests/openchamber-flow.test.ts` to verify the minimal flow fixture includes the selector and active-template hint.

- [ ] **Step 6: Commit the UI task**

  ```bash
  git add panel/index.html panel/main.ts tests/openchamber-panel.test.ts
  git commit -m "feat: manage selectable system prompt presets"
  ```

### Task 3: Build, verify the shipped panel, and update documentation

**Files:**
- Modify: `panel/main.js` generated bundle.
- Modify: `docs/superpowers/specs/2026-11-19-system-prompt-management-design.md` only if implementation-level facts need correction.

**Interfaces:**
- Consumes: completed panel source and tests from Tasks 1–2.
- Produces: A fresh OpenChamber-loadable bundle and evidence that the feature is type-safe and regression-free.

- [ ] **Step 1: Run the full verification suite**

  Run: `npm run typecheck`, `npm test`, and `npm run build`.

  Expected: typecheck, all tests, and build pass.

- [ ] **Step 2: Verify the committed bundle is fresh**

  Run: `git diff --quiet -- lib/ panel/main.js`

  Expected: no generated diff after the build, except the intended newly generated `panel/main.js` already staged/committed as part of this task.

- [ ] **Step 3: Check the final diff and working tree**

  Run: `git diff --check` and `git status --short`.

  Expected: no whitespace errors; only intended source, test, docs, and generated bundle changes remain.

- [ ] **Step 4: Commit the generated bundle and final docs**

  ```bash
  git add panel/main.js docs/superpowers/specs/2026-11-19-system-prompt-management-design.md docs/superpowers/plans/2026-11-19-system-prompt-management.md
  git commit -m "build: ship system prompt management panel"
  ```
