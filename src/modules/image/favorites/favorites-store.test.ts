import { describe, expect, it, vi } from 'vitest'

import { createFavoritesStore, failureOf, savedIn, type SendResult } from './favorites-store'

// A send whose answers the test releases one by one, in order.
function manualSend() {
  const calls: { id: string; saved: boolean; answer(result: SendResult): Promise<void> }[] = []
  const send = vi.fn(
    (id: string, saved: boolean) =>
      new Promise<SendResult>((resolve) => {
        calls.push({
          id,
          saved,
          answer: async (result) => {
            resolve(result)
            // Let the store's loop run on.
            await new Promise((done) => setTimeout(done, 0))
          },
        })
      }),
  )
  return { send, calls }
}

const OK = { ok: true } as const

describe('favorites store (ARCHITECTURE §5.1b)', () => {
  it('shows a save at once, newest first, and keeps it once the server has it', async () => {
    const { send, calls } = manualSend()
    const synced = vi.fn()
    const store = createFavoritesStore(['b', 'c'], send, { onSynced: synced })
    store.set('a', true)
    expect(store.ids()).toEqual(['a', 'b', 'c'])
    await calls[0]!.answer(OK)
    expect(store.ids()).toEqual(['a', 'b', 'c'])
    expect(synced).toHaveBeenCalledWith('a', true)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('rolls a refused save back and a refused removal back into its old place', async () => {
    const { send, calls } = manualSend()
    const failed = vi.fn()
    const store = createFavoritesStore(['b', 'c', 'd'], send, { onFailed: failed })
    store.set('a', true)
    store.set('c', false)
    expect(store.ids()).toEqual(['a', 'b', 'd'])
    await calls[0]!.answer({ ok: false, code: 'FAVORITES_LIMIT' })
    await calls[1]!.answer({ ok: false, code: null })
    expect(store.ids()).toEqual(['b', 'c', 'd'])
    expect(failed).toHaveBeenNthCalledWith(1, 'a', 'limit')
    expect(failed).toHaveBeenNthCalledWith(2, 'c', 'failed')
  })

})

describe('favorites store: fast taps', () => {
  it('sends one request at a time per template and settles on the last tap', async () => {
    const { send, calls } = manualSend()
    const store = createFavoritesStore([], send)
    store.set('a', true)
    store.set('a', false)
    store.set('a', true)
    expect(send).toHaveBeenCalledTimes(1)
    await calls[0]!.answer(OK)
    // The last tap equals what the server now has: nothing more to send.
    expect(send).toHaveBeenCalledTimes(1)
    expect(store.ids()).toEqual(['a'])
  })

  it('follows up with the newer state when the tap changed during the request', async () => {
    const { send, calls } = manualSend()
    const synced = vi.fn()
    const store = createFavoritesStore(['a'], send, { onSynced: synced })
    store.set('a', false)
    store.set('a', true)
    store.set('a', false)
    await calls[0]!.answer(OK)
    expect(send).toHaveBeenCalledTimes(1)
    expect(store.ids()).toEqual([])
    store.set('a', true)
    await calls[1]!.answer(OK)
    expect(calls.map(({ saved }) => saved)).toEqual([false, true])
    expect(synced.mock.calls).toEqual([
      ['a', false],
      ['a', true],
    ])
  })

  it('treats a network error as a failure', async () => {
    const failed = vi.fn()
    const store = createFavoritesStore([], () => Promise.reject(new Error('offline')), { onFailed: failed })
    store.set('a', true)
    await new Promise((done) => setTimeout(done, 0))
    expect(store.ids()).toEqual([])
    expect(failed).toHaveBeenCalledWith('a', 'failed')
  })

  it('notifies subscribers with a stable snapshot between changes', () => {
    const store = createFavoritesStore(['a'], () => new Promise(() => {}))
    const listener = vi.fn()
    store.subscribe(listener)
    const before = store.ids()
    expect(store.ids()).toBe(before)
    store.set('b', true)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.ids()).not.toBe(before)
  })
})

describe('savedIn', () => {
  it('keeps saved order and drops templates the catalogue no longer has (unpublished, partner-only)', () => {
    const templates = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(savedIn(['c', 'gone', 'a'], templates)).toEqual([{ id: 'c' }, { id: 'a' }])
  })
})

describe('failureOf', () => {
  it('names the cap and folds everything else into a retry', () => {
    expect(failureOf('FAVORITES_LIMIT')).toBe('limit')
    expect(failureOf('NOT_FOUND')).toBe('failed')
    expect(failureOf(null)).toBe('failed')
  })
})
