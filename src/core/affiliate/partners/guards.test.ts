import { beforeEach, expect, it, vi } from 'vitest'
import { AppError } from '@/core/errors'

const deps = vi.hoisted(() => ({ enabled: vi.fn(), user: vi.fn(), account: vi.fn() }))
vi.mock('../feature', () => ({ isAffiliateEnabled: deps.enabled }))
vi.mock('@/core/auth', () => ({ getSessionUser: deps.user, requireApiUser: deps.user }))
vi.mock('./repository', () => ({ readAccount: deps.account }))
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}))
vi.mock('next-intl/server', () => ({
  getTranslations: async () => Object.assign((key: string) => key, { has: () => true }),
}))
import { ApplyScreen, PartnerScreen, TermsScreen } from './screen'
import { exportCommissions } from './csv'

beforeEach(() => vi.resetAllMocks())
it('hides every partner page and export before accessing a session when the switch is off', async () => {
  deps.enabled.mockResolvedValue(false)
  const props = { search: Promise.resolve({}) }
  for (const load of [() => PartnerScreen(props), () => ApplyScreen(props), () => TermsScreen()]) {
    await expect(load()).rejects.toMatchObject({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' })
  }
  await expect(exportCommissions('en')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  expect(deps.user).not.toHaveBeenCalled()
})
it('rejects an anonymous CSV request before reading any affiliate account', async () => {
  deps.enabled.mockResolvedValue(true)
  deps.user.mockRejectedValue(new AppError('UNAUTHORIZED', 'Sign in first'))
  await expect(exportCommissions('en')).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  expect(deps.account).not.toHaveBeenCalled()
})
it('denies an applicant the CSV even when signed in', async () => {
  deps.enabled.mockResolvedValue(true)
  deps.user.mockResolvedValue({ id: 'applicant' })
  deps.account.mockResolvedValue({ status: 'pending' })
  await expect(exportCommissions('en')).rejects.toMatchObject({ code: 'NOT_FOUND' })
})
