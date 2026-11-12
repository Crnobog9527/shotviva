import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { HCaptchaApi } from './hcaptcha-script'

// Invisible only (ARCHITECTURE §7, Owner 2026-11-07): one invisible widget per submit, in the
// page's language, removed again whether or not the challenge completes; one is rendered ahead
// (prepareHCaptcha) so the submit only executes it. A minimal DOM stands in for the browser (unit
// tests run in Node).
type FakeScript = { id: string; src: string; async: boolean; onerror?: () => void; remove: () => void }

let scripts: FakeScript[]
let api: { [K in keyof HCaptchaApi]: ReturnType<typeof vi.fn> }

beforeEach(() => {
  vi.resetModules()
  scripts = []
  api = { render: vi.fn(() => 'w1'), execute: vi.fn(), reset: vi.fn(), remove: vi.fn() }
  const win: { hcaptcha?: unknown; __shotvivaHCaptchaReady?: () => void } = {}
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
        // hCaptcha calls the `onload` named in the URL once its API is ready.
        queueMicrotask(() => win.__shotvivaHCaptchaReady?.())
      },
    },
    body: { appendChild: vi.fn() },
  })
})

afterEach(() => vi.unstubAllGlobals())

const load = async () => {
  const modules = { ...(await import('./captcha-light')), ...(await import('./hcaptcha-script')), ...(await import('./hcaptcha-widget')) }
  // What use-captcha.ts does: a form holds the widget, and the last release removes it.
  return { ...modules, retainHCaptcha: () => modules.retainCaptcha(modules.releaseWarm) }
}
const rendered = (sitekey: string, hl: string) => ({ sitekey, size: 'invisible', hl, 'open-callback': expect.any(Function) })

describe('hCaptcha language', () => {
  it('follows the page: en → en, zh → zh-CN, in the script URL', async () => {
    const { hcaptchaLanguage, scriptSrc } = await load()
    expect(hcaptchaLanguage('en')).toBe('en')
    expect(hcaptchaLanguage('zh')).toBe('zh-CN')
    expect(scriptSrc('zh-CN')).toBe('https://js.hcaptcha.com/1/api.js?render=explicit&onload=__shotvivaHCaptchaReady&hl=zh-CN')
  })
})

describe('invisibleToken', () => {
  it('renders an invisible widget in the page language and returns its token', async () => {
    const { invisibleToken } = await load()
    api.execute.mockResolvedValue({ response: 'tok' })
    await expect(invisibleToken('site', 'en')).resolves.toBe('tok')
    expect(api.render).toHaveBeenCalledWith(expect.anything(), rendered('site', 'en'))
    expect(api.remove).toHaveBeenCalledWith('w1')
    expect(scripts.map((script) => script.src)).toEqual(['https://js.hcaptcha.com/1/api.js?render=explicit&onload=__shotvivaHCaptchaReady&hl=en'])
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
    expect(scripts.map((script) => script.src)).toEqual(['https://js.hcaptcha.com/1/api.js?render=explicit&onload=__shotvivaHCaptchaReady&hl=zh-CN'])
    expect(api.render).toHaveBeenLastCalledWith(expect.anything(), rendered('site', 'zh-CN'))
  })
})

describe('prepared ahead', () => {
  it('renders the widget before the submit, which then only executes it', async () => {
    const { prepareHCaptcha, invisibleToken, retainHCaptcha } = await load()
    retainHCaptcha() // a sign-in form is on the page
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

  it('removes the prepared widget once the last form leaves, and prepares none for no form', async () => {
    vi.useFakeTimers()
    const { prepareHCaptcha, invisibleToken, retainHCaptcha } = await load()
    const releaseLogin = retainHCaptcha()
    const releasePhone = retainHCaptcha()
    await prepareHCaptcha('site', 'en')
    releaseLogin()
    await vi.advanceTimersByTimeAsync(0)
    expect(api.remove).not.toHaveBeenCalled() // the phone form still holds it
    releasePhone()
    await vi.advanceTimersByTimeAsync(0)
    expect(api.remove).toHaveBeenCalledWith('w1') // signed in and gone: no hidden frame stays
    // With no form left, a token (the business form) leaves nothing prepared behind.
    api.execute.mockResolvedValue({ response: 'tok' })
    await invisibleToken('site', 'en')
    await vi.advanceTimersByTimeAsync(0)
    expect(api.render).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('keeps the prepared widget when a form mounts again before the release runs', async () => {
    const { prepareHCaptcha, retainCaptcha, releaseWarm } = await load()
    const release = retainCaptcha(releaseWarm)
    await prepareHCaptcha('site', 'en')
    release()
    retainCaptcha(releaseWarm) // log-in swapped for "check your email"
    releaseWarm()
    expect(api.remove).not.toHaveBeenCalled()
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
    const onChallenge = vi.fn()
    const token = invisibleToken('site', 'en', onChallenge)
    await vi.advanceTimersByTimeAsync(0)
    const options = api.render.mock.calls[0]?.[1] as { 'open-callback': () => void }
    options['open-callback']()
    // The form now says to finish the check in that window, not that the network is slow.
    expect(onChallenge).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(EXECUTE_TIMEOUT_MS * 3)
    answer({ response: 'late' })
    await expect(token).resolves.toBe('late')
  })

  it('names its network error so the form can tell it apart without loading this code', async () => {
    const { CaptchaNetworkError, isCaptchaNetworkError } = await load()
    expect(isCaptchaNetworkError(new CaptchaNetworkError('timeout'))).toBe(true)
    expect(isCaptchaNetworkError(new Error('challenge-closed'))).toBe(false)
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
