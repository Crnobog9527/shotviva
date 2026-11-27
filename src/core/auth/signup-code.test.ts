import { expect, it, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { invite, seededRewards } from '../../../tests/t94-config'

import { consumeSignupCode } from './signup-code'

const mocks = vi.hoisted(() => ({
  jar: { get: vi.fn(), set: vi.fn(), delete: vi.fn() }, redeem: vi.fn(), rpc: vi.fn(),
}))
vi.mock('next/headers', () => ({ cookies: async () => mocks.jar }))
vi.mock('../codes/server', () => ({ redeemCode: mocks.redeem }))
vi.mock('../logger', () => ({ logger: { warn: vi.fn() } }))
const admin = { rpc: mocks.rpc } as unknown as SupabaseClient
const run = (first = true, o: { fresh?: boolean; useStored?: boolean } = {}) =>
  consumeSignupCode(admin, 'user', { first, fresh: o.fresh ?? first, useStored: o.useStored ?? true }, invite, 'zh')
beforeEach(() => {
  vi.resetAllMocks()
  mocks.jar.get.mockReturnValue({ value: 'FRIEND' })
  mocks.rpc.mockResolvedValue({ data: null, error: null })
})

it('passes configured benefits and displays the actual grant on successful registration', async () => {
  mocks.redeem.mockResolvedValue({ status: 'ok', kind: 'invite', credits: seededRewards.inviteeCredits, pool: 'free', percent: null })
  expect(await run()).toBe('invite')
  expect(mocks.redeem).toHaveBeenCalledWith(admin, {userId:'user', code:'FRIEND', context:'signup', invite, locale:'zh'})
  expect(mocks.jar.set).toHaveBeenCalledWith('sv_code_result',JSON.stringify({credits:seededRewards.inviteeCredits,pool:'free',percent:null}),expect.objectContaining({secure:true}))
})

it('clears the code and lets registration finish if redemption fails', async () => {
  mocks.redeem.mockRejectedValue(new Error('unavailable'))
  expect(await run()).toBeNull()
  expect(mocks.jar.delete).toHaveBeenCalledWith('sv_code')
  expect(mocks.jar.set).not.toHaveBeenCalled()
})

it('never applies signup benefits on a returning-account sign-in', async () => {
  expect(await run(false)).toBeNull()
  expect(mocks.redeem).not.toHaveBeenCalled()
  expect(mocks.jar.delete).toHaveBeenCalledWith('sv_code')
})

// 2030 (review on #977): the code stored at email sign-up, for a confirmation opened on another device.
it('uses the stored code when this browser has none, only on the signup confirmation click', async () => {
  mocks.jar.get.mockReturnValue(undefined)
  mocks.rpc.mockResolvedValue({ data: 'FRIEND02', error: null })
  mocks.redeem.mockResolvedValue({ status: 'ok', kind: 'invite', credits: 6, pool: 'free', percent: null })
  expect(await run()).toBe('invite')
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('signup_code_take', { p_user: 'user' })
  expect(mocks.redeem).toHaveBeenCalledWith(admin, expect.objectContaining({ code: 'FRIEND02', context: 'signup' }))

  mocks.redeem.mockClear()
  expect(await run(true, { useStored: false })).toBeNull()
  expect(mocks.redeem).not.toHaveBeenCalled()
})

it('prefers this browser\'s code over the stored one, and takes the stored one even when it cannot apply', async () => {
  mocks.rpc.mockResolvedValue({ data: 'FRIEND02', error: null })
  mocks.redeem.mockResolvedValue({ status: 'ok', kind: 'invite', credits: 6, pool: 'free', percent: null })
  await run()
  expect(mocks.redeem).toHaveBeenCalledWith(admin, expect.objectContaining({ code: 'FRIEND' }))
  mocks.rpc.mockClear(); mocks.redeem.mockClear()
  // A staff sign-up (first, not fresh) takes and drops it.
  expect(await run(true, { fresh: false })).toBeNull()
  expect(mocks.rpc).toHaveBeenCalledWith('signup_code_take', { p_user: 'user' })
  expect(mocks.redeem).not.toHaveBeenCalled()
  // A returning sign-in neither takes nor redeems.
  mocks.rpc.mockClear()
  await run(false)
  expect(mocks.rpc).not.toHaveBeenCalled()
})

it('ignores a failed take and still applies the browser\'s code', async () => {
  mocks.rpc.mockRejectedValue(new Error('down'))
  mocks.redeem.mockResolvedValue({ status: 'ok', kind: 'invite', credits: 6, pool: 'free', percent: null })
  expect(await run()).toBe('invite')
})
