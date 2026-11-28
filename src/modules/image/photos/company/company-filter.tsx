import { useTranslations } from 'next-intl'

import { Link } from '@/core/i18n/ui'
import { DELETED_MAKERS, ME, PERSONAL, type CompanyFilter, type OrgWorkMember } from '@/core/org/works'
import { cn } from '@/core/ui/cn'

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

// The rail itself: a row of pills that scrolls sideways on a phone, the chosen one in bone. Each
// is a link, so the filter lives in the address and Back, refresh and Load more keep it.
export function CompanyFilterRail({ chips, current }: { chips: readonly FilterChip[]; current: CompanyFilter }) {
  const t = useTranslations('app.photos.company')
  return (
    <nav aria-label={t('filterLabel')} className="no-scrollbar mt-3 overflow-x-auto px-(--gutter)">
      <ul className="flex gap-2">
        {chips.map((chip) => {
          const here = chip.id === current
          return (
            <li key={chip.id ?? 'all'} className="shrink-0">
              <Link
                href={companyHref(chip.id)}
                aria-current={here ? 'page' : undefined}
                className={cn(
                  'press inline-flex min-h-9 max-w-[16rem] items-center gap-1.5 rounded-full px-3.5 text-caption font-medium whitespace-nowrap',
                  here ? 'bg-foreground text-background' : 'hairline bg-wash text-bone-dim hover:text-foreground',
                )}
              >
                <span className="min-w-0 truncate">{chip.label}</span>
                {chip.removed ? <span className="shrink-0 opacity-70">· {t('leftMark')}</span> : null}
                {chip.works === undefined ? null : <span className="shrink-0 tabular-nums opacity-70">{chip.works}</span>}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
