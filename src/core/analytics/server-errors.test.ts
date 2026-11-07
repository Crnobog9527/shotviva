import { afterEach, describe, expect, it, vi } from 'vitest'

import { onServerError, signalServerError } from './server-errors'

afterEach(() => onServerError(null))

describe('signalServerError', () => {
  it('passes each signal to the listener, and swallows a listener that throws', () => {
    const listener = vi.fn()
    onServerError(listener)
    signalServerError({ source: 'api', route: 'checkout' })
    expect(listener).toHaveBeenCalledWith({ source: 'api', route: 'checkout' })
    onServerError(() => {
      throw new Error('boom')
    })
    expect(() => signalServerError({ source: 'request', path: '/x' })).not.toThrow()
  })

  it('does nothing without a listener', () => {
    expect(() => signalServerError({ source: 'capture', alert: null, level: 'error' })).not.toThrow()
  })
})
