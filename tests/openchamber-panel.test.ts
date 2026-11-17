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

  it('disables cleanup actions for empty content and throughout an in-flight request', async () => {
    const pending = deferred<{ text: string }>()
    hostMocks.generate.mockReturnValue(pending.promise)
    await loadPanel()
    const clearResult = document.querySelector<HTMLButtonElement>('#clear-result')!
    const clearDraft = document.querySelector<HTMLButtonElement>('#clear-draft')!
    const clearAll = document.querySelector<HTMLButtonElement>('#clear-all')!
    expect(clearResult.disabled).toBe(true)
    expect(clearDraft.disabled).toBe(true)
    expect(clearAll.disabled).toBe(true)

    inputDraft('draft')
    expect(clearDraft.disabled).toBe(false)
    expect(clearAll.disabled).toBe(false)
    click('enhance')
    expect(clearResult.disabled).toBe(true)
    expect(clearDraft.disabled).toBe(true)
    expect(clearAll.disabled).toBe(true)
    expect(document.querySelector<HTMLButtonElement>('#copy')!.disabled).toBe(true)
    pending.resolve({ text: 'result' })
    await vi.waitFor(() => expect(clearResult.disabled).toBe(false))
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
