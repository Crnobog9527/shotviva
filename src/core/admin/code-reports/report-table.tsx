import Link from 'next/link'
import type { ReactNode } from 'react'

import { buttonVariants } from '../../ui/button'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '../../ui/table'
import { EmptyState } from '../shell'
import { UserLink } from '../users-ui'
import { COPY } from './copy'

export function ReportTable({ headings, empty, children }: { headings: string[]; empty?: string; children: ReactNode }) {
  if (empty) return <EmptyState title={empty} />
  return <div className="overflow-hidden rounded-lg border bg-card">
    <Table><TableHeader><TableRow>{headings.map(h => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
      <TableBody>{children}</TableBody></Table>
  </div>
}

export function Person({ id }: { id: string | null }) {
  if (!id) return COPY.blank
  return <UserLink userId={id} title={id} className="font-mono underline underline-offset-2">{id.slice(0, 8)}</UserLink>
}

export function NavLink({ href, children, current = false }: { href: string; children: ReactNode; current?: boolean }) {
  return <Link href={href} aria-current={current ? 'page' : undefined}
    className={buttonVariants({ variant: current ? 'secondary' : 'outline', size: 'sm' })}>{children}</Link>
}

export function Pager({ base, current, next }: { base: string; current?: string; next: string | null }) {
  if (!current && !next) return null
  return <nav className="flex gap-2">
    {current && <NavLink href={base}>{COPY.first}</NavLink>}
    {next && <NavLink href={base + (base.includes('?') ? '&' : '?') + 'cursor=' + encodeURIComponent(next)}>{COPY.next}</NavLink>}
  </nav>
}
