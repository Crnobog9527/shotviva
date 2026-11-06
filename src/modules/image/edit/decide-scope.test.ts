import { describe, expect, it, vi } from 'vitest'

import type { ScopeDecider, ScopeProbabilities } from './decision'
import { decideScope, pickScope } from './decide-scope'

const none: ScopeProbabilities = { object: null, background: null, style: null, subject: null, overall: null }
const input = { imageDataUrl: 'data:image/jpeg;base64,AA==', instruction: 'Make it brighter', questions: [] }

const decider = (decide: ScopeDecider['decide']): ScopeDecider => ({ tag: 'fake/decisions', decide })

describe('pickScope', () => {
  it('takes the most likely range at 0.5 or above', () => {
    expect(pickScope({ ...none, object: 0.6, style: 0.9 })).toBe('style')
    expect(pickScope({ ...none, subject: 0.5 })).toBe('subject')
  })

  it('falls back when nothing reaches 0.5 or the model declined', () => {
    expect(pickScope({ ...none, object: 0.49, overall: 0.2 })).toBe('fallback')
    expect(pickScope(none)).toBe('fallback')
  })

  it('breaks a tie by asking order', () => {
    expect(pickScope({ ...none, background: 0.7, object: 0.7 })).toBe('object')
  })
})

describe('decideScope', () => {
  it('rounds and keeps what the model answered', async () => {
    const result = await decideScope(decider(async () => ({ ...none, background: 0.912345 })), input)
    expect(result).toEqual({ scope: 'background', probabilities: { ...none, background: 0.9123 } })
  })

  it('falls back with nothing recorded after 3 seconds', async () => {
    vi.useFakeTimers()
    try {
      const pending = decideScope(decider(() => new Promise(() => {})), input)
      await vi.advanceTimersByTimeAsync(3_000)
      expect(await pending).toEqual({ scope: 'fallback', probabilities: null })
    } finally {
      vi.useRealTimers()
    }
  })

  it('aborts the call it gave up on', async () => {
    let signal: AbortSignal | undefined
    await decideScope(decider((call) => ((signal = call.signal), new Promise(() => {}))), input, 10)
    expect(signal?.aborted).toBe(true)
  })

  it('falls back when the call fails or there is no provider', async () => {
    expect(await decideScope(decider(async () => Promise.reject(new Error('503'))), input)).toEqual({ scope: 'fallback', probabilities: null })
    expect(await decideScope(null, input)).toEqual({ scope: 'fallback', probabilities: null })
  })
})
