import { beforeEach, expect, it, vi } from 'vitest'
import { AppError } from '@/core/errors'

const deps = vi.hoisted(() => ({ enabled: vi.fn(), user: vi.fn(), account: vi.fn(), terms: vi.fn(), settings: vi.fn(), canApply: vi.fn() }))
vi.mock('./terms', () => ({ publishedTerms: deps.terms }))
vi.mock('../feature', () => ({ isAffiliateEnabled: deps.enabled }))
vi.mock('@/core/auth', () => ({ getSessionUser: deps.user, requireApiUser: deps.user, loginPath: (next: string) => '/login?next=' + encodeURIComponent(next) }))
vi.mock('./repository', () => ({ readAccount: deps.account, readSettings: deps.settings, canApply: deps.canApply }))
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}))
vi.mock('@/core/i18n/server', () => ({ localized: async (path: string) => '/zh' + path }))
vi.mock('next-intl/server', () => ({
  getTranslations: async () => Object.assign((key: string) => key, { has: () => true }),
}))
import { EnrollmentScreen } from './enrollment'
import { PartnerScreen, TermsScreen } from './screen'
import { exportCommissions } from './csv'

beforeEach(() => vi.resetAllMocks())
it('keeps the intro public while guarding application, portal and export with operations off', async () => {
  deps.enabled.mockResolvedValue(false)
  const props = { search: Promise.resolve({}) }
  const intro = await EnrollmentScreen(props)
  expect(intro.props.children).toBeUndefined()
  for (const load of [() => PartnerScreen(props), () => EnrollmentScreen({ ...props, openForm: true }), () => TermsScreen()]) {
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
it.each(['pending', 'rejected', 'suspended', 'banned'])('limits %s members to their status screen', async (status) => {
  deps.enabled.mockResolvedValue(true)
  deps.user.mockResolvedValue({ id: 'applicant', verified: true })
  deps.account.mockResolvedValue({ status })
  const props = { search: Promise.resolve({ view: 'commissions' }) }
  await expect(PartnerScreen(props)).rejects.toMatchObject({ digest: expect.stringContaining('/zh/partners/join;') })
  await expect(exportCommissions('en')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  const screen = await EnrollmentScreen(props)
  expect(screen.props.account.status).toBe(status)
  expect(deps.settings).not.toHaveBeenCalled()
})
it('routes an active affiliate to their dashboard even on a team invitation', async () => {
  deps.enabled.mockResolvedValue(true)
  deps.user.mockResolvedValue({ id: 'member', verified: true })
  deps.account.mockResolvedValue({ status: 'active' })
  const props = { search: Promise.resolve({ by: 'qa-anna' }) }
  await expect(EnrollmentScreen(props)).rejects.toMatchObject({ digest: expect.stringContaining('/zh/partners;') })
  await expect(PartnerScreen(props)).resolves.toBeDefined()
})
it.each([null, { id: 'unverified', verified: false }])('keeps an unverified session out of the dashboard', async (user) => {
  deps.enabled.mockResolvedValue(true)
  deps.user.mockResolvedValue(user)
  await expect(PartnerScreen({ search: Promise.resolve({}) })).rejects.toMatchObject({
    digest: expect.stringContaining('/zh/partners/join;'),
  })
  expect(deps.account).not.toHaveBeenCalled()
})

it.each([false, true])('keeps the application accessible without published terms (deep link: %s)', async (openForm) => {
  deps.enabled.mockResolvedValue(true)
  deps.settings.mockResolvedValue({ terms_version: 'unpublished' })
  const intro = await EnrollmentScreen({ search: Promise.resolve({ by: 'qa-team' }), openForm })
  expect(intro.props.children.props).toMatchObject({ openForm, parent: 'qa-team' })
})
