import { beforeEach, describe, expect, it, vi } from 'vitest'

const spies = vi.hoisted(() => ({
  savePay: vi.fn(), create: vi.fn(), update: vi.fn(), grant: vi.fn(), savePkg: vi.fn(), bonus: vi.fn(), detail: vi.fn(), findUser: vi.fn(), phone: vi.fn(),
}))
vi.mock('@/core/org', () => ({
  adminCreateOrg: spies.create, adminUpdateOrg: spies.update, adminGrantOrg: spies.grant, adminSaveOrgPackage: spies.savePkg, adminSavePaymentAccount: spies.savePay,
  adminSetOrgSignupBonus: spies.bonus, ORG_SIGNUP_BONUS_MAX: 5000,
  PAYMENT_KINDS: ['overseas_us', 'mainland_agent'],
  PAYMENT_FIELDS: { overseas_us: ['account_name', 'bank_name', 'account_number', 'routing_aba', 'notes'], mainland_agent: ['account_name', 'bank_name', 'branch', 'account_number', 'notes'] },
}))
vi.mock('./reads', () => ({ loadOrgDetail: spies.detail }))
vi.mock('@/core/affiliate/admin/summary', () => ({ findUser: spies.findUser }))
vi.mock('@/core/affiliate/admin/create-account', () => ({ phoneUser: spies.phone, EnrollmentError: class EnrollmentError extends Error {} }))
vi.mock('@/core/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }))

const { createOrg, grantOrg, moneyToMinor, orgFailure, runOrgAction, saveOrg, savePackage, savePaymentAccount, saveSignupBonus } = await import('./commands')
const { AppError } = await import('@/core/errors')

const db = {} as never
const deps = { db, actor: '00000000-0000-4000-8000-0000000000aa' }
const ORG = '11111111-1111-4111-8111-111111111111'
const PKG = '22222222-2222-4222-8222-222222222222'

function org(over: Record<string, unknown> = {}) {
  return {
    id: ORG, name: 'Acme Test', ownerUserId: 'u', status: 'active', concurrency: null, perWindow: null, batchMax: 10, multiTemplateMax: null,
    batchZip: false, earlyFeatures: false, affiliateEnabled: false, affiliateLevels: 1, signupBonusCredits: 0, poolCredits: 0, adminNote: null, createdAt: 'x',
    updatedAt: '2026-01-01T00:00:00Z', ...over,
  }
}
const caps = { concurrency: 6, per_window: 80, batch_max: 30, multi_template_max: 5 }
const form = (over: Record<string, unknown> = {}) => ({
  id: ORG, expectedUpdatedAt: '2026-01-01T00:00:00Z', name: 'Acme Test', status: 'active', note: '',
  concurrency: '', per_window: '', batch_max: '10', multi_template_max: '', batchZip: false, earlyFeatures: false,
  affiliateEnabled: false, affiliateLevels: 1, rotateInvite: false, ...over,
})

beforeEach(() => {
  vi.resetAllMocks()
  spies.detail.mockResolvedValue({ org: org(), caps })
  spies.update.mockResolvedValue('2026-02-02T00:00:00Z')
})

describe('moneyToMinor', () => {
  it('turns decimal text into cents without floating point', () => {
    expect(moneyToMinor('1234', 'x')).toBe(123400)
    expect(moneyToMinor('12.5', 'x')).toBe(1250)
    expect(moneyToMinor(' 0.07 ', 'x')).toBe(7)
  })
  it('rejects anything else', () => {
    for (const bad of ['', '-1', '1.234', '1e3', 'abc', '1,000']) expect(() => moneyToMinor(bad, 'x')).toThrow()
  })
})

describe('createOrg', () => {
  it('looks the owner up by exact email and never invites', async () => {
    spies.findUser.mockResolvedValue({ user_id: PKG })
    spies.create.mockResolvedValue(ORG)
    const result = await createOrg(deps, { name: ' Acme Test ', account: 'Owner@Example.COM', note: '' })
    expect(spies.findUser).toHaveBeenCalledWith(db, deps.actor, 'owner@example.com')
    expect(spies.create).toHaveBeenCalledWith(db, deps.actor, { owner_user_id: PKG, name: 'Acme Test' })
    expect(result).toMatchObject({ ok: true, value: { id: ORG } })
  })
  it('answers "no such account" for an unknown email without creating anything', async () => {
    spies.findUser.mockResolvedValue(null)
    const result = await runOrgAction(() => createOrg(deps, { name: 'A', account: 'nobody@example.com' }))
    expect(result).toMatchObject({ ok: false, message: '未找到这个账号' })
    expect(spies.create).not.toHaveBeenCalled()
  })
  it('routes a phone number to the phone matcher', async () => {
    spies.phone.mockResolvedValue(PKG)
    spies.create.mockResolvedValue(ORG)
    await createOrg(deps, { name: 'A', account: '+15550100' })
    expect(spies.phone).toHaveBeenCalledWith(db, '+15550100')
    expect(spies.findUser).not.toHaveBeenCalled()
  })
})

describe('saveOrg', () => {
  it('sends only the usage keys that changed, null clears one', async () => {
    await saveOrg(deps, form({ concurrency: '4', batch_max: '' }))
    expect(spies.update).toHaveBeenCalledWith(db, deps.actor, ORG, expect.objectContaining({ concurrency: 4, batch_max: null }))
    const sent = spies.update.mock.calls[0][3]
    expect(sent).not.toHaveProperty('per_window')
    expect(sent).not.toHaveProperty('multi_template_max')
  })
  it('does not resend an untouched value that is above a since-lowered cap', async () => {
    spies.detail.mockResolvedValue({ org: org({ batchMax: 99 }), caps })
    await saveOrg(deps, form({ batch_max: '99', name: 'Renamed' }))
    expect(spies.update.mock.calls[0][3]).not.toHaveProperty('batch_max')
  })
  it('refuses a value above the hard cap and says which cap', async () => {
    const result = await runOrgAction(() => saveOrg(deps, form({ concurrency: '7' })))
    expect(result).toEqual({ ok: false, message: '「同时生成数」不能超过全站硬上限 6' })
    expect(spies.update).not.toHaveBeenCalled()
  })
  it('refuses 0 for a count that must be at least 1 but allows 0 templates', async () => {
    expect((await runOrgAction(() => saveOrg(deps, form({ concurrency: '0' })))).ok).toBe(false)
    expect((await runOrgAction(() => saveOrg(deps, form({ multi_template_max: '0' })))).ok).toBe(true)
  })
  it('passes the stale-form guard and the affiliate switch through', async () => {
    const result = await saveOrg(deps, form({ affiliateEnabled: true, affiliateLevels: 2, rotateInvite: true, status: 'suspended' }))
    expect(spies.update.mock.calls[0][3]).toMatchObject({
      expected_updated_at: '2026-01-01T00:00:00Z', affiliate_enabled: true, affiliate_levels: 2, rotate_invite: true, status: 'suspended', admin_note: null,
    })
    expect(result).toMatchObject({ ok: true, value: { updatedAt: '2026-02-02T00:00:00Z' } })
  })
})

describe('grantOrg', () => {
  const base = { orgId: ORG, requestId: 'req-123456789', kind: 'bank_grant', packageId: PKG, credits: '', cny: '', reference: '', note: '' }
  it('grants the package credits by default and keeps the CNY received as a reference in fen', async () => {
    spies.grant.mockResolvedValue({ applied: true, pool_credits: 500 })
    const result = await grantOrg(deps, { ...base, cny: '123.4', reference: ' REF-1 ' })
    expect(spies.grant).toHaveBeenCalledWith(db, deps.actor, {
      org_id: ORG, request_id: 'admin_grant:req-123456789', package_id: PKG, reference: 'REF-1', kind: 'bank_grant', amount_cny_fen: 12340,
    })
    expect(result).toMatchObject({ ok: true, value: { pool: 500 } })
  })
  it('sends the same request id on a repeat so the database applies it once, and says so', async () => {
    spies.grant.mockResolvedValue({ applied: false, pool_credits: 500 })
    const first = await grantOrg(deps, base)
    const again = await grantOrg(deps, base)
    expect(spies.grant.mock.calls[0][2].request_id).toBe(spies.grant.mock.calls[1][2].request_id)
    expect(first.message).toBe(again.message)
    expect(again.message).toContain('没有重复发放')
  })
  it('needs credits or a package for a bank grant', async () => {
    const result = await runOrgAction(() => grantOrg(deps, { ...base, packageId: '' }))
    expect(result.ok).toBe(false)
    expect(spies.grant).not.toHaveBeenCalled()
  })
  it('lets a correction be negative but requires a note and no package or CNY', async () => {
    spies.grant.mockResolvedValue({ applied: true, pool_credits: 10 })
    expect((await runOrgAction(() => grantOrg(deps, { ...base, kind: 'admin_adjust', packageId: '', credits: '-50' }))).ok).toBe(false)
    await grantOrg(deps, { ...base, kind: 'admin_adjust', packageId: '', credits: '-50', note: 'typo fix', cny: '9' })
    expect(spies.grant).toHaveBeenCalledWith(db, deps.actor, { org_id: ORG, request_id: 'admin_grant:req-123456789', kind: 'admin_adjust', credits: -50, note: 'typo fix' })
  })
  it('rejects a request id too short to be unique', async () => {
    expect((await runOrgAction(() => grantOrg(deps, { ...base, requestId: 'a' }))).ok).toBe(false)
  })
})

describe('savePackage', () => {
  const pkg = { id: '', expectedUpdatedAt: '', name: ' Starter Test ', priceUsd: '1500.50', credits: '90000', sort: '', active: true }
  it('stores the USD price in cents and the credits as typed, with no rate maths', async () => {
    spies.savePkg.mockResolvedValue(PKG)
    await savePackage(deps, pkg)
    expect(spies.savePkg).toHaveBeenCalledWith(db, deps.actor, { name: 'Starter Test', price_usd_cents: 150050, credits: 90000, sort: 0, active: true })
  })
  it('sends the id and the stale-form guard when editing', async () => {
    spies.savePkg.mockResolvedValue(PKG)
    await savePackage(deps, { ...pkg, id: PKG, expectedUpdatedAt: '2026-01-01T00:00:00Z', active: false })
    expect(spies.savePkg.mock.calls[0][2]).toMatchObject({ id: PKG, expected_updated_at: '2026-01-01T00:00:00Z', active: false })
  })
  it('rejects zero price or credits', async () => {
    expect((await runOrgAction(() => savePackage(deps, { ...pkg, priceUsd: '0' }))).ok).toBe(false)
    expect((await runOrgAction(() => savePackage(deps, { ...pkg, credits: '0' }))).ok).toBe(false)
    expect(spies.savePkg).not.toHaveBeenCalled()
  })
})

describe('orgFailure', () => {
  it('shows known database reasons in Chinese and hides unknown ones', () => {
    expect(orgFailure(new AppError('CONFLICT', 'ORG_CHANGED')).message).toContain('被别人改过')
    expect(orgFailure(new AppError('CONFLICT', 'IDEMPOTENCY_CONFLICT')).message).toContain('请求号')
    expect(orgFailure(new AppError('INTERNAL', 'rpc admin_org_grant failed: secret detail'))).toEqual({ ok: false, message: '操作失败，请稍后重试' })
    expect(orgFailure(new AppError('FORBIDDEN', 'NOT_ADMIN')).message).toBe('没有权限')
  })
})

describe('savePaymentAccount', () => {
  const fake = { account_name: 'Fake Co LLC', bank_name: 'Fake Bank', account_number: '000-FAKE-0000', routing_aba: '000000000', extra: 'dropped' }
  it('sends only the fields of the chosen group and the stale-form guard when saved before', async () => {
    spies.savePay.mockResolvedValue('2026-03-03T00:00:00Z')
    const result = await savePaymentAccount(deps, { kind: 'overseas_us', enabled: true, expectedUpdatedAt: '2026-01-01T00:00:00Z', fields: fake })
    expect(spies.savePay).toHaveBeenCalledWith(db, deps.actor, {
      kind: 'overseas_us', enabled: true, expected_updated_at: '2026-01-01T00:00:00Z',
      details: { account_name: 'Fake Co LLC', bank_name: 'Fake Bank', account_number: '000-FAKE-0000', routing_aba: '000000000', notes: '' },
    })
    expect(result).toMatchObject({ ok: true, value: { updatedAt: '2026-03-03T00:00:00Z' } })
  })
  it('omits expected_updated_at on a first save', async () => {
    spies.savePay.mockResolvedValue('x')
    await savePaymentAccount(deps, { kind: 'mainland_agent', enabled: false, expectedUpdatedAt: '', fields: {} })
    expect(spies.savePay.mock.calls[0][2]).not.toHaveProperty('expected_updated_at')
  })
  it('refuses to enable a group without account name, bank and number', async () => {
    const result = await runOrgAction(() => savePaymentAccount(deps, { kind: 'overseas_us', enabled: true, expectedUpdatedAt: '', fields: { account_name: 'Fake Co' } }))
    expect(result).toEqual({ ok: false, message: '启用前请填写账户名称、银行名称和账号' })
    expect(spies.savePay).not.toHaveBeenCalled()
  })
})

describe('saveSignupBonus', () => {
  const bonus = (credits: string) => ({ id: ORG, expectedUpdatedAt: '2026-01-01T00:00:00Z', credits })
  it('sends whole credits with the form\'s updated_at and returns the new one', async () => {
    spies.bonus.mockResolvedValue('2026-03-03T00:00:00Z')
    const result = await saveSignupBonus(deps, bonus(' 300 '))
    expect(spies.bonus).toHaveBeenCalledWith(db, deps.actor, ORG, 300, '2026-01-01T00:00:00Z')
    expect(result).toEqual({ ok: true, message: '邀请注册福利已保存', value: { updatedAt: '2026-03-03T00:00:00Z' } })
  })
  it('treats an empty field as 0 (off)', async () => {
    spies.bonus.mockResolvedValue('2026-03-03T00:00:00Z')
    await saveSignupBonus(deps, bonus(''))
    expect(spies.bonus).toHaveBeenCalledWith(db, deps.actor, ORG, 0, '2026-01-01T00:00:00Z')
  })
  it('refuses a typo above the hard cap, negatives and decimals without calling the database', async () => {
    expect(await runOrgAction(() => saveSignupBonus(deps, bonus('50000')))).toEqual({ ok: false, message: '赠送积分最多 5000' })
    for (const bad of ['-1', '1.5', 'abc']) expect((await runOrgAction(() => saveSignupBonus(deps, bonus(bad)))).ok).toBe(false)
    expect(spies.bonus).not.toHaveBeenCalled()
  })
  it('shows the stale-form message when someone else saved the org first', async () => {
    spies.bonus.mockRejectedValue(new AppError('CONFLICT', 'ORG_CHANGED'))
    const result = await runOrgAction(() => saveSignupBonus(deps, bonus('500')))
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('被别人改过') })
  })
})
