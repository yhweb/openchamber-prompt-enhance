# OpenChamber Prompt Enhancer Migration Design

## Intent
Move `dsh-prompt-enhance` into an OpenChamber extension so users can manually enter a draft, generate and review an enhanced prompt, regenerate it, and copy it without sending the request or result into a conversation.

## Goals and boundaries
- Provide a standalone OpenChamber panel with manual input, result preview, regenerate, copy, and portable settings.
- Use the supported `host.generate()` Small Model capability and `host.writeClipboard()`.
- Never read or write the chat composer, inspect conversation history, or call `compose`/`prompt`/send APIs.
- Do not modify OpenChamber core. Do not add composer-adjacent shortcuts or floating windows.
- The standard extension API does not preserve arbitrary provider/model routing, temperature, or reasoning-effort controls; do not imply otherwise.

## Approaches considered
- **Standalone extension panel with host generation (selected):** follows the documented extension boundary and keeps generation outside conversation messages; provider/model controls unavailable in the standard API are omitted.
- **Keep the existing DSH plugin transport and embed it in an extension:** retains custom routing but depends on DSH-only APIs and violates the migration target.
- **Use chat compose/prompt APIs:** offers native insertion, but sends/manipulates conversation state and violates the privacy boundary.

## Implementation calls
Use the OpenChamber manifest, panel page, and bundled script. Reuse the existing prompt strategy where practical, store portable user settings through the supported extension storage API, and keep failures visible without discarding the entered draft. Verify behavior with focused tests, typecheck, and build.
