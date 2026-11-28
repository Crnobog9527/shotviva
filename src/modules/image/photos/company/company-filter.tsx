import { useTranslations } from 'next-intl'

import { DELETED_MAKERS, ME, PERSONAL, type CompanyFilter, type OrgWorkMember } from '@/core/org/works'
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

export const companyHref = (filter: CompanyFilter, until?: string) => {
  const query = new URLSearchParams({ ...(filter ? { member: filter } : {}), ...(until ? { until } : {}) }).toString()
  return query ? `/photos?${query}` : '/photos'
}

// The rail itself (the shared pills of Photos' filters), whose works by maker.
export function CompanyFilterRail({ chips, current }: { chips: readonly FilterChip[]; current: CompanyFilter }) {
  const t = useTranslations('app.photos.company')
  return (
    <FilterRail
      label={t('filterLabel')}
      chips={chips.map((chip) => ({ key: chip.id ?? 'all', href: companyHref(chip.id), label: chip.label, here: chip.id === current, count: chip.works, note: chip.removed ? t('leftMark') : undefined }))}
    />
  )
}
