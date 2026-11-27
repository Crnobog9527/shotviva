import { describe, expect, it, vi } from 'vitest'

import { bypassHref, leaveShell, SHELL_LOOP_MS, SHELL_PENDING_KEY, shellBootScript, shellLooping, shellSettled, withoutBypass } from './shell-fallback'

// The way out of Create's app shell (ARCHITECTURE §18.3, Part B 2026-11-27: the shell held the page).
function memoryStorage() {
  const items = new Map<string, string>()
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  }
}

describe('the bypass address', () => {
  it('adds the parameter, keeping the rest, and takes it off again', () => {
    expect(bypassHref('https://shotviva.com/generate?c=food#t')).toBe('https://shotviva.com/generate?c=food&sv-net=1#t')
    expect(withoutBypass('https://shotviva.com/generate?c=food&sv-net=1#t')).toBe('/generate?c=food#t')
    expect(withoutBypass('https://shotviva.com/generate?sv-net=1')).toBe('/generate')
    expect(withoutBypass('https://shotviva.com/generate?c=food')).toBeNull()
  })
})

describe('the shell answered again before it was replaced (a failed refresh reloads the address)', () => {
  it('records the first answer, and calls the second within the window a loop', () => {
    const storage = memoryStorage()
    expect(shellLooping(storage, 1_000)).toBe(false)
    expect(storage.items.get(SHELL_PENDING_KEY)).toBe('1000')
    expect(shellLooping(storage, 1_000 + SHELL_LOOP_MS - 1)).toBe(true)
    // The loop is left once: the record goes with it.
    expect(storage.items.has(SHELL_PENDING_KEY)).toBe(false)
  })

  it('is no loop after the window, after the shell was replaced, or without storage', () => {
    const storage = memoryStorage()
    shellLooping(storage, 1_000)
    expect(shellLooping(storage, 1_000 + SHELL_LOOP_MS)).toBe(false)
    shellSettled(storage)
    expect(shellLooping(storage, 1_000 + SHELL_LOOP_MS + 10)).toBe(false)
    expect(shellLooping(null, 5)).toBe(false)
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: vi.fn(), removeItem: vi.fn() }
    expect(shellLooping(broken, 5)).toBe(false)
  })
})

describe('leaving the shell when the real page does not come', () => {
  it('replaces the entry with the bypass address once, and forgets the pending answer', () => {
    const storage = memoryStorage()
    storage.setItem(SHELL_PENDING_KEY, '1')
    const replace = vi.fn()
    const win = { __svShell: {}, sessionStorage: storage, location: { href: 'https://shotviva.com/zh/generate?series=x', replace } }
    leaveShell(win)
    leaveShell(win)
    expect(replace).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledWith('https://shotviva.com/zh/generate?series=x&sv-net=1')
    expect(storage.items.has(SHELL_PENDING_KEY)).toBe(false)
  })
})

// The inline script, run as the browser runs it.
function boot(href: string, storage = memoryStorage(), now = 50_000) {
  const postMessage = vi.fn()
  const replace = vi.fn()
  const url = new URL(href)
  const window: Record<string, unknown> = { sessionStorage: storage }
  const location = { href, pathname: url.pathname, replace }
  const navigator = { serviceWorker: { controller: { postMessage } } }
  const document = { visibilityState: 'visible' }
  const DateStub = { now: () => now }
  new Function('window', 'location', 'navigator', 'document', 'Date', 'URL', shellBootScript())(window, location, navigator, document, DateStub, URL)
  return { window, postMessage, replace, storage }
}

describe('the shell page’s inline script', () => {
  it('notes the address and asks the worker for the early refresh', () => {
    const run = boot('https://shotviva.com/generate?c=food')
    expect(run.window.__svShell).toEqual({ href: 'https://shotviva.com/generate?c=food' })
    expect(run.postMessage).toHaveBeenCalledWith({ type: 'sv-shell-early', href: 'https://shotviva.com/generate?c=food' })
    expect(run.replace).not.toHaveBeenCalled()
    expect(run.storage.items.get(SHELL_PENDING_KEY)).toBe('50000')
  })

  it('leaves for the network page when the shell comes back before it was replaced', () => {
    const storage = memoryStorage()
    storage.setItem(SHELL_PENDING_KEY, '45000')
    const run = boot('https://shotviva.com/generate', storage)
    expect(run.replace).toHaveBeenCalledWith('https://shotviva.com/generate?sv-net=1')
    expect(run.postMessage).not.toHaveBeenCalled()
    expect(run.window.__svShell).toMatchObject({ leaving: true })
  })

  it('does nothing of that at the shell’s own address', () => {
    const storage = memoryStorage()
    storage.setItem(SHELL_PENDING_KEY, '45000')
    const run = boot('https://shotviva.com/app-shell/generate', storage)
    expect(run.replace).not.toHaveBeenCalled()
    expect(storage.items.get(SHELL_PENDING_KEY)).toBe('45000')
  })
})
