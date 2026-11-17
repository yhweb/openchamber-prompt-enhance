// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

const { host } = vi.hoisted(() => ({
  host: {
    onReady: vi.fn(() => () => undefined),
    storage: {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
    },
    generate: vi.fn(),
    writeClipboard: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@openchamber/sdk', () => ({ connectHost: () => host }))
vi.mock('@openchamber/sdk/ui', () => ({ applyHostReady: vi.fn() }))
vi.mock('../src/prompts', () => ({
  DEFAULT_SYSTEM_PROMPT: 'test system prompt',
  frameUserPrompt: (text: string) => `<raw_prompt>${text}</raw_prompt>`,
}))

function renderPanel(): void {
  document.body.innerHTML = `
    <textarea id="draft"></textarea>
    <button id="enhance"></button>
    <div id="cleanup-actions">
      <button id="copy" disabled></button>
      <button id="clear-result" disabled></button>
      <button id="clear-draft" disabled></button>
      <button id="clear-all" disabled></button>
    </div>
    <div id="status"></div>
    <div id="result"></div>
    <textarea id="system"></textarea>
    <input id="tokens" />
    <button id="save"></button>
  `
}

describe('OpenChamber panel flow', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    host.storage.get.mockResolvedValue(undefined)
    host.storage.set.mockResolvedValue(undefined)
    host.writeClipboard.mockResolvedValue(undefined)
    renderPanel()
  })

  it('declares Simplified Chinese and the 提词增强 display name', () => {
    const html = readFileSync('panel/index.html', 'utf8')
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(html).toContain('<html lang="zh-CN">')
    expect(html).toContain('<title>提词增强</title>')
    expect(manifest.openchamber.name).toBe('提词增强')
  })

  it('generates from the manual draft and renders the result', async () => {
    host.generate.mockResolvedValue({ text: 'structured prompt' })
    await import('../panel/main.ts')
    const draft = document.querySelector<HTMLTextAreaElement>('#draft')!
    draft.value = 'write a crawler'
    document.querySelector<HTMLButtonElement>('#enhance')!.click()
    await vi.waitFor(() => expect(host.generate).toHaveBeenCalledOnce())
    expect(host.generate.mock.calls[0]?.[0]).toMatchObject({
      system: expect.any(String),
      maxOutputTokens: 2048,
    })
    expect(host.generate.mock.calls[0]?.[0].prompt).toContain('write a crawler')
    await vi.waitFor(() => expect(document.querySelector('#result')?.textContent).toBe('structured prompt'))
  })

  it('refuses empty input without calling the model', async () => {
    await import('../panel/main.ts')
    document.querySelector<HTMLButtonElement>('#enhance')!.click()
    expect(host.generate).not.toHaveBeenCalled()
    expect(document.querySelector('#status')?.textContent).toContain('请输入需要增强的提词')
  })

  it('keeps the draft and exposes a retry after generation failure', async () => {
    host.generate.mockRejectedValue(new Error('NO_MODEL'))
    await import('../panel/main.ts')
    const draft = document.querySelector<HTMLTextAreaElement>('#draft')!
    draft.value = 'keep this draft'
    document.querySelector<HTMLButtonElement>('#enhance')!.click()
    await vi.waitFor(() => expect(document.querySelector('#status')?.textContent).toContain('提词增强失败'))
    expect(document.querySelector('#status')?.textContent).toContain('原始提词未改变，可以重试')
    expect(draft.value).toBe('keep this draft')
    expect(document.querySelector<HTMLButtonElement>('#enhance')!.disabled).toBe(false)
  })

  it('copies the displayed result through the host clipboard API', async () => {
    host.generate.mockResolvedValue({ text: 'copy me' })
    await import('../panel/main.ts')
    const draft = document.querySelector<HTMLTextAreaElement>('#draft')!
    draft.value = 'draft'
    document.querySelector<HTMLButtonElement>('#enhance')!.click()
    await vi.waitFor(() => expect(document.querySelector('#result')?.textContent).toBe('copy me'))
    document.querySelector<HTMLButtonElement>('#copy')!.click()
    await vi.waitFor(() => expect(host.writeClipboard).toHaveBeenCalledWith('copy me'))
    expect(document.querySelector('#status')?.textContent).toBe('已复制增强结果。')
  })

  it('rejects output token values outside the supported range in Chinese', async () => {
    await import('../panel/main.ts')
    const tokens = document.querySelector<HTMLInputElement>('#tokens')!
    tokens.value = '64'
    document.querySelector<HTMLButtonElement>('#save')!.click()
    await vi.waitFor(() => expect(document.querySelector('#status')?.textContent).toBe('输出令牌数必须在 128 到 4000 之间。'))
    expect(host.storage.set).not.toHaveBeenCalled()
  })

  it('shows the draft freshness notice in Chinese after the draft changes', async () => {
    host.generate.mockResolvedValue({ text: 'old result' })
    await import('../panel/main.ts')
    const draft = document.querySelector<HTMLTextAreaElement>('#draft')!
    draft.value = 'first draft'
    document.querySelector<HTMLButtonElement>('#enhance')!.click()
    await vi.waitFor(() => expect(document.querySelector('#result')?.textContent).toBe('old result'))
    draft.value = 'new draft'
    draft.dispatchEvent(new Event('input'))
    expect(document.querySelector('#status')?.textContent).toBe('提词已更改；当前显示的结果对应先前的提词。')
  })

  it('does not let an older response replace a newer result', async () => {
    let resolveFirst: ((value: { text: string }) => void) | undefined
    const firstResponse = new Promise<{ text: string }>((resolve) => { resolveFirst = resolve })
    host.generate
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValueOnce({ text: 'new result' })
    await import('../panel/main.ts')
    const draft = document.querySelector<HTMLTextAreaElement>('#draft')!
    const enhanceButton = document.querySelector<HTMLButtonElement>('#enhance')!
    draft.value = 'first draft'
    enhanceButton.click()
    await vi.waitFor(() => expect(host.generate).toHaveBeenCalledOnce())
    enhanceButton.disabled = false
    draft.value = 'second draft'
    enhanceButton.click()
    await vi.waitFor(() => expect(document.querySelector('#result')?.textContent).toBe('new result'))
    resolveFirst?.({ text: 'old result' })
    await Promise.resolve()
    expect(document.querySelector('#result')?.textContent).toBe('new result')
  })
})
