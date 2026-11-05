import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { callRpc, toRpcError, type RpcClient } from './rpc'

const clientReturning = (result: Awaited<ReturnType<RpcClient['rpc']>>): RpcClient => ({
  rpc: async () => result,
})

describe('toRpcError', () => {
  it.each([
    ['CREDITS_INSUFFICIENT', 'CREDITS_INSUFFICIENT'],
    ['JOB_ALREADY_SETTLED', 'CONFLICT'],
    ['IDEMPOTENCY_CONFLICT', 'CONFLICT'],
    ['PROFILE_NOT_FOUND', 'NOT_FOUND'],
    ['USER_BANNED', 'FORBIDDEN'],
    ['INVALID_INPUT', 'INVALID_INPUT'],
  ])('maps SQL exception %s to %s', (message, code) => {
    expect(toRpcError('fn', { message }).code).toBe(code)
  })

  it('hides unknown database errors behind INTERNAL', () => {
    const error = toRpcError('grant_credits', { message: 'relation "x" does not exist' })
    expect(error.code).toBe('INTERNAL')
    expect(error.message).not.toContain('relation')
  })
})

describe('callRpc', () => {
  it('returns parsed data', async () => {
    const client = clientReturning({ data: true, error: null })
    await expect(callRpc(client, 'is_paid', {}, z.boolean())).resolves.toBe(true)
  })

  it('rejects data with an unexpected shape', async () => {
    const client = clientReturning({ data: 'yes', error: null })
    await expect(callRpc(client, 'is_paid', {}, z.boolean())).rejects.toMatchObject({ code: 'INTERNAL' })
  })

  it('throws the mapped AppError on rpc errors', async () => {
    const client = clientReturning({ data: null, error: { message: 'CREDITS_INSUFFICIENT' } })
    await expect(callRpc(client, 'reserve_credits', {}, z.unknown())).rejects.toMatchObject({
      code: 'CREDITS_INSUFFICIENT',
    })
  })
})
