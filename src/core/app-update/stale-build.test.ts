import { afterEach, describe, expect, it, vi } from 'vitest'

import { ACTION_NOT_FOUND_HEADER, isStaleBuildError, onStaleBuild, resetStaleBuildWatchForTests, signalStaleBuild, watchStaleBuild } from './stale-build'

afterEach(() => resetStaleBuildWatchForTests())

function named(name: string, message = '') {
  const error = new Error(message)
  error.name = name
  return error
}

describe('stale-build errors (T90)', () => {
  it.each([
    ['webpack ChunkLoadError', named('ChunkLoadError', 'Loading chunk 123 failed.')],
    ['Turbopack chunk', new Error('Failed to load chunk /_next/static/chunks/abc.js from module 42')],
    ['Chrome dynamic import', new TypeError('Failed to fetch dynamically imported module: https://shotviva.com/_next/x.js')],
    ['Safari dynamic import', new TypeError('Importing a module script failed.')],
    ['Next unknown Server Action', named('UnrecognizedActionError', 'Server Action "7f3a" was not found on the server.')],
    ['the same, renamed by a bundler', new Error('Server Action "7f3a" was not found on the server. \nRead more: …')],
  ])('recognises %s', (_, error) => {
    expect(isStaleBuildError(error)).toBe(true)
  })

  it.each([
    ['a network error', new TypeError('Failed to fetch')],
    ['an app error', new Error('CREDITS_INSUFFICIENT')],
    ['a string', 'ChunkLoadError'],
    ['nothing', null],
  ])('ignores %s', (_, error) => {
    expect(isStaleBuildError(error)).toBe(false)
  })

  it('keeps a signal sent before anyone listens for the first listener', () => {
    signalStaleBuild()
    const listener = vi.fn()
    onStaleBuild(listener)
    expect(listener).toHaveBeenCalledTimes(1)
    const later = vi.fn()
    onStaleBuild(later)
    expect(later).not.toHaveBeenCalled()
  })
})

describe('watchStaleBuild (T90)', () => {
  function fakeWindow(headers: Record<string, string>) {
    const handlers = new Map<string, (event: unknown) => void>()
    const response = new Response('{}', { headers })
    const win = {
      addEventListener: (type: string, handler: (event: unknown) => void) => handlers.set(type, handler),
      fetch: vi.fn<typeof fetch>(async () => response),
    }
    watchStaleBuild(win as unknown as Window)
    return { win, handlers, response }
  }

  it('signals on an unknown Server Action response and hands the response back untouched', async () => {
    const { win, response } = fakeWindow({ [ACTION_NOT_FOUND_HEADER]: '1' })
    const listener = vi.fn()
    onStaleBuild(listener)
    await expect(win.fetch('/generate', { method: 'POST' })).resolves.toBe(response)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('stays quiet on ordinary responses', async () => {
    const { win } = fakeWindow({})
    const listener = vi.fn()
    onStaleBuild(listener)
    await win.fetch('/api/version')
    expect(listener).not.toHaveBeenCalled()
  })

  it('signals on an unhandled chunk failure and on an uncaught one', () => {
    const { handlers } = fakeWindow({})
    const listener = vi.fn()
    onStaleBuild(listener)
    handlers.get('unhandledrejection')?.({ reason: named('ChunkLoadError') })
    handlers.get('error')?.({ error: new Error('Something else') })
    handlers.get('error')?.({ error: new TypeError('Importing a module script failed.') })
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
