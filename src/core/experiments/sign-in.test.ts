import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { mergeAccountRows, signupExperiments, syncExperimentsAtSignIn } from './sign-in'
import { parseExperimentCookie } from './cookie'

describe('experiment sign-in sync', () => {
  it('lets the account win over the browser, keeping a flag only when nothing changed', () => {
    const entries = parseExperimentCookie('3.11.11.n~4.20.20.n')
    const merged = mergeAccountRows(entries, [{ experiment: 3, current: 10, first: 10 }, { experiment: 4, current: 20, first: 20 }])
    expect([...merged.values()]).toEqual([
      { experiment: 3, current: 10, first: 10, flag: '' },
      { experiment: 4, current: 20, first: 20, flag: 'n' },
    ])
  })

  it('marks the signup event with the first variants, never forced ones', () => {
    expect(signupExperiments(parseExperimentCookie('3.12.11.r~5.50.50.f'))).toBe('3:11')
    expect(signupExperiments(parseExperimentCookie(''))).toBeUndefined()
  })

  it('stores the cookie on the account and writes the account back', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ experiment: 3, current: 11, first: 11 }], error: null })
    const set = vi.fn()
    const jar = { get: () => ({ value: '3.11.11.n~5.50.50.f' }), set }
    await syncExperimentsAtSignIn({ rpc } as never, 'u1', true, jar, true)
    expect(rpc).toHaveBeenCalledWith('experiment_sign_in', { p_user: 'u1', p_pairs: [{ experiment: 3, current: 11, first: 11 }], p_signup: true })
    expect(set).toHaveBeenCalledWith('sv_exp', '3.11.11.n~5.50.50.f', expect.objectContaining({ path: '/', secure: true }))
  })

  it('never fails the sign-in when the database does', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'down' } })
    const set = vi.fn()
    await expect(syncExperimentsAtSignIn({ rpc } as never, 'u1', false, { get: () => undefined, set }, true)).resolves.toBeInstanceOf(Map)
    expect(set).not.toHaveBeenCalled()
  })
})
