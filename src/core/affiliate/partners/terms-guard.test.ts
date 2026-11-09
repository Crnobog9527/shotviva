import { beforeEach, expect, it, vi } from 'vitest'

const deps = vi.hoisted(() => ({ enabled: vi.fn(), messages: vi.fn(), rpc: vi.fn() }))
vi.mock('../feature', () => ({ isAffiliateEnabled: deps.enabled }))
vi.mock('next-intl/server', () => ({ getMessages: deps.messages }))
vi.mock('@/core/auth', () => ({
  createAdminSupabase: () => ({ rpc: deps.rpc }), requireUser: async () => ({ id: 'qa' }),
}))
import { applyAction } from './actions'

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
