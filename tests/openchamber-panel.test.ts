import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

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
})
