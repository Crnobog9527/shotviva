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

  // T81 follow-up (#319): 5 seconds an attempt, a second attempt after a timeout, then fallback.
  it('falls back with nothing recorded after two 5-second attempts, aborting each', async () => {
    vi.useFakeTimers()
    const signals: AbortSignal[] = []
    const classify = vi.fn<ScopeClassifier['classify']>((call) => (signals.push(call.signal), new Promise(() => {})))
    try {
      const pending = classifyEditScope(classifier(classify), input)
      await vi.advanceTimersByTimeAsync(5_000)
      expect(classify).toHaveBeenCalledTimes(2)
      await vi.advanceTimersByTimeAsync(5_000)
      expect(await pending).toEqual(FALLBACK)
      expect(signals.map((signal) => signal.aborted)).toEqual([true, true])
    } finally {
      vi.useRealTimers()
    }
  })

  it('answers from the second attempt after a 5xx, and does not retry a 4xx', async () => {
    const flaky = vi.fn<ScopeClassifier['classify']>()
    flaky.mockRejectedValueOnce(new Error('openai responses 503')).mockResolvedValueOnce(answer())
    expect((await classifyEditScope(classifier(flaky), input)).scope).toBe('background')
    expect(flaky).toHaveBeenCalledTimes(2)
    const bad = vi.fn<ScopeClassifier['classify']>(async () => Promise.reject(new Error('openai responses 400')))
    expect(await classifyEditScope(classifier(bad), input)).toEqual(FALLBACK)
    expect(bad).toHaveBeenCalledTimes(1)
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
