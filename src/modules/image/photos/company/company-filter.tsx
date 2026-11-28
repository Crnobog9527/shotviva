import { useLocale, useTranslations } from 'next-intl'

import { DELETED_MAKERS, ME, PERSONAL, type CompanyFilter, type CompanyPhotoCategory, type OrgWorkMember } from '@/core/org/works'
import { FilterRail } from '../filter-rail'

// One chip of the rail: whose works, and how many when known.
export type FilterChip = { id: CompanyFilter; label: string; works?: number; removed?: boolean }

type Member = OrgWorkMember & { label: string | null }

// Photos' company view, "whose works": everyone, mine, each member who has made org works
// (removed ones stay, marked), deleted accounts, and the reader's own personal works. The reader
// is "Mine", so they are not listed a second time by name.
export function useCompanyChips(members: readonly Member[], me: string, personal: number): FilterChip[] {
  const t = useTranslations('app.photos.company')
  const mine = members.find((m) => m.userId === me)
  const others = members.filter((m) => m.userId !== me)
  return [
    { id: null, label: t('all') },
    { id: ME, label: t('mine'), works: mine?.works ?? 0 },
    ...others.map((m) => ({
      id: m.userId ?? DELETED_MAKERS,
      label: m.status === 'deleted' ? t('deleted') : m.role === 'owner' ? t('owner') : (m.label ?? t('unknown')),
      works: m.works,
      removed: m.status === 'removed',
    })),
    ...(personal > 0 ? [{ id: PERSONAL, label: t('personal'), works: personal }] : []),
  ]
}

// The company view's address: whose works, which category, Load more's cursor, and with it the
// category chips the first screen read (category-chips.ts).
export const companyHref = (filter: CompanyFilter, until?: string, category?: string | null, chips?: string) => {
  const query = new URLSearchParams({ ...(filter ? { member: filter } : {}), ...(category ? { category } : {}), ...(until ? { until } : {}), ...(until && chips ? { cc: chips } : {}) }).toString()
  return query ? `/photos?${query}` : '/photos'
}

// The rail itself (the shared pills of Photos' filters), whose works by maker. A chosen category
// stays chosen when the maker changes.
export function CompanyFilterRail({ chips, current, category = null }: { chips: readonly FilterChip[]; current: CompanyFilter; category?: string | null }) {
  const t = useTranslations('app.photos.company')
  return (
    <FilterRail
      label={t('filterLabel')}
      chips={chips.map((chip) => ({ key: chip.id ?? 'all', href: companyHref(chip.id, undefined, category), label: chip.label, here: chip.id === current, count: chip.works, note: chip.removed ? t('leftMark') : undefined }))}
    />
  )
}

// The second rail: which template category, among the works of the chosen maker (migration 2040).
// Shown once it can narrow something (two categories), or while one is chosen (the way back).
export function CompanyCategoryRail({ categories, total, member, current }: { categories: readonly CompanyPhotoCategory[]; total: number; member: CompanyFilter; current: string | null }) {
  const t = useTranslations('app.photos.filter')
  const zh = useLocale() === 'zh'
  const shown = categories.filter((c) => !c.system)
  if (shown.length < 2 && current === null) return null
  return (
    <FilterRail
      label={t('label')}
      chips={[
        { key: 'all', href: companyHref(member), label: t('allCategories'), here: current === null, count: total },
        ...shown.map((c) => ({ key: `c-${c.key}`, href: companyHref(member, undefined, c.key), label: zh ? c.nameZh : c.nameEn, here: current === c.key, count: c.works })),
      ]}
    />
  )
}
