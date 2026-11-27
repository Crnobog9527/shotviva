import { afterEach, describe, expect, it, vi } from 'vitest'

const keep = vi.fn()
vi.mock('@/core/offline', () => ({ keepFirstScreenCovers: (...args: unknown[]) => keep(...args) }))

const { addToScreen } = await import('./near-viewport')

afterEach(() => {
  vi.useRealTimers()
  keep.mockReset()
})

// Review of #892: a screen's first-screen covers reach the worker as one set, so it can replace
// that screen's earlier set whole.
describe('first-screen covers batch per screen', () => {
  it('sends the cards of one screen as one message, a second after the last one reported', () => {
    vi.useFakeTimers()
    addToScreen('all', ['a', 'b'])
    vi.advanceTimersByTime(600)
    addToScreen('all', ['c', 'd', 'a'])
    vi.advanceTimersByTime(900)
    expect(keep).not.toHaveBeenCalled()
    vi.advanceTimersByTime(200)
    expect(keep).toHaveBeenCalledTimes(1)
    expect(keep).toHaveBeenCalledWith('all', ['a', 'b', 'c', 'd'])
  })

  it('keeps screens apart', () => {
    vi.useFakeTimers()
    addToScreen('all', ['a'])
    addToScreen('c:food', ['f'])
    vi.advanceTimersByTime(1100)
    expect(keep).toHaveBeenCalledWith('all', ['a'])
    expect(keep).toHaveBeenCalledWith('c:food', ['f'])
  })
})
