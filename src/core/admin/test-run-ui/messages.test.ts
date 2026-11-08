import { describe, expect, it } from 'vitest'

import { TestRunError } from './api'
import { failureMessage, runFailure } from './messages'
import { mergeRuns, placeholderRun } from './placeholder'

describe('failureMessage', () => {
  it('says the budget is spent, shows the server’s words for input problems, and stays generic otherwise', () => {
    expect(failureMessage(new TestRunError('TEST_BUDGET_EXCEEDED', 'x'))).toContain('预算')
    expect(failureMessage(new TestRunError('INVALID_INPUT', 'Dish is required'))).toBe('Dish is required')
    expect(failureMessage(new TestRunError('INTERNAL', 'stack trace'))).not.toContain('stack')
    expect(failureMessage(new Error('boom'))).toBe(failureMessage(new TestRunError('INTERNAL', '')))
  })

  it('names a failed run’s reason', () => {
    expect(runFailure({ errorCode: 'PROVIDER_TIMEOUT' })).toBe('供应商超时')
    expect(runFailure({ errorCode: 'SOMETHING_NEW' })).toBe('SOMETHING_NEW')
  })
})

describe('placeholders', () => {
  it('show while running and give way to the server’s row with the same id', () => {
    const pending = placeholderRun({ id: 'a', batchId: 'b', kind: 'generate', parentId: null, photoId: null, resolution: '1k', aspect: '4:5' })
    expect(pending).toMatchObject({ status: 'running', outputUrl: null })
    const done = { ...pending, status: 'succeeded' as const, outputUrl: 'https://x' }
    expect(mergeRuns([done], [pending])).toEqual([done])
    expect(mergeRuns([], [pending])).toEqual([pending])
  })
})
