# 系统提示词管理设计

## 目标

在现有「增强设置 → 系统提示词」中保留原始默认系统提示词的生成行为，同时支持：

- 编辑默认提示词，并一键恢复 `src/prompts.ts` 中的 `DEFAULT_SYSTEM_PROMPT`；
- 新增多条带标题和内容的系统增强提示词；
- 在默认提示词和增强提示词之间选择，生成时使用当前选中的内容；
- 删除增强提示词；
- 重新打开面板时保留上一次选择的提示词。

## 当前接入点

- `src/prompts.ts` 导出 `DEFAULT_SYSTEM_PROMPT`，它是默认值和恢复目标。
- `panel/main.ts` 的 `EnhancerSettings.systemPrompt` 当前承载设置文本，`loadSettings` 从
  `host.storage.get('settings')` 读取，保存按钮写回同一个键。
- `enhance()` 当前直接把 `settings.systemPrompt` 传给 `host.generate({ system })`。
- `panel/index.html` 在 `details` 内提供 `#system` 文本框和 `#save` 按钮。
- `panel/main.js` 是 OpenChamber 实际加载的构建产物，修改 `panel/main.ts` 后由
  `npm run build` 重新生成。

## 方案与取舍

### 采用：扩展现有 `settings` 存储对象

继续使用 `host.storage` 的 `settings` 键，在原字段旁增加提示词列表和选中项。这样无需新依赖、无需改变生成 API，也能让旧版本保存的数据自然迁移：缺失的新字段按默认值补齐，旧的
`systemPrompt` 继续表示默认提示词。

使用固定宽度的下拉框选择提示词，避免标题数量增加后挤压设置面板。新增和删除按钮与选择框并列；选择框下方显示“当前生成将使用系统提示词模板：<标题>”，让用户明确本次生成会使用哪个模板。提示文本允许换行，不得撑宽面板。

### 不采用：单独 storage 键

可以隔离增强提示词数据，但会引入第二套加载、保存和错误提示流程；本功能数据量小，且设置对象已经是面板的持久化边界，收益不足以抵消复杂度。

### 不采用：改用插件配置 schema 或后端存储

插件配置 schema 适合固定字段，不适合面板内动态增删的用户列表；后端存储会改变当前本地面板设置的所有权和生命周期，也没有本需求所需的共享语义。

## 数据结构

保留现有字段，并扩展为：

```ts
type EnhancedPrompt = {
  id: string
  title: string
  content: string
}

interface EnhancerSettings {
  // 兼容旧版本：始终表示“默认提示词”的可编辑内容。
  systemPrompt: string
  maxOutputTokens: number
  enhancedPrompts: EnhancedPrompt[]
  // 'default' 或某个 enhancedPrompts.id；缺失或失效时为 'default'。
  selectedPromptId: string
}
```

`selectedPromptId` 同时承担当前选择和下次打开面板时的默认选择：选择某条增强提示词后立即持久化其 id，下一次加载时若该 id 仍存在就自动选中；选择默认提示词则保存为 `default`。因此不需要复制一份“最后选择”的内容，删除后也不会留下悬空引用。

有效系统提示词由一个纯函数解析：`selectedPromptId === 'default'` 时返回 `systemPrompt`；否则查找对应增强提示词并返回其 `content`；找不到时回退到默认提示词并把选中项修正为 `default`。旧存储对象缺失 `enhancedPrompts` 或 `selectedPromptId` 时按这一规则兼容。

## 交互

设置区域展示顺序：

```text
系统提示词
[默认提示词                         v] [新增] [删除]
当前生成将使用系统提示词模板：默认提示词
[当前提示词内容文本框]                               
                                  [恢复默认值] [保存设置]
```

- 默认选项不可删除；选中默认选项时，文本框显示可编辑的 `systemPrompt`，显示“恢复默认值”。
- 选中增强选项时，文本框显示对应 `content`，保存按钮更新该条内容；删除按钮删除当前条目并回退到默认提示词。
- 点击新增打开原生 `dialog`，同时填写标题和内容；保存后生成唯一 id，立即写入列表并选中新条目。
- 下拉框不会随选项数量扩张；当前模板提示允许换行并保持在面板宽度内。

## 边界决定

本次采用安全默认，集中在设置清洗和操作函数中：

- 列表为空：始终保留“默认提示词”标签；增强入口显示“暂无增强提示词，请点击新增”。
- 删除当前增强提示词或选中项：删除后选中 `default`，生成回到默认提示词。
- 新增标题为空或内容为空：拒绝保存，保留弹窗并显示中文错误；两者均去除首尾空白后校验，但保存原文内容。
- 已保存的 `selectedPromptId` 不存在：加载时回退到 `default`，并在下次保存设置时清理失效 id。

## 非目标

- 不修改 `DEFAULT_SYSTEM_PROMPT` 的文本内容。
- 不改变 `host.generate` 的参数契约、请求流程或默认提示词在服务端的使用逻辑。
- 不引入 JavaScript 尺寸监听或新的存储依赖。

## 验收标准

- 旧的 settings 数据仍按原逻辑生成；未选择增强提示词时使用可编辑的默认提示词。
- 默认提示词可保存修改，也可恢复为 `DEFAULT_SYSTEM_PROMPT`。
- 多条增强提示词可新增、保存、切换、修改和删除。
- 生成请求的 `system` 始终等于当前选中的提示词内容。
- 重新加载面板后仍选中上次选择的有效提示词。
- 面板测试、全量测试、类型检查和构建通过，且 `panel/main.js` 与 TypeScript 源码同步。
