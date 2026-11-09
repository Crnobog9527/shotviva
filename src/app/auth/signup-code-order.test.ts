import { beforeEach, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({ save: vi.fn(), auth: vi.fn() }))
vi.mock('@/core/auth/signup-code-actions', () => ({ saveSignupCode: calls.save }))
vi.mock('@/core/auth', () => ({
  signUpWithPassword: calls.auth, signInWithGoogle: calls.auth, sendPhoneCode: calls.auth, verifyPhoneCode: calls.auth,
}))
const { signupAction, googleAction, phoneSendAction, phoneVerifyAction } = await import('./actions')
beforeEach(() => { vi.clearAllMocks() })

it.each([signupAction, googleAction, phoneSendAction, phoneVerifyAction])('awaits the current signup code before dispatching auth', async action => {
  const form = new FormData()
  form.set('signupCode', 'PROMO20')
  let done = () => {}
  calls.save.mockReturnValueOnce(new Promise<void>(resolve => { done = resolve }))
  const pending = action({ status: 'idle' }, form)
  expect(calls.save).toHaveBeenCalledWith('PROMO20')
  expect(calls.auth).not.toHaveBeenCalled()
  done()
  await pending
  expect(calls.auth).toHaveBeenCalledOnce()
})

it('preserves a link cookie when a login form has no signup-code input', async () => {
  await googleAction({ status: 'idle' }, new FormData())
  expect(calls.save).not.toHaveBeenCalled()
  expect(calls.auth).toHaveBeenCalledOnce()
})
