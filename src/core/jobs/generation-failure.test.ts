import { describe, expect, it } from 'vitest'

import { AppError } from '../errors'
import { classifyFailure, GenerationFailure } from './generation-failure'
import { ProviderError } from './provider'

describe('classifyFailure', () => {
  it('maps provider kinds and stages to job codes and client errors', () => {
    expect(classifyFailure('provider', new ProviderError('content_rejected', 'x'))).toMatchObject({
      jobCode: 'CONTENT_REJECTED',
      error: { code: 'CONTENT_REJECTED', status: 422 },
    })
    expect(classifyFailure('provider', new ProviderError('timeout', 'x')).jobCode).toBe('PROVIDER_TIMEOUT')
    expect(classifyFailure('provider', new ProviderError('failed', 'x')).error.code).toBe('GENERATION_FAILED')
    expect(classifyFailure('store_output', new Error('r2 down')).jobCode).toBe('OUTPUT_WRITE_FAILED')
    expect(classifyFailure('confirm', new Error('db')).jobCode).toBe('CONFIRM_FAILED')
  })

  it.each(['REFERENCE_IMAGE_LIMIT', 'MODEL_INPUT_UNSUPPORTED'] as const)('keeps %s after settlement for APIs and trial history', (code) => {
    const inputError = new AppError(code, 'Local input validation detail')
    expect(classifyFailure('provider', inputError)).toEqual({ jobCode: code, error: inputError })
    expect(classifyFailure('store_output', inputError).error.code).toBe('GENERATION_FAILED')
  })

  it('tells the client which job failed and whether it was refunded', () => {
    const failure = new GenerationFailure(new AppError('GENERATION_FAILED', 'Generation failed'), 'job-1', true)
    expect(failure.status).toBe(502)
    expect(failure.toBody()).toEqual({ code: 'GENERATION_FAILED', message: 'Generation failed', job_id: 'job-1', refunded: true })
  })
})
