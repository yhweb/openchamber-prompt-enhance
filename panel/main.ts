import { connectHost } from '@openchamber/sdk'
import { applyHostReady } from '@openchamber/sdk/ui'
import { DEFAULT_SYSTEM_PROMPT, frameUserPrompt } from '../src/prompts'

interface EnhancerSettings {
  systemPrompt: string
  maxOutputTokens: number
}

/** One recorded enhancement, shared by every project. */
type HistoryEntry = {
  id: string
  draft: string
  result: string
  at: number
}

const DEFAULT_SETTINGS: EnhancerSettings = {
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  maxOutputTokens: 2048,
}
const SETTINGS_KEY = 'settings'
// Deliberately no project ID in the key: extension storage is server-owned, so
// one key is one list for every project the panel is opened from.
const HISTORY_KEY = 'history'
const HISTORY_LIMIT = 10
// One key holds the whole list and the host caps a value at 64 KiB, so entries
// are clipped and the oldest are dropped until the serialized list fits.
const HISTORY_FIELD_LIMIT = 8000
const HISTORY_BYTES_LIMIT = 60 * 1024

const host = connectHost()
const draft = document.querySelector<HTMLTextAreaElement>('#draft')!
const result = document.querySelector<HTMLDivElement>('#result')!
const status = document.querySelector<HTMLDivElement>('#status')!
const enhanceButton = document.querySelector<HTMLButtonElement>('#enhance')!
const copyButton = document.querySelector<HTMLButtonElement>('#copy')!
const clearResultButton = document.querySelector<HTMLButtonElement>('#clear-result')!
const clearDraftButton = document.querySelector<HTMLButtonElement>('#clear-draft')!
const clearAllButton = document.querySelector<HTMLButtonElement>('#clear-all')!
const systemInput = document.querySelector<HTMLTextAreaElement>('#system')!
const tokensInput = document.querySelector<HTMLInputElement>('#tokens')!
const saveButton = document.querySelector<HTMLButtonElement>('#save')!
const historyList = document.querySelector<HTMLDivElement>('#history-list')!
const historyEmpty = document.querySelector<HTMLParagraphElement>('#history-empty')!
let settings = DEFAULT_SETTINGS
let historyEntries: HistoryEntry[] = []
let requestId = 0
let requestInFlight = false
/** Entry whose generation is still running; its row reads "生成中…". */
let pendingHistoryId: string | null = null

function setStatus(message: string, kind: 'info' | 'error' = 'info'): void {
  status.textContent = message
  status.dataset.kind = kind
}

function updateActionStates(): void {
  const hasResult = Boolean(result.textContent)
  // Cleanup actions stay clickable with nothing to clear: the only state that
  // makes them unavailable is a request in flight, since clearing during one
  // would race the result it is about to write.
  clearResultButton.disabled = requestInFlight
  clearDraftButton.disabled = requestInFlight
  clearAllButton.disabled = requestInFlight
  copyButton.disabled = requestInFlight || !hasResult
}

function invalidateRequest(): void {
  requestId += 1
  requestInFlight = false
  pendingHistoryId = null
  enhanceButton.disabled = false
  renderHistory()
}

function clearResult(): void {
  invalidateRequest()
  result.textContent = ''
  updateActionStates()
  setStatus('已清空增强结果。')
}

function clearDraft(): void {
  invalidateRequest()
  draft.value = ''
  updateActionStates()
  setStatus('已清空草稿。')
}

function clearAll(): void {
  invalidateRequest()
  result.textContent = ''
  draft.value = ''
  updateActionStates()
  setStatus('已清空草稿和增强结果。')
}

function newHistoryId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function clipField(text: string): string {
  return text.length > HISTORY_FIELD_LIMIT ? `${text.slice(0, HISTORY_FIELD_LIMIT)}…` : text
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

/** Clip oversized fields, cap the count, and keep the stored value under the host's limit. */
function fitHistory(entries: HistoryEntry[]): HistoryEntry[] {
  const fitted = entries.slice(0, HISTORY_LIMIT).map((entry) => ({
    ...entry,
    draft: clipField(entry.draft),
    result: clipField(entry.result),
  }))
  while (fitted.length > 1 && byteLength(JSON.stringify(fitted)) > HISTORY_BYTES_LIMIT) fitted.pop()
  return fitted
}

function sanitizeHistory(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const entries: HistoryEntry[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue
    const candidate = item as Partial<HistoryEntry>
    if (typeof candidate.id !== 'string' || candidate.id === '' || seen.has(candidate.id)) continue
    if (typeof candidate.draft !== 'string' || candidate.draft.trim() === '') continue
    seen.add(candidate.id)
    entries.push({
      id: candidate.id,
      draft: candidate.draft,
      result: typeof candidate.result === 'string' ? candidate.result : '',
      at: typeof candidate.at === 'number' && Number.isFinite(candidate.at) ? candidate.at : 0,
    })
  }
  return fitHistory(entries)
}

async function persistHistory(): Promise<void> {
  try {
    await host.storage.set(HISTORY_KEY, historyEntries)
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    setStatus(`历史记录保存失败（${message}）。`, 'error')
  }
}

function historyRow(entry: HistoryEntry): HTMLDivElement {
  const row = document.createElement('div')
  row.className = 'history-row'
  row.dataset.id = entry.id

  const draftText = document.createElement('p')
  draftText.className = 'history-text'
  draftText.dataset.kind = 'draft'
  draftText.textContent = entry.draft
  draftText.title = entry.draft

  const resultText = document.createElement('p')
  resultText.className = 'history-text'
  resultText.dataset.kind = 'result'
  resultText.textContent = entry.result !== ''
    ? entry.result
    : pendingHistoryId === entry.id ? '（生成中…）' : '（尚未生成）'
  if (entry.result !== '') resultText.title = entry.result

  const actions = document.createElement('div')
  actions.className = 'history-actions'

  const copyAction = document.createElement('button')
  copyAction.type = 'button'
  copyAction.dataset.action = 'copy'
  copyAction.textContent = '复制增强'
  copyAction.disabled = entry.result === ''
  copyAction.addEventListener('click', () => { void copyHistoryResult(entry) })

  const deleteAction = document.createElement('button')
  deleteAction.type = 'button'
  deleteAction.dataset.action = 'delete'
  deleteAction.textContent = '删除本条'
  deleteAction.addEventListener('click', () => { void deleteHistoryEntry(entry.id) })

  actions.append(copyAction, deleteAction)
  row.append(draftText, resultText, actions)
  return row
}

function renderHistory(): void {
  historyList.replaceChildren(...historyEntries.map(historyRow))
  historyEmpty.hidden = historyEntries.length > 0
}

function addHistoryEntry(text: string): HistoryEntry {
  const entry: HistoryEntry = { id: newHistoryId(), draft: text, result: '', at: Date.now() }
  historyEntries = fitHistory([entry, ...historyEntries])
  pendingHistoryId = entry.id
  renderHistory()
  void persistHistory()
  return entry
}

function completeHistoryEntry(id: string, text: string): void {
  historyEntries = fitHistory(historyEntries.map((entry) => (entry.id === id ? { ...entry, result: text } : entry)))
  pendingHistoryId = null
  renderHistory()
  void persistHistory()
}

async function copyHistoryResult(entry: HistoryEntry): Promise<void> {
  if (entry.result === '') return
  try {
    await host.writeClipboard(entry.result)
    setStatus('已复制历史增强结果。')
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    setStatus(`复制失败（${message}）。历史记录未改变。`, 'error')
  }
}

async function deleteHistoryEntry(id: string): Promise<void> {
  historyEntries = historyEntries.filter((entry) => entry.id !== id)
  if (pendingHistoryId === id) pendingHistoryId = null
  renderHistory()
  await persistHistory()
  setStatus('已删除这条历史记录。')
}

async function loadHistory(): Promise<void> {
  try {
    historyEntries = sanitizeHistory(await host.storage.get(HISTORY_KEY))
  } catch {
    historyEntries = []
    setStatus('无法读取历史记录，当前列表为空。', 'error')
  }
  renderHistory()
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
    setStatus('请输入需要增强的提示词。', 'error')
    return
  }
  // Recorded on the click, not on the answer: a failed or abandoned call still
  // leaves the draft in the history, where its result reads "尚未生成".
  const entry = addHistoryEntry(text)
  const currentRequest = ++requestId
  requestInFlight = true
  enhanceButton.disabled = true
  updateActionStates()
  setStatus('正在使用小模型增强提示词……')
  try {
    const response = await host.generate({
      prompt: frameUserPrompt(text),
      system: settings.systemPrompt,
      maxOutputTokens: settings.maxOutputTokens,
    })
    if (currentRequest !== requestId) return
    result.textContent = response.text
    completeHistoryEntry(entry.id, response.text)
    updateActionStates()
    setStatus('提示词增强完成。')
  } catch (error) {
    if (currentRequest !== requestId) return
    completeHistoryEntry(entry.id, '')
    const message = error instanceof Error ? error.message : '未知错误'
    setStatus(`提示词增强失败（${message}）。原始提示词未改变，可以重试。`, 'error')
  } finally {
    if (currentRequest === requestId) {
      requestInFlight = false
      enhanceButton.disabled = false
      updateActionStates()
    }
  }
}

enhanceButton.addEventListener('click', () => { void enhance() })
clearResultButton.addEventListener('click', clearResult)
clearDraftButton.addEventListener('click', clearDraft)
clearAllButton.addEventListener('click', clearAll)
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
  if (result.textContent) setStatus('提示词已更改；当前显示的结果对应先前的提示词。')
  updateActionStates()
})

host.onReady((ctx) => {
  applyHostReady(ctx, document.documentElement)
})

void loadSettings()
void loadHistory()
renderHistory()
updateActionStates()
