import { connectHost } from '@openchamber/sdk'
import { applyHostReady } from '@openchamber/sdk/ui'
import { DEFAULT_SYSTEM_PROMPT, frameUserPrompt } from '../src/prompts'

interface EnhancerSettings {
  systemPrompt: string
  maxOutputTokens: number
}

const DEFAULT_SETTINGS: EnhancerSettings = {
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  maxOutputTokens: 2048,
}
const SETTINGS_KEY = 'settings'
const host = connectHost()
const draft = document.querySelector<HTMLTextAreaElement>('#draft')!
const result = document.querySelector<HTMLDivElement>('#result')!
const status = document.querySelector<HTMLDivElement>('#status')!
const enhanceButton = document.querySelector<HTMLButtonElement>('#enhance')!
const copyButton = document.querySelector<HTMLButtonElement>('#copy')!
const systemInput = document.querySelector<HTMLTextAreaElement>('#system')!
const tokensInput = document.querySelector<HTMLInputElement>('#tokens')!
const saveButton = document.querySelector<HTMLButtonElement>('#save')!
let settings = DEFAULT_SETTINGS
let requestId = 0

function setStatus(message: string, kind: 'info' | 'error' = 'info'): void {
  status.textContent = message
  status.dataset.kind = kind
}

function sanitizeSettings(value: unknown): EnhancerSettings {
  if (typeof value !== 'object' || value === null) return DEFAULT_SETTINGS
  const candidate = value as Partial<EnhancerSettings>
  return {
    systemPrompt: typeof candidate.systemPrompt === 'string' && candidate.systemPrompt.trim()
      ? candidate.systemPrompt
      : DEFAULT_SETTINGS.systemPrompt,
    maxOutputTokens: typeof candidate.maxOutputTokens === 'number'
      ? Math.max(128, Math.min(4000, Math.round(candidate.maxOutputTokens / 128) * 128))
      : DEFAULT_SETTINGS.maxOutputTokens,
  }
}

function showSettings(): void {
  systemInput.value = settings.systemPrompt
  tokensInput.value = String(settings.maxOutputTokens)
}

async function loadSettings(): Promise<void> {
  try {
    settings = sanitizeSettings(await host.storage.get(SETTINGS_KEY))
  } catch {
    settings = DEFAULT_SETTINGS
    setStatus('无法读取已保存的设置，当前使用默认设置。', 'error')
  }
  showSettings()
}

async function enhance(): Promise<void> {
  const text = draft.value
  if (!text.trim()) {
    setStatus('请输入需要增强的提词。', 'error')
    return
  }
  const currentRequest = ++requestId
  enhanceButton.disabled = true
  copyButton.disabled = true
  setStatus('正在使用小模型增强提词……')
  try {
    const response = await host.generate({
      prompt: frameUserPrompt(text),
      system: settings.systemPrompt,
      maxOutputTokens: settings.maxOutputTokens,
    })
    if (currentRequest !== requestId) return
    result.textContent = response.text
    copyButton.disabled = !response.text
    setStatus('提词增强完成。')
  } catch (error) {
    if (currentRequest !== requestId) return
    const message = error instanceof Error ? error.message : '未知错误'
    setStatus(`提词增强失败（${message}）。原始提词未改变，可以重试。`, 'error')
  } finally {
    if (currentRequest === requestId) enhanceButton.disabled = false
  }
}

enhanceButton.addEventListener('click', () => { void enhance() })
copyButton.addEventListener('click', async () => {
  try {
    await host.writeClipboard(result.textContent ?? '')
    setStatus('已复制增强结果。')
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    setStatus(`复制失败（${message}）。增强结果仍保留在上方。`, 'error')
  }
})
saveButton.addEventListener('click', async () => {
  const maxOutputTokens = Number(tokensInput.value)
  if (!Number.isFinite(maxOutputTokens) || maxOutputTokens < 128 || maxOutputTokens > 4000) {
    setStatus('输出令牌数必须在 128 到 4000 之间。', 'error')
    return
  }
  settings = sanitizeSettings({ systemPrompt: systemInput.value, maxOutputTokens })
  try {
    await host.storage.set(SETTINGS_KEY, { ...settings })
    showSettings()
    setStatus('设置已保存。')
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    setStatus(`保存设置失败（${message}）。`, 'error')
  }
})
draft.addEventListener('input', () => {
  if (result.textContent) setStatus('提词已更改；当前显示的结果对应先前的提词。')
})

host.onReady((ctx) => {
  applyHostReady(ctx, document.documentElement)
})

void loadSettings()
