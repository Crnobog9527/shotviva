import { useTranslations } from 'next-intl'

import { Link } from '@/core/i18n/ui'
import { cn } from '@/core/ui/cn'

import type { OrgWorksPage } from '../works'

const WORKS_HREF = '/account/enterprise/works'

// 企业作品's member filter: a chip rail under the sections on a phone, a list in the side column
// from lg up (the affiliate dashboard's views look the same). Removed members stay, marked.
export function WorksMemberFilter({ page }: { page: Pick<OrgWorksPage, 'members' | 'member'> }) {
  const t = useTranslations('app.org.works')
  const total = page.members.reduce((sum, m) => sum + m.works, 0)
  const items = [
    { id: null, label: t('all'), works: total, removed: false },
    ...page.members.map((m) => ({
      id: m.userId,
      label: m.role === 'owner' ? t('owner') : (m.label ?? t('unknown')),
      works: m.works,
      removed: m.status === 'removed',
    })),
  ]
  return (
    <nav aria-label={t('filterLabel')} className="no-scrollbar -mx-(--gutter) overflow-x-auto px-(--gutter) lg:mx-0 lg:overflow-visible lg:px-0">
      <ul className="flex gap-2 lg:flex-col lg:gap-0.5">
        {items.map((item) => {
          const here = item.id === page.member
          return (
            <li key={item.id ?? 'all'} className="shrink-0 lg:min-w-0">
              <Link
                href={item.id ? `${WORKS_HREF}?member=${item.id}` : WORKS_HREF}
                aria-current={here ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-10 max-w-[16rem] items-center gap-1.5 rounded-full px-4 text-label font-medium whitespace-nowrap transition-[color,background-color,scale] active:scale-[0.975]',
                  'lg:flex lg:max-w-none lg:min-h-10 lg:rounded-inner lg:px-3.5 lg:pl-7',
                  here
                    ? 'bg-foreground text-background lg:bg-wash lg:text-foreground'
                    : 'bg-wash text-bone-dim shadow-[inset_0_0_0_1px_var(--border)] hover:text-foreground lg:bg-transparent lg:shadow-none lg:hover:bg-wash',
                )}
              >
                <span className="min-w-0 truncate">{item.label}</span>
                {item.removed ? <span className="shrink-0 text-caption opacity-70">· {t('removed')}</span> : null}
                <span className="ml-auto shrink-0 text-caption tabular-nums opacity-70">{item.works}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
