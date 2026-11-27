// The tabs of /admin/orgs/[id] (Owner 2026-11-27): one page per area instead of one long page.
// The tab lives in the URL (?tab=) so any tab can be linked or reloaded. Client-safe.

export const ORG_DETAIL_TABS = [
  { key: 'overview', label: '概览' },
  { key: 'members', label: '成员' },
  { key: 'promo', label: '推广名单' },
  { key: 'credits', label: '积分与到账' },
  { key: 'works', label: '企业作品' },
  { key: 'settings', label: '设置' },
] as const

export type OrgDetailTab = (typeof ORG_DETAIL_TABS)[number]['key']

const KEYS = new Set<string>(ORG_DETAIL_TABS.map((t) => t.key))
// Links made before the tabs (a filtered 企业作品 view) carry only the works filters.
const WORK_PARAMS = ['member', 'status', 'work', 'cursor'] as const

type SearchParams = Record<string, string | string[] | undefined>

export function parseOrgDetailTab(params: SearchParams): OrgDetailTab {
  const raw = Array.isArray(params.tab) ? params.tab[0] : params.tab
  if (raw && KEYS.has(raw)) return raw as OrgDetailTab
  return WORK_PARAMS.some((key) => params[key]) ? 'works' : 'overview'
}

export function orgDetailTabHref(orgId: string, tab: OrgDetailTab): string {
  return tab === 'overview' ? `/admin/orgs/${orgId}` : `/admin/orgs/${orgId}?tab=${tab}`
}
