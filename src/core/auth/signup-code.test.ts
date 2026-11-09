import { expect, it, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { invite } from '../../../tests/t94-config'

import { consumeSignupCode } from './signup-code'

const mocks = vi.hoisted(() => ({
  jar: { get: vi.fn(), set: vi.fn(), delete: vi.fn() }, redeem: vi.fn(),
}))
vi.mock('next/headers', () => ({ cookies: async () => mocks.jar }))
vi.mock('../codes/server', () => ({ redeemCode: mocks.redeem }))
vi.mock('../logger', () => ({ logger: { warn: vi.fn() } }))
const run = (first = true) => consumeSignupCode({} as SupabaseClient, 'user', first, invite, 'zh')
beforeEach(() => { vi.resetAllMocks(); mocks.jar.get.mockReturnValue({ value: 'FRIEND' }) })

it('passes configured benefits and displays the actual grant on successful registration', async () => {
  mocks.redeem.mockResolvedValue({ status: 'ok', kind: 'invite', credits: invite.inviteeCredits, pool: 'free', percent: null })
  expect(await run()).toBe('invite')
  expect(mocks.redeem).toHaveBeenCalledWith({}, {userId:'user', code:'FRIEND', context:'signup', invite, locale:'zh'})
  expect(mocks.jar.set).toHaveBeenCalledWith('sv_code_result',JSON.stringify({credits:invite.inviteeCredits,pool:'free',percent:null}),expect.objectContaining({secure:true}))
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
