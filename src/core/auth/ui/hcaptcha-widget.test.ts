import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { HCaptchaApi } from './hcaptcha-script'

// Invisible only (ARCHITECTURE §7, Owner 2026-11-07): one invisible widget per submit, in the
// page's language, removed again whether or not the challenge completes; one is rendered ahead
// (prepareHCaptcha) so the submit only executes it. A minimal DOM stands in for the browser (unit
// tests run in Node).
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

const load = async () => ({ ...(await import('./hcaptcha-script')), ...(await import('./hcaptcha-widget')) })
const rendered = (sitekey: string, hl: string) => ({ sitekey, size: 'invisible', hl, 'open-callback': expect.any(Function) })

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
    expect(api.render).toHaveBeenCalledWith(expect.anything(), rendered('site', 'en'))
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
    expect(api.render).toHaveBeenLastCalledWith(expect.anything(), rendered('site', 'zh-CN'))
  })
})

describe('prepared ahead', () => {
  it('renders the widget before the submit, which then only executes it', async () => {
    const { prepareHCaptcha, invisibleToken } = await load()
    await prepareHCaptcha('site', 'zh-CN')
    expect(api.render).toHaveBeenCalledTimes(1)
    expect(api.execute).not.toHaveBeenCalled()
    api.execute.mockResolvedValue({ response: 'tok' })
    await expect(invisibleToken('site', 'zh-CN')).resolves.toBe('tok')
    expect(api.execute).toHaveBeenCalledWith('w1', { async: true })
    // Used once, removed, and the next one is rendered for a resend or retry.
    expect(api.remove).toHaveBeenCalledWith('w1')
    await vi.waitFor(() => expect(api.render).toHaveBeenCalledTimes(2))
  })

  it('prepares once however many forms on the page ask', async () => {
    const { prepareHCaptcha } = await load()
    await Promise.all([prepareHCaptcha('site', 'en'), prepareHCaptcha('site', 'en')])
    expect(api.render).toHaveBeenCalledTimes(1)
    expect(scripts).toHaveLength(1)
  })
})

describe('a stuck network', () => {
  afterEach(() => vi.useRealTimers())

  it('gives up on a check that never answers, as a network error', async () => {
    vi.useFakeTimers()
    const { invisibleToken, CaptchaNetworkError, EXECUTE_TIMEOUT_MS } = await load()
    api.execute.mockReturnValue(new Promise(() => undefined))
    const token = invisibleToken('site', 'en')
    const settled = expect(token).rejects.toBeInstanceOf(CaptchaNetworkError)
    await vi.advanceTimersByTimeAsync(EXECUTE_TIMEOUT_MS)
    await settled
    expect(api.remove).toHaveBeenCalledWith('w1')
  })

  it('does not time out a challenge the visitor has open', async () => {
    vi.useFakeTimers()
    const { invisibleToken, EXECUTE_TIMEOUT_MS } = await load()
    let answer: (value: { response: string }) => void = () => undefined
    api.execute.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const token = invisibleToken('site', 'en')
    await vi.advanceTimersByTimeAsync(0)
    const options = api.render.mock.calls[0]?.[1] as { 'open-callback': () => void }
    options['open-callback']()
    await vi.advanceTimersByTimeAsync(EXECUTE_TIMEOUT_MS * 3)
    answer({ response: 'late' })
    await expect(token).resolves.toBe('late')
  })

  it('reports a script that cannot load as a network error, and loads it again next time', async () => {
    const { invisibleToken, CaptchaNetworkError } = await load()
    const realAppend = document.head.appendChild.bind(document.head)
    document.head.appendChild = ((script: FakeScript) => {
      scripts.push(script)
      queueMicrotask(() => script.onerror?.())
    }) as typeof document.head.appendChild
    await expect(invisibleToken('site', 'en')).rejects.toBeInstanceOf(CaptchaNetworkError)
    document.head.appendChild = realAppend
    api.execute.mockResolvedValue({ response: 'tok' })
    await expect(invisibleToken('site', 'en')).resolves.toBe('tok')
  })
})
