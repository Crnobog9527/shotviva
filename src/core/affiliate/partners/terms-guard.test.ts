import { beforeEach, expect, it, vi } from 'vitest'

const deps = vi.hoisted(() => ({ enabled: vi.fn(), messages: vi.fn(), rpc: vi.fn() }))
vi.mock('../feature', () => ({ isAffiliateEnabled: deps.enabled }))
vi.mock('next-intl/server', () => ({ getMessages: deps.messages }))
vi.mock('@/core/auth', () => ({
  createAdminSupabase: () => ({ rpc: deps.rpc }), requireUser: async () => ({ id: 'qa' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/core/i18n/server', () => ({ localized: async (path: string) => path }))
import { applyAction, saveAction } from './actions'

const fields = {
  name: 'QA', country: 'US', channel: 'https://example.test', audience: '100', plan: 'Reviews',
  parent: 'qa-team', accept: 'on', termsVersion: '1',
}
function apply() {
  const data = new FormData()
  for (const [name, value] of Object.entries(fields)) data.set(name, value)
  return applyAction('', data)
}

beforeEach(() => vi.resetAllMocks())
it('rejects a direct application with operations disabled, before reading any agreement', async () => {
  deps.enabled.mockResolvedValue(false)
  await expect(apply()).rejects.toMatchObject({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' })
  expect(deps.messages).not.toHaveBeenCalled()
  expect(deps.rpc).not.toHaveBeenCalled()
})
it.each([{}, { version: '1', body: ' ' }, { version: '2', body: 'QA' }])(
  'rejects a direct application without published text for the submitted version', async (agreement) => {
    deps.enabled.mockResolvedValue(true)
    deps.messages.mockResolvedValue({ affiliateAgreement: agreement })
    expect(await apply()).toBe('failed')
    expect(deps.rpc).not.toHaveBeenCalled()
  },
)

async function save(consent: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries({ method: 'wise', details: 'QA', us: 'no', ...consent })) data.set(key, value)
  deps.enabled.mockResolvedValue(true)
  deps.rpc.mockResolvedValue({ error: null })
  return saveAction('', data)
}

it('uses the database prior-consent check for a maintenance-only save', async () => {
  expect(await save({})).toBe('saved')
  expect(deps.rpc).toHaveBeenCalledWith('affiliate_save_profile', expect.objectContaining({ p_terms_version: null }))
  expect(deps.messages).not.toHaveBeenCalled()
})
it('requires readable published terms and an explicit checkbox for a new acceptance', async () => {
  deps.messages.mockResolvedValue({})
  expect(await save({ termsVersion: 'v2', accept: 'on' })).toBe('failed')
  deps.messages.mockResolvedValue({ affiliateAgreement: { version: 'v2', body: 'QA' } })
  expect(await save({ termsVersion: 'v2' })).toBe('invalid')
  expect(deps.rpc).not.toHaveBeenCalled()
  expect(await save({ termsVersion: 'v2', accept: 'on' })).toBe('saved')
  expect(deps.rpc).toHaveBeenCalledWith('affiliate_save_profile', expect.objectContaining({ p_terms_version: 'v2' }))
})
