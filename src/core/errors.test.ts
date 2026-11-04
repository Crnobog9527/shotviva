import { describe, expect, it } from 'vitest'

import { AppError, toAppError } from './errors'

describe('AppError', () => {
  it('maps codes to HTTP status and a client body', () => {
    const error = new AppError('CREDITS_INSUFFICIENT', 'Not enough credits')
    expect(error.status).toBe(402)
    expect(error.toBody()).toEqual({ code: 'CREDITS_INSUFFICIENT', message: 'Not enough credits' })
  })

  it('wraps unknown throwables as INTERNAL without leaking their message', () => {
    const wrapped = toAppError(new Error('db password is hunter2'))
    expect(wrapped.code).toBe('INTERNAL')
    expect(wrapped.message).not.toContain('hunter2')
  })

  it('passes AppError through unchanged', () => {
    const original = new AppError('NOT_FOUND', 'Missing')
    expect(toAppError(original)).toBe(original)
  })
})
