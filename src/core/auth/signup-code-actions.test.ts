import { beforeEach, expect, it, vi } from 'vitest'

import { CODE_COOKIE, codeCookieOptions } from '../codes'

const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => jar }))
const { readSignupCode, saveSignupCode } = await import('./signup-code-actions')

beforeEach(() => { vi.resetAllMocks() })

it('stores an uppercase httpOnly code for all signup methods and skips unchanged cookies', async () => {
  await saveSignupCode('ab12')
  expect(jar.set).toHaveBeenCalledWith(CODE_COOKIE, 'AB12', codeCookieOptions)
  jar.get.mockReturnValue({ value: 'AB12' })
  expect(await readSignupCode()).toBe('AB12')
  await saveSignupCode('ab12')
  expect(jar.set).toHaveBeenCalledTimes(1)
})

it.each(['', '🔥', 'A1B2-C3D4'])('clears the stale prefill for an empty or invalid edit (%s)', async invalid => {
  jar.get.mockReturnValue({ value: 'OLD1' })
  await saveSignupCode(invalid)
  expect(jar.delete).toHaveBeenCalledWith(CODE_COOKIE)
  expect(jar.set).not.toHaveBeenCalled()
})
