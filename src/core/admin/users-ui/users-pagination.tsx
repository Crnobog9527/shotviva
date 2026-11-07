import Link from 'next/link'

import { cn } from '@/core/ui/cn'

import { pageItems, usersHref, type UserFilters } from '../users/list-filters'
import { USERS_COPY } from './copy'

const COPY = USERS_COPY.pages
const ITEM = 'inline-flex h-9 min-w-9 items-center justify-center rounded-md px-3 text-sm tabular-nums'

type Props = { filters: UserFilters; page: number; pageCount: number }

// Numbered pages (ARCHITECTURE §10.a 「页码翻页并显示总数」), every link keeping the filters.
export function UsersPagination({ filters, page, pageCount }: Props) {
  if (pageCount <= 1) return null
  const href = (target: number) => usersHref(filters, { page: target })
  return (
    <nav aria-label={COPY.label} className="flex flex-wrap items-center justify-center gap-1">
      <Edge href={page > 1 ? href(page - 1) : null} label={COPY.previous} />
      {pageItems(page, pageCount).map((item, index) =>
        item === 'gap' ? (
          <span key={`gap-${index}`} className={cn(ITEM, 'px-1 text-muted-foreground')} aria-hidden="true">
            …
          </span>
        ) : (
          <Link
            key={item}
            href={href(item)}
            aria-label={COPY.page(item)}
            aria-current={item === page ? 'page' : undefined}
            className={cn(ITEM, item === page ? 'bg-primary font-semibold text-primary-foreground' : 'text-foreground hover:bg-accent')}
          >
            {item}
          </Link>
        ),
      )}
      <Edge href={page < pageCount ? href(page + 1) : null} label={COPY.next} />
    </nav>
  )
}

function Edge({ href, label }: { href: string | null; label: string }) {
  if (!href) return <span className={cn(ITEM, 'text-muted-foreground/50')}>{label}</span>
  return (
    <Link href={href} className={cn(ITEM, 'text-primary hover:bg-accent')}>
      {label}
    </Link>
  )
}
