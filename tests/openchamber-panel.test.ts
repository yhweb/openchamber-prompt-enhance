// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const hostMocks = vi.hoisted(() => ({
  generate: vi.fn(),
  writeClipboard: vi.fn(),
  storageGet: vi.fn(),
  storageSet: vi.fn(),
}))

vi.mock('@openchamber/sdk', () => ({
  connectHost: () => ({
    generate: hostMocks.generate,
    writeClipboard: hostMocks.writeClipboard,
    storage: { get: hostMocks.storageGet, set: hostMocks.storageSet },
    onReady: () => {},
  }),
}))

vi.mock('@openchamber/sdk/ui', () => ({ applyHostReady: () => {} }))

async function loadPanel(): Promise<void> {
  document.body.innerHTML = await readFile(resolve(root, 'panel/index.html'), 'utf8')
  await import('../panel/main.ts')
  await Promise.resolve()
}

function click(id: string): void {
  document.querySelector<HTMLButtonElement>(`#${id}`)!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

function clickNode(element: Element): void {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

function selectPrompt(id: string): void {
  const select = document.querySelector<HTMLSelectElement>('#prompt-select')!
  select.value = id
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

function historyRows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('#history-list .history-row')]
}

function rowText(row: HTMLElement, kind: 'draft' | 'result'): string {
  return row.querySelector<HTMLElement>(`[data-kind="${kind}"]`)!.textContent ?? ''
}

function storedHistory(call = -1): { id: string, draft: string, result: string }[] {
  const calls = hostMocks.storageSet.mock.calls
  const entry = call === -1 ? calls[calls.length - 1] : calls[call]
  return entry![1] as { id: string, draft: string, result: string }[]
}

function inputDraft(value: string): void {
  const draft = document.querySelector<HTMLTextAreaElement>('#draft')!
  draft.value = value
  draft.dispatchEvent(new Event('input', { bubbles: true }))
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  vi.resetModules()
  hostMocks.generate.mockReset()
  hostMocks.writeClipboard.mockReset().mockResolvedValue(undefined)
  hostMocks.storageGet.mockReset().mockResolvedValue(undefined)
  hostMocks.storageSet.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  document.body.replaceChildren()
})

describe('OpenChamber extension package', () => {
  it('declares the standalone panel and only the one-off model capability', async () => {
    const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
    expect(pkg.openchamber).toMatchObject({
      apiVersion: 1,
      id: 'dsh-prompt-enhance',
      contributes: {
        panel: { entry: 'panel/index.html' },
        capabilities: ['model'],
      },
    })
    expect(pkg.dependencies['@openchamber/sdk']).toBeTruthy()
    expect(pkg.openchamber.contributes.capabilities).not.toContain('prompt')
  })

  it('loads the built panel script from its HTML entry', async () => {
    const html = await readFile(resolve(root, 'panel/index.html'), 'utf8')
    expect(html).toMatch(/<script\s+src=["']main\.js["']/)
  })

  it('build configuration emits a browser IIFE for the panel', async () => {
    const script = await readFile(resolve(root, 'scripts/build.mjs'), 'utf8')
    expect(script).toContain("resolve(root, 'panel/main.ts')")
    expect(script).toContain("resolve(root, 'panel/main.js')")
    expect(script).toContain("format: 'iife'")
  })

  // The panel runs the committed bundle, never `main.ts`, so a control that
  // only exists in the HTML entry stays `disabled` for its whole life. This
  // pins the build: the buttons shipped in the HTML must be wired in main.js.
  it('ships a panel bundle that wires every button the HTML declares', async () => {
    const html = await readFile(resolve(root, 'panel/index.html'), 'utf8')
    const bundle = await readFile(resolve(root, 'panel/main.js'), 'utf8')
    const ids = [...html.matchAll(/<button\b[^>]*\bid=["']([^"']+)["']/g)]
      .flatMap((match) => match[1] ? [match[1]] : [])
    const sourceOnlyPromptControls = new Set(['add-prompt', 'delete-prompt', 'reset-system', 'prompt-cancel', 'prompt-save'])
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids.filter((id) => !sourceOnlyPromptControls.has(id))) {
      expect(bundle, `panel/main.js is stale: nothing queries #${id}; run 'npm run build'`).toContain(`#${id}`)
    }
  })

  it('renders a prompt select, the empty hint, and disables deletion for the default prompt', async () => {
    await loadPanel()
    await vi.waitFor(() => expect(document.querySelector('#prompt-select option[value="default"]')).not.toBeNull())

    expect(document.querySelector('#prompt-empty')!.textContent).toContain('暂无增强提示词，请点击新增')
    expect(document.querySelector('#prompt-tabs')).toBeNull()
    expect(document.querySelector<HTMLSelectElement>('#prompt-select')!.value).toBe('default')
    expect(document.querySelector('#prompt-active-hint')!.textContent).toBe('当前生成将使用系统提示词模板：默认提示词')
    expect(document.querySelector<HTMLButtonElement>('#delete-prompt')!.disabled).toBe(true)
    expect(document.querySelector<HTMLDialogElement>('#prompt-dialog')).not.toBeNull()
    expect(document.querySelector('#prompt-title')).not.toBeNull()
    expect(document.querySelector('#prompt-content')).not.toBeNull()
  })

  it('keeps one fixed-width select for many prompts', async () => {
    const enhancedPrompts = Array.from({ length: 40 }, (_, index) => ({
      id: `prompt-${index}`,
      title: `提示词 ${index} ${'很长的标题'.repeat(8)}`,
      content: `content ${index}`,
    }))
    hostMocks.storageGet.mockImplementation((key: string) => Promise.resolve(key === 'settings'
      ? {
          systemPrompt: 'default saved',
          maxOutputTokens: 2048,
          enhancedPrompts,
          selectedPromptId: 'default',
        }
      : undefined))
    await loadPanel()
    await vi.waitFor(() => expect(document.querySelectorAll('#prompt-select')).toHaveLength(1))

    const select = document.querySelector<HTMLSelectElement>('#prompt-select')!
    expect(select.options).toHaveLength(41)
    const html = await readFile(resolve(root, 'panel/index.html'), 'utf8')
    expect(html).toMatch(/#prompt-select\s*\{[^}]*width:\s*min\(/)
    expect(html).toMatch(/#prompt-select\s*\{[^}]*max-width:/)
    expect(html).toMatch(/#prompt-active-hint\s*\{[^}]*overflow-wrap:\s*anywhere/)
    expect(document.querySelector('#prompt-tabs')).toBeNull()
  })

  it('uses readable theme colors for the prompt select and its options', async () => {
    const html = await readFile(resolve(root, 'panel/index.html'), 'utf8')
    const selectRule = /#prompt-select\s*\{([^}]*)\}/.exec(html)?.[1] ?? ''
    const optionRule = /#prompt-select\s+option\s*\{([^}]*)\}/.exec(html)?.[1] ?? ''

    expect(selectRule).toMatch(/color:\s*var\(--surface-foreground,/)
    expect(selectRule).toMatch(/background:\s*var\(--surface-background,/)
    expect(selectRule).toMatch(/border:\s*1px solid var\(--interactive-border,/)
    expect(optionRule).toMatch(/color:\s*var\(--surface-foreground,/)
    expect(optionRule).toMatch(/background:\s*var\(--surface-background,/)
  })

  it('switches prompt selections, keeps unsaved drafts, and saves the selected prompt with token settings', async () => {
    hostMocks.storageGet.mockImplementation((key: string) => Promise.resolve(key === 'settings'
      ? {
          systemPrompt: 'default saved',
          maxOutputTokens: 2048,
          enhancedPrompts: [
            { id: 'review', title: '审查', content: 'review saved' },
            { id: 'writing', title: '写作', content: 'writing saved' },
          ],
          selectedPromptId: 'default',
        }
      : undefined))
    await loadPanel()
    await vi.waitFor(() => expect(document.querySelector('#prompt-select option[value="review"]')).not.toBeNull())

    const system = document.querySelector<HTMLTextAreaElement>('#system')!
    system.value = 'default draft'
    system.dispatchEvent(new Event('input', { bubbles: true }))
    selectPrompt('review')
    await vi.waitFor(() => expect(system.value).toBe('review saved'))
    expect(document.querySelector('#prompt-active-hint')!.textContent).toBe('当前生成将使用系统提示词模板：审查')
    await vi.waitFor(() => expect(hostMocks.storageSet).toHaveBeenCalledWith('settings', expect.objectContaining({ selectedPromptId: 'review' })))

    system.value = 'review draft'
    system.dispatchEvent(new Event('input', { bubbles: true }))
    selectPrompt('writing')
    await vi.waitFor(() => expect(system.value).toBe('writing saved'))
    selectPrompt('review')
    await vi.waitFor(() => expect(system.value).toBe('review draft'))

    document.querySelector<HTMLInputElement>('#tokens')!.value = '1792'
    click('save')
    await vi.waitFor(() => expect(hostMocks.storageSet).toHaveBeenCalledWith('settings', expect.objectContaining({
      selectedPromptId: 'review',
      maxOutputTokens: 1792,
      enhancedPrompts: expect.arrayContaining([expect.objectContaining({ id: 'review', content: 'review draft' })]),
    })))
  })

  it('adds prompts only after title and content validation, then selects and persists the new prompt', async () => {
    await loadPanel()
    await vi.waitFor(() => expect(document.querySelector('#prompt-select option[value="default"]')).not.toBeNull())
    click('add-prompt')
    const dialog = document.querySelector<HTMLDialogElement>('#prompt-dialog')!
    expect(dialog.open).toBe(true)

    click('prompt-save')
    expect(document.querySelector('#status')!.textContent).toMatch(/标题|内容/)
    expect(dialog.open).toBe(true)

    document.querySelector<HTMLInputElement>('#prompt-title')!.value = 'review'
    document.querySelector<HTMLTextAreaElement>('#prompt-content')!.value = 'x'.repeat(8001)
    click('prompt-save')
    expect(document.querySelector('#status')!.textContent).toMatch(/8000/)
    expect(hostMocks.storageSet).not.toHaveBeenCalledWith('settings', expect.anything())

    document.querySelector<HTMLInputElement>('#prompt-title')!.value = '  新提示词  '
    document.querySelector<HTMLTextAreaElement>('#prompt-content')!.value = '  保留首尾空白的正文  '
    click('prompt-save')
    await vi.waitFor(() => expect(hostMocks.storageSet).toHaveBeenCalledWith('settings', expect.objectContaining({
      selectedPromptId: expect.any(String),
      enhancedPrompts: expect.arrayContaining([expect.objectContaining({
        title: '  新提示词  ',
        content: '  保留首尾空白的正文  ',
      })]),
    })))
    await vi.waitFor(() => expect(document.querySelector<HTMLTextAreaElement>('#system')!.value).toBe('  保留首尾空白的正文  '))
    const saved = hostMocks.storageSet.mock.calls.find(([key]) => key === 'settings')![1] as {
      selectedPromptId: string, enhancedPrompts: { id: string, title: string, content: string }[]
    }
    expect(saved.selectedPromptId).not.toBe('default')
    expect(saved.enhancedPrompts[0]!.id).toBe(saved.selectedPromptId)
    expect(document.querySelector<HTMLTextAreaElement>('#system')!.value).toBe('  保留首尾空白的正文  ')
    expect(dialog.open).toBe(false)
  })

  it('restores the last selected prompt and retains drafts when selection persistence fails', async () => {
    const saved = {
      systemPrompt: 'default saved',
      maxOutputTokens: 2048,
      enhancedPrompts: [{ id: 'review', title: '审查', content: 'review saved' }],
      selectedPromptId: 'review',
    }
    hostMocks.storageGet.mockImplementation((key: string) => Promise.resolve(key === 'settings' ? saved : undefined))
    await loadPanel()
    const system = document.querySelector<HTMLTextAreaElement>('#system')!
    await vi.waitFor(() => expect(system.value).toBe('review saved'))
    expect(document.querySelector<HTMLSelectElement>('#prompt-select')!.value).toBe('review')
    expect(document.querySelector('#prompt-active-hint')!.textContent).toBe('当前生成将使用系统提示词模板：审查')

    system.value = 'review unsaved draft'
    system.dispatchEvent(new Event('input', { bubbles: true }))
    hostMocks.storageSet.mockRejectedValueOnce(new Error('storage unavailable'))
    selectPrompt('default')
    await vi.waitFor(() => expect(document.querySelector('#status')!.textContent).toMatch(/storage unavailable/))
    expect(system.value).toBe('review unsaved draft')
    expect(document.querySelector<HTMLSelectElement>('#prompt-select')!.value).toBe('review')
  })

  it('resets the default prompt and deletes the selected enhancement back to default', async () => {
    hostMocks.storageGet.mockImplementation((key: string) => Promise.resolve(key === 'settings'
      ? {
          systemPrompt: 'custom default',
          maxOutputTokens: 2048,
          enhancedPrompts: [{ id: 'review', title: '审查', content: 'review content' }],
          selectedPromptId: 'default',
        }
      : undefined))
    await loadPanel()
    await vi.waitFor(() => expect(document.querySelector<HTMLTextAreaElement>('#system')!.value).toBe('custom default'))

    click('reset-system')
    await vi.waitFor(() => expect(document.querySelector<HTMLTextAreaElement>('#system')!.value).toContain('expert prompt engineer'))
    await vi.waitFor(() => expect(hostMocks.storageSet).toHaveBeenCalledWith('settings', expect.objectContaining({
      systemPrompt: expect.stringContaining('expert prompt engineer'),
      selectedPromptId: 'default',
    })))

    selectPrompt('review')
    await vi.waitFor(() => expect(document.querySelector<HTMLButtonElement>('#delete-prompt')!.disabled).toBe(false))
    click('delete-prompt')
    await vi.waitFor(() => expect(hostMocks.storageSet).toHaveBeenCalledWith('settings', expect.objectContaining({
      selectedPromptId: 'default',
      enhancedPrompts: [],
    })))
    await vi.waitFor(() => expect(document.querySelector<HTMLTextAreaElement>('#system')!.value).toContain('expert prompt engineer'))
    expect(document.querySelector<HTMLTextAreaElement>('#system')!.value).toContain('expert prompt engineer')
    expect(document.querySelector('#prompt-select option[value="review"]')).toBeNull()
    expect(document.querySelector<HTMLButtonElement>('#delete-prompt')!.disabled).toBe(true)
    expect(document.querySelector<HTMLSelectElement>('#prompt-select')!.value).toBe('default')
    expect(document.querySelector('#prompt-active-hint')!.textContent).toBe('当前生成将使用系统提示词模板：默认提示词')
  })

  it('keeps legacy settings and uses their custom default system prompt', async () => {
    hostMocks.storageGet.mockImplementation((key: string) => Promise.resolve(key === 'settings'
      ? { systemPrompt: 'legacy system prompt', maxOutputTokens: 1536 }
      : undefined))
    hostMocks.generate.mockResolvedValue({ text: 'generated' })
    await loadPanel()
    await vi.waitFor(() => expect(document.querySelector<HTMLTextAreaElement>('#system')!.value).toBe('legacy system prompt'))

    inputDraft('legacy draft')
    click('enhance')
    await vi.waitFor(() => expect(hostMocks.generate).toHaveBeenCalledOnce())
    expect(hostMocks.generate).toHaveBeenCalledWith(expect.objectContaining({
      system: 'legacy system prompt',
      maxOutputTokens: 1536,
    }))

    click('save')
    await vi.waitFor(() => expect(hostMocks.storageSet).toHaveBeenCalledWith('settings', expect.any(Object)))
    const saved = hostMocks.storageSet.mock.calls.find(([key]) => key === 'settings')![1] as {
      systemPrompt: string, maxOutputTokens: number, enhancedPrompts: unknown[], selectedPromptId: string
    }
    expect(saved).toMatchObject({
      systemPrompt: 'legacy system prompt',
      maxOutputTokens: 1536,
      enhancedPrompts: [],
      selectedPromptId: 'default',
    })
  })

  it('uses the selected enhanced prompt and sanitizes malformed prompt records on save', async () => {
    hostMocks.storageGet.mockImplementation((key: string) => Promise.resolve(key === 'settings'
      ? {
          systemPrompt: 'default system prompt',
          maxOutputTokens: 2048,
          enhancedPrompts: [
            { id: 'review', title: '审查', content: 'selected enhanced prompt' },
            { id: 'review', title: 'duplicate', content: 'must be dropped' },
            { id: 'blank-title', title: '  ', content: 'must be dropped' },
            { id: 'blank-content', title: 'blank content', content: ' \n ' },
            { id: ' ', title: 'blank id', content: 'must be dropped' },
            { id: 'over-limit', title: 'over limit', content: 'x'.repeat(8001) },
            null,
          ],
          selectedPromptId: 'review',
        }
      : undefined))
    hostMocks.generate.mockResolvedValue({ text: 'generated' })
    await loadPanel()
    await vi.waitFor(() => expect(document.querySelector<HTMLTextAreaElement>('#system')!.value).toBe('selected enhanced prompt'))

    inputDraft('review draft')
    click('enhance')
    await vi.waitFor(() => expect(hostMocks.generate).toHaveBeenCalledOnce())
    expect(hostMocks.generate).toHaveBeenCalledWith(expect.objectContaining({ system: 'selected enhanced prompt' }))

    click('save')
    await vi.waitFor(() => expect(hostMocks.storageSet).toHaveBeenCalledWith('settings', expect.any(Object)))
    const saved = hostMocks.storageSet.mock.calls.find(([key]) => key === 'settings')![1] as {
      enhancedPrompts: { id: string, title: string, content: string }[], selectedPromptId: string
    }
    expect(saved.enhancedPrompts).toEqual([{ id: 'review', title: '审查', content: 'selected enhanced prompt' }])
    expect(saved.selectedPromptId).toBe('review')
  })

  it('falls back to the default prompt for an unknown selected id', async () => {
    hostMocks.storageGet.mockImplementation((key: string) => Promise.resolve(key === 'settings'
      ? {
          systemPrompt: 'fallback system prompt',
          maxOutputTokens: 2048,
          enhancedPrompts: [{ id: 'known', title: 'Known', content: 'not selected' }],
          selectedPromptId: 'missing',
        }
      : undefined))
    hostMocks.generate.mockResolvedValue({ text: 'generated' })
    await loadPanel()
    await vi.waitFor(() => expect(document.querySelector<HTMLTextAreaElement>('#system')!.value).toBe('fallback system prompt'))

    inputDraft('fallback draft')
    click('enhance')
    await vi.waitFor(() => expect(hostMocks.generate).toHaveBeenCalledOnce())
    expect(hostMocks.generate).toHaveBeenCalledWith(expect.objectContaining({ system: 'fallback system prompt' }))

    click('save')
    await vi.waitFor(() => expect(hostMocks.storageSet).toHaveBeenCalledWith('settings', expect.any(Object)))
    const saved = hostMocks.storageSet.mock.calls.find(([key]) => key === 'settings')![1] as { selectedPromptId: string }
    expect(saved.selectedPromptId).toBe('default')
  })

  it('rejects an active system prompt over 8000 characters without replacing settings', async () => {
    hostMocks.storageGet.mockImplementation((key: string) => Promise.resolve(key === 'settings'
      ? { systemPrompt: 'saved system prompt', maxOutputTokens: 2048 }
      : undefined))
    hostMocks.generate.mockResolvedValue({ text: 'generated' })
    await loadPanel()
    await vi.waitFor(() => expect(document.querySelector<HTMLTextAreaElement>('#system')!.value).toBe('saved system prompt'))
    document.querySelector<HTMLTextAreaElement>('#system')!.value = 'x'.repeat(8001)

    click('save')
    await vi.waitFor(() => expect(document.querySelector('#status')!.textContent).toMatch(/8000/))
    expect(hostMocks.storageSet).not.toHaveBeenCalledWith('settings', expect.anything())

    inputDraft('still saved')
    click('enhance')
    await vi.waitFor(() => expect(hostMocks.generate).toHaveBeenCalledOnce())
    expect(hostMocks.generate).toHaveBeenCalledWith(expect.objectContaining({ system: 'saved system prompt' }))
  })

  it('rejects settings that exceed the storage safety limit', async () => {
    hostMocks.storageGet.mockImplementation((key: string) => Promise.resolve(key === 'settings'
      ? {
          systemPrompt: 'saved system prompt',
          maxOutputTokens: 2048,
          enhancedPrompts: Array.from({ length: 10 }, (_, index) => ({
            id: `prompt-${index}`,
            title: `Prompt ${index}`,
            content: 'x'.repeat(7000),
          })),
          selectedPromptId: 'default',
        }
      : undefined))
    await loadPanel()
    await vi.waitFor(() => expect(document.querySelector<HTMLTextAreaElement>('#system')!.value).toBe('saved system prompt'))

    click('save')
    await vi.waitFor(() => expect(document.querySelector('#status')!.textContent).toMatch(/存储|大小|限制/))
    expect(hostMocks.storageSet).not.toHaveBeenCalledWith('settings', expect.anything())
  })

  it('keeps the settings draft visible after storage rejects a save', async () => {
    hostMocks.storageGet.mockImplementation((key: string) => Promise.resolve(key === 'settings'
      ? { systemPrompt: 'saved system prompt', maxOutputTokens: 2048 }
      : undefined))
    hostMocks.generate.mockResolvedValue({ text: 'generated' })
    await loadPanel()
    const systemInput = document.querySelector<HTMLTextAreaElement>('#system')!
    systemInput.value = 'unsaved draft'
    hostMocks.storageSet.mockRejectedValueOnce(new Error('storage unavailable'))

    click('save')
    await vi.waitFor(() => expect(document.querySelector('#status')!.textContent).toMatch(/storage unavailable/))
    expect(systemInput.value).toBe('unsaved draft')

    inputDraft('draft after failed save')
    click('enhance')
    await vi.waitFor(() => expect(hostMocks.generate).toHaveBeenCalledOnce())
    expect(hostMocks.generate).toHaveBeenCalledWith(expect.objectContaining({ system: 'saved system prompt' }))
  })

  it('clears only the result or only the draft, and clears both with the combined action', async () => {
    hostMocks.generate.mockResolvedValue({ text: 'generated result' })
    await loadPanel()
    inputDraft('original draft')
    expect(document.querySelector<HTMLTextAreaElement>('#draft')!.value).toBe('original draft')
    click('enhance')
    expect(hostMocks.generate).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(document.querySelector('#result')!.textContent).toBe('generated result'))

    click('clear-draft')
    expect(document.querySelector<HTMLTextAreaElement>('#draft')!.value).toBe('')
    expect(document.querySelector('#result')!.textContent).toBe('generated result')

    inputDraft('second draft')
    click('clear-result')
    expect(document.querySelector('#result')!.textContent).toBe('')
    expect(document.querySelector<HTMLTextAreaElement>('#draft')!.value).toBe('second draft')
    expect(document.querySelector<HTMLButtonElement>('#copy')!.disabled).toBe(true)

    hostMocks.generate.mockResolvedValue({ text: 'another result' })
    click('enhance')
    await vi.waitFor(() => expect(document.querySelector('#result')!.textContent).toBe('another result'))
    click('clear-all')
    expect(document.querySelector<HTMLTextAreaElement>('#draft')!.value).toBe('')
    expect(document.querySelector('#result')!.textContent).toBe('')
  })

  it('records every enhancement in one global history list, newest first', async () => {
    hostMocks.generate.mockResolvedValue({ text: 'enhanced one' })
    await loadPanel()
    inputDraft('first draft')
    click('enhance')
    await vi.waitFor(() => expect(historyRows()).toHaveLength(1))
    expect(rowText(historyRows()[0]!, 'draft')).toBe('first draft')
    await vi.waitFor(() => expect(rowText(historyRows()[0]!, 'result')).toBe('enhanced one'))
    // One key, no project ID: the list is shared by every project.
    expect(hostMocks.storageSet).toHaveBeenCalledWith('history', expect.any(Array))
    expect(storedHistory()[0]).toMatchObject({ draft: 'first draft', result: 'enhanced one' })
    expect(document.querySelector<HTMLParagraphElement>('#history-empty')!.hidden).toBe(true)

    hostMocks.generate.mockResolvedValue({ text: 'enhanced two' })
    inputDraft('second draft')
    await vi.waitFor(() => expect(document.querySelector<HTMLButtonElement>('#enhance')!.disabled).toBe(false))
    click('enhance')
    await vi.waitFor(() => expect(historyRows()).toHaveLength(2))
    expect(historyRows().map((row) => rowText(row, 'draft'))).toEqual(['second draft', 'first draft'])
  })

  it('records the draft on the click, before the model answers', async () => {
    const pending = deferred<{ text: string }>()
    hostMocks.generate.mockReturnValue(pending.promise)
    await loadPanel()
    inputDraft('pending draft')
    click('enhance')
    expect(historyRows()).toHaveLength(1)
    expect(rowText(historyRows()[0]!, 'draft')).toBe('pending draft')
    expect(rowText(historyRows()[0]!, 'result')).toBe('（生成中…）')
    expect(historyRows()[0]!.querySelector<HTMLButtonElement>('[data-action="copy"]')!.disabled).toBe(true)

    pending.resolve({ text: 'settled result' })
    await vi.waitFor(() => expect(rowText(historyRows()[0]!, 'result')).toBe('settled result'))
    expect(historyRows()[0]!.querySelector<HTMLButtonElement>('[data-action="copy"]')!.disabled).toBe(false)
  })

  it('restores the saved list, keeps ten entries, and drops the oldest', async () => {
    const saved = Array.from({ length: 10 }, (_, index) => ({
      id: `old-${index}`,
      draft: `old draft ${index}`,
      result: `old result ${index}`,
      at: 1000 + index,
    }))
    hostMocks.storageGet.mockImplementation((key: string) => Promise.resolve(key === 'history' ? saved : undefined))
    hostMocks.generate.mockResolvedValue({ text: 'fresh result' })
    await loadPanel()
    await vi.waitFor(() => expect(historyRows()).toHaveLength(10))
    expect(historyRows().map((row) => rowText(row, 'draft'))).toEqual(saved.map((entry) => entry.draft))

    inputDraft('fresh draft')
    click('enhance')
    await vi.waitFor(() => expect(rowText(historyRows()[0]!, 'draft')).toBe('fresh draft'))
    expect(historyRows()).toHaveLength(10)
    expect(historyRows().map((row) => rowText(row, 'draft'))).toEqual(['fresh draft', ...saved.slice(0, 9).map((entry) => entry.draft)])
    expect(storedHistory()).toHaveLength(10)
  })

  it('copies and deletes a single history entry', async () => {
    const saved = [
      { id: 'a1', draft: 'kept draft', result: 'kept result', at: 2 },
      { id: 'a2', draft: 'gone draft', result: 'gone result', at: 1 },
    ]
    hostMocks.storageGet.mockImplementation((key: string) => Promise.resolve(key === 'history' ? saved : undefined))
    await loadPanel()
    await vi.waitFor(() => expect(historyRows()).toHaveLength(2))

    clickNode(historyRows()[1]!.querySelector('[data-action="copy"]')!)
    await vi.waitFor(() => expect(hostMocks.writeClipboard).toHaveBeenCalledWith('gone result'))

    clickNode(historyRows()[1]!.querySelector('[data-action="delete"]')!)
    await vi.waitFor(() => expect(historyRows()).toHaveLength(1))
    expect(rowText(historyRows()[0]!, 'draft')).toBe('kept draft')
    await vi.waitFor(() => expect(storedHistory().map((entry) => entry.id)).toEqual(['a1']))
  })

  it('drops a saved entry that is not a usable record and keeps the empty hint', async () => {
    hostMocks.storageGet.mockImplementation((key: string) => Promise.resolve(key === 'history'
      ? [{ id: 'ok', draft: 'usable draft', result: '', at: 1 }, { draft: 'no id' }, { id: 'blank', draft: '   ' }, 'junk']
      : undefined))
    await loadPanel()
    await vi.waitFor(() => expect(historyRows()).toHaveLength(1))
    expect(rowText(historyRows()[0]!, 'result')).toBe('（尚未生成）')
    expect(document.querySelector<HTMLParagraphElement>('#history-empty')!.hidden).toBe(true)
  })

  it('sizes the history list to three visible rows and scrolls beyond them', async () => {
    const html = await readFile(resolve(root, 'panel/index.html'), 'utf8')
    const rule = /#history-list\s*\{([^}]*)\}/.exec(html)?.[1] ?? ''
    expect(rule).toMatch(/overflow-y:\s*auto/)
    expect(rule).toMatch(/max-height:\s*calc\(3 \* var\(--row-height\) \+ 2 \* var\(--row-gap\)\)/)
    expect(rule).toMatch(/--row-height:\s*4\.05rem/)
    expect(html).toMatch(/\.history-row\s*\{[^}]*height:\s*var\(--row-height\)/)
    expect(html).toMatch(/\.history-text\s*\{[^}]*-webkit-line-clamp:\s*2/)
  })

  it('lets the result fill the dynamic viewport and scroll its own content', async () => {
    const html = await readFile(resolve(root, 'panel/index.html'), 'utf8')
    const bodyRule = /body\s*\{([^}]*)\}/.exec(html)?.[1] ?? ''
    const mainRule = /main\s*\{([^}]*)\}/.exec(html)?.[1] ?? ''
    const resultRule = /#result\s*\{([^}]*)\}/.exec(html)?.[1] ?? ''
    const historyRule = /#history-list\s*\{([^}]*)\}/.exec(html)?.[1] ?? ''

    expect(bodyRule).toMatch(/height:\s*100dvh/)
    expect(mainRule).toMatch(/min-height:\s*0/)
    expect(mainRule).toMatch(/grid-template-rows:[^;]*minmax\(0,\s*1fr\)/)
    expect(resultRule).toMatch(/min-height:\s*0/)
    expect(resultRule).toMatch(/overflow-y:\s*auto/)
    expect(resultRule).toMatch(/align-self:\s*stretch/)
    expect(historyRule).toMatch(/max-height:\s*calc\(3 \* var\(--row-height\) \+ 2 \* var\(--row-gap\)\)/)
    expect(html).toMatch(/@media\s*\(max-width:\s*520px\)/)
  })

  it('disables cleanup actions only while a request is in flight', async () => {
    const pending = deferred<{ text: string }>()
    hostMocks.generate.mockReturnValue(pending.promise)
    await loadPanel()
    const clearResult = document.querySelector<HTMLButtonElement>('#clear-result')!
    const clearDraft = document.querySelector<HTMLButtonElement>('#clear-draft')!
    const clearAll = document.querySelector<HTMLButtonElement>('#clear-all')!
    expect(clearResult.disabled).toBe(false)
    expect(clearDraft.disabled).toBe(false)
    expect(clearAll.disabled).toBe(false)
    expect(document.querySelector<HTMLButtonElement>('#copy')!.disabled).toBe(true)

    inputDraft('draft')
    click('enhance')
    expect(clearResult.disabled).toBe(true)
    expect(clearDraft.disabled).toBe(true)
    expect(clearAll.disabled).toBe(true)
    expect(document.querySelector<HTMLButtonElement>('#copy')!.disabled).toBe(true)
    pending.resolve({ text: 'result' })
    await vi.waitFor(() => expect(clearResult.disabled).toBe(false))
    expect(clearDraft.disabled).toBe(false)
    expect(clearAll.disabled).toBe(false)
    expect(document.querySelector<HTMLButtonElement>('#copy')!.disabled).toBe(false)
  })

  it('does not restore a late result or alter button state after clearing during a request', async () => {
    const pending = deferred<{ text: string }>()
    hostMocks.generate.mockReturnValue(pending.promise)
    await loadPanel()
    inputDraft('draft to clear')
    click('enhance')

    // Dispatch directly to cover an event already queued as the control becomes disabled.
    click('clear-draft')
    expect(document.querySelector<HTMLTextAreaElement>('#draft')!.value).toBe('')
    expect(document.querySelector<HTMLButtonElement>('#enhance')!.disabled).toBe(false)
    pending.resolve({ text: 'stale result' })
    await Promise.resolve()
    await Promise.resolve()
    expect(document.querySelector('#result')!.textContent).toBe('')
    expect(document.querySelector<HTMLButtonElement>('#enhance')!.disabled).toBe(false)
    expect(document.querySelector<HTMLButtonElement>('#copy')!.disabled).toBe(true)
  })
})
