# OpenChamber 面板全中文化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 OpenChamber 扩展显示名称改为“提词增强”，并将面板中所有用户可见文案改为简体中文。

**Architecture:** 保持面板结构、宿主 API、扩展 ID、存储键及 DSH 兼容入口不变，仅调整 manifest 显示名称、HTML 文案与运行时提示。更新面板流程测试，再通过现有构建生成 `panel/main.js`。

**Tech Stack:** TypeScript、HTML、Vitest、esbuild 构建脚本。

**Spec:** `docs/openchamber-migration-design.md`；本次补充范围为固定简体中文，不增加语言切换。

## Global Constraints

- OpenChamber manifest id 保持 `dsh-prompt-enhance`，最低版本保持 `>=2.7.0`。
- 仅声明现有 `model` capability；继续通过 `host.generate()` 和 `host.writeClipboard()` 工作。
- 不修改或读取聊天输入框、会话历史，不调用 compose/prompt/send API。
- 保留现有 DSH 插件兼容入口；不得把 DSH 界面改动混入本次范围。
- 所有 OpenChamber 面板用户可见文字使用简体中文，包括输入标签、占位提示、按钮、设置项、状态与错误提示。

## Review Focus

- 空输入时仍阻止生成，并以中文显示错误——由 Task 1 的流程测试覆盖。
- 生成失败后保留草稿、允许重试，中文错误信息仍说明草稿未变——由 Task 1 的流程测试覆盖。
- 输出 token 超出范围时提示中文且校验边界仍为 128–4000——由 Task 1 的流程测试覆盖。
- 复制或保存失败时结果/设置状态不被错误清除，提示为中文——由 Task 1 的流程测试覆盖。
- 页面标题及 HTML 可访问语言标记均为中文——由 Task 1 的静态文案断言覆盖。

---

### Task 1: 中文化 OpenChamber 扩展界面

**Files:**
- Modify: `package.json` 中 `openchamber.name`
- Modify: `panel/index.html`
- Modify: `panel/main.ts`
- Modify: `tests/openchamber-flow.test.ts`
- Generate: `panel/main.js`（通过构建生成，不手工编辑）

**Interfaces:**
- 使用现有 OpenChamber `host.generate()`、`host.writeClipboard()` 与 storage 接口；不新增接口。

- [ ] 将流程测试的英文文案断言更新为简体中文，并增加标题/页面语言的静态断言；覆盖空输入、生成失败草稿保留、token 范围错误和成功状态。
- [ ] 运行 `npm test -- --run tests/openchamber-flow.test.ts`，确认新中文断言在实现前失败。
- [ ] 将 manifest 显示名称、HTML `<title>`、`lang`、标题、输入/结果标签、占位文本、操作按钮、设置折叠标题及字段名全部改为简体中文；文案统一采用“提词增强”“待增强内容”“增强结果”“使用小模型增强”“复制结果”“系统提示词”“最大输出令牌数”“保存设置”等清晰表达。
- [ ] 将 `panel/main.ts` 的空输入、生成中/成功、生成失败、token 校验、保存成功/失败、复制成功/失败状态改成简体中文；保存“原文不变，可重试”的失败提示语义。
- [ ] 运行 `npm test`、`npm run typecheck`、`npm run build` 和 `git diff --check`；全部通过才算完成。
- [ ] 检查 `package.json` 的扩展 ID、`panel/index.html` 入口、capability、storage key 与 DSH 字段均未变化；检查 `panel/main.js` 由构建同步更新。
