import { describe, expect, it, vi } from 'vitest'

import type { ClassifierAnswer, ScopeClassifier } from './classifier'
import { classifyEditScope } from './classify-scope'

const input = { imageDataUrl: 'data:image/jpeg;base64,AA==', instruction: 'Make it brighter', instructions: 'CLASSIFY' }
const answer = (overrides: Partial<ClassifierAnswer> = {}): ClassifierAnswer => ({
  scope: 'background',
  confidence: 0.91234,
  keep: ['red bottle'],
  change: 'new beach background',
  usage: { inputTokens: 900, outputTokens: 40 },
  identitySwap: false,
  ...overrides,
})
const classifier = (classify: ScopeClassifier['classify']): ScopeClassifier => ({ tag: 'fake/luna', classify })
const FALLBACK = { scope: 'fallback', confidence: null, keep: [], change: null, usage: null, identitySwap: false }

describe('classifyEditScope', () => {
  it('uses the answer at confidence 0.5 or above, rounded, with its keep list and usage', async () => {
    expect(await classifyEditScope(classifier(async () => answer()), input)).toEqual({
      scope: 'background',
      confidence: 0.9123,
      keep: ['red bottle'],
      change: 'new beach background',
      usage: { inputTokens: 900, outputTokens: 40 },
      identitySwap: false,
    })
    expect((await classifyEditScope(classifier(async () => answer({ confidence: 0.5 })), input)).scope).toBe('background')
  })

  it('falls back under 0.5 but keeps what the model said for tuning', async () => {
    expect(await classifyEditScope(classifier(async () => answer({ confidence: 0.49 })), input)).toMatchObject({
      scope: 'fallback',
      confidence: 0.49,
      keep: ['red bottle'],
    })
  })

  it('falls back with nothing recorded after 3 seconds, and aborts the call', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    try {
      const pending = classifyEditScope(classifier((call) => ((signal = call.signal), new Promise(() => {}))), input)
      await vi.advanceTimersByTimeAsync(3_000)
      expect(await pending).toEqual(FALLBACK)
      expect(signal?.aborted).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  // T81 (§5.1a): the face-swap answer stands even when the scope is too unsure to use.
  it('keeps identity_swap whatever the confidence', async () => {
    expect((await classifyEditScope(classifier(async () => answer({ confidence: 0.2, identitySwap: true })), input)).identitySwap).toBe(true)
  })

  it('falls back when the call fails or there is no provider', async () => {
    expect(await classifyEditScope(classifier(async () => Promise.reject(new Error('503'))), input)).toEqual(FALLBACK)
    expect(await classifyEditScope(null, input)).toEqual(FALLBACK)
  })
})
