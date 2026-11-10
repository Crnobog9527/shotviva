import { createElement } from 'react'
import { createClient } from '@supabase/supabase-js'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { DirectoryTable, DossierMetrics } from './dossier-directory'
import { ProfileFacts } from './dossier-profile'
import type { DossierDetail } from './dossier-read'
import { MembersView } from './members-view'
import { href, parseFilters } from './query'

const profile: DossierDetail = {
  id: '00000000-0000-4000-8000-000000000001', user_id: '00000000-0000-4000-8000-000000000001',
  slug: 'qa-name', name: '陈某', email: 'qa@example.test', phone: '+8613900000000',
  status: 'active', source: null, team_enabled: true, team_count: 2,
  earned: 1600, confirmed: 800, unwithdrawn: -149, paid: 1496, registered_at: '2025-10-01T23:12:00Z',
  created_at: '2026-05-03T12:00:00Z', approved_at: null, approved_by: null, parent_user_id: null,
  country: 'CN', payout_method: 'wise', payout_details: 'QA', us_person: false, terms_version: 'v2',
  terms_accepted_at: null, reject_reason: null, reapply_allowed: false, rates: [], admin_note: null,
  application: { channel_type: 'xiaohongshu', audience: '1k_10k' },
}

it('renders searchable identities and all four amounts, including a negative unwithdrawn balance', () => {
  const html = renderToStaticMarkup(createElement(DirectoryTable, { items: [profile], filters: { tab: 'affiliates' } }))
  for (const value of ['陈某', 'qa-name', 'qa@example.test', '+8613900000000', '16.00', '8.00', '1.49', '14.96']) {
    expect(html).toContain(value)
  }
  expect(html).toMatch(/>-[^<]*1\.49</)
  expect(html).toContain('id=' + profile.user_id)
})
it('shows the account registration time separately from joining the program; #419 and older answers both display', () => {
  const html = renderToStaticMarkup(createElement(ProfileFacts, { member: profile }))
  for (const value of ['2025-10-02 07:12', '2026-05-03 20:00', '小红书', '1,000 到 1 万', '中国']) expect(html).toContain(value)
  const legacy = { ...profile, application: { audience: 'Local workshop' } }
  expect(renderToStaticMarkup(createElement(ProfileFacts, { member: legacy }))).toContain('Local workshop')
})
it('validates commission IDs in dossier history links at the signed bigint boundary', () => {
  const query = { tab: 'affiliates', section: 'bonuses', id: profile.id }
  expect(parseFilters({ ...query, commission: '9223372036854775807' }).success).toBe(true)
  expect(parseFilters({ ...query, commission: '9223372036854775808' }).success).toBe(false)
})

it('explains team and frozen commissions in the same terms as the directory', () => {
  const html = renderToStaticMarkup(createElement(DossierMetrics, { row: profile }))
  expect(html).toContain('累计佣金包含所有未作废的本人佣金和团队奖励，包括风控冻结佣金')
  expect(html).toContain('未提现佣金为可结算余额加待确认佣金，不含冻结佣金')
})
it.each(['affiliates', 'applications'] as const)('keeps the private search on the %s list only', async (tab) => {
  const filters = { tab, q: 'unrelated-person@example.test', review: 'rejected' as const }
  const list = renderToStaticMarkup(createElement(DirectoryTable, { items: [profile], filters }))
  expect(list).toContain('联盟会员')
  expect(list).toContain('id=' + profile.id)
  expect(list).not.toContain('unrelated-person')
  const old = { ...filters, id: profile.id, section: 'commissions' as const, commission: '21', historyCursor: 'next' }
  const db = createClient('http://localhost', 'test')
  const clean = href({ ...old, q: undefined })
  await expect(MembersView({ db, filters: old, actor: profile.id, action: async () => '' }))
    .rejects.toMatchObject({ digest: 'NEXT_REDIRECT;replace;' + clean + ';307;' })
  expect(href(old)).toBe(clean)
  expect(clean).toContain('commission=21&historyCursor=next')
  expect(clean).not.toContain('q=')
  expect(href({ ...filters, cursor: 'list-page' })).toContain('q=unrelated-person%40example.test')
})
