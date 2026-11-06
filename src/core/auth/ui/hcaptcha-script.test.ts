import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { HCaptchaApi } from './hcaptcha-script'

// Invisible only (ARCHITECTURE §7, Owner 2026-11-07): one invisible widget per submit, in the
// page's language, removed again whether or not the challenge completes. A minimal DOM stands in
// for the browser (unit tests run in Node).
type FakeScript = { id: string; src: string; async: boolean; onload?: () => void; onerror?: () => void; remove: () => void }

let scripts: FakeScript[]
let api: { [K in keyof HCaptchaApi]: ReturnType<typeof vi.fn> }

beforeEach(() => {
  vi.resetModules()
  scripts = []
  api = { render: vi.fn(() => 'w1'), execute: vi.fn(), reset: vi.fn(), remove: vi.fn() }
  const win: { hcaptcha?: unknown } = {}
  vi.stubGlobal('window', win)
  vi.stubGlobal('document', {
    getElementById: (id: string) => scripts.find((script) => script.id === id) ?? null,
    createElement: (tag: string) =>
      tag === 'script'
        ? ({ id: '', src: '', async: false, remove() { scripts = scripts.filter((s) => s !== this) } } as FakeScript)
        : { remove: vi.fn() },
    head: {
      appendChild(script: FakeScript) {
        scripts.push(script)
        win.hcaptcha = api
        queueMicrotask(() => script.onload?.())
      },
    },
    body: { appendChild: vi.fn() },
  })
})

afterEach(() => vi.unstubAllGlobals())

const load = () => import('./hcaptcha-script')

describe('hCaptcha language', () => {
  it('follows the page: en → en, zh → zh-CN, in the script URL', async () => {
    const { hcaptchaLanguage, scriptSrc } = await load()
    expect(hcaptchaLanguage('en')).toBe('en')
    expect(hcaptchaLanguage('zh')).toBe('zh-CN')
    expect(scriptSrc('zh-CN')).toBe('https://js.hcaptcha.com/1/api.js?render=explicit&hl=zh-CN')
  })
})

describe('invisibleToken', () => {
  it('renders an invisible widget in the page language and returns its token', async () => {
    const { invisibleToken } = await load()
    api.execute.mockResolvedValue({ response: 'tok' })
    await expect(invisibleToken('site', 'en')).resolves.toBe('tok')
    expect(api.render).toHaveBeenCalledWith(expect.anything(), { sitekey: 'site', size: 'invisible', hl: 'en' })
    expect(api.remove).toHaveBeenCalledWith('w1')
    expect(scripts.map((script) => script.src)).toEqual(['https://js.hcaptcha.com/1/api.js?render=explicit&hl=en'])
  })

  it('rejects when the challenge is closed or expires, and leaves no widget behind', async () => {
    const { invisibleToken } = await load()
    api.execute.mockRejectedValue('challenge-closed')
    await expect(invisibleToken('site', 'en')).rejects.toBe('challenge-closed')
    expect(api.remove).toHaveBeenCalledWith('w1')
    // The next submit simply asks again: no checkbox, no other mode.
    api.execute.mockResolvedValue({ response: 'tok2' })
    await expect(invisibleToken('site', 'en')).resolves.toBe('tok2')
    expect(scripts).toHaveLength(1)
  })

  it('loads the script again when the page language changes', async () => {
    const { invisibleToken } = await load()
    api.execute.mockResolvedValue({ response: 'tok' })
    await invisibleToken('site', 'en')
    await invisibleToken('site', 'zh-CN')
    expect(scripts.map((script) => script.src)).toEqual(['https://js.hcaptcha.com/1/api.js?render=explicit&hl=zh-CN'])
    expect(api.render).toHaveBeenLastCalledWith(expect.anything(), { sitekey: 'site', size: 'invisible', hl: 'zh-CN' })
  })
})
