import Link from 'next/link'
import { StatCard } from '@/core/admin'
import { Badge } from '@/core/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'
import { DOSSIER, COPY, money } from './copy'
import { enrollmentLabel } from './enrollment'
import { href, type Filters } from './query'
import type { Dossier } from './dossier-read'

const metrics = ['earned', 'confirmed', 'unwithdrawn', 'paid'] as const

export function DossierMetrics({ row }: { row: Dossier }) {
  return (
    <div className="grid gap-3">
      <div className={row.team_enabled ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-5" : "grid gap-3 sm:grid-cols-2 xl:grid-cols-4"}>
        {metrics.map((key) => <StatCard key={key} title={DOSSIER[key]} value={money(row[key])} />)}
        {row.team_enabled && <StatCard title={DOSSIER.teamCount} value={String(row.team_count ?? 0)} />}
      </div>
      <p className="text-xs text-muted-foreground">{DOSSIER.definitions}</p>
    </div>
  )
}

export function DirectoryTable({ items, filters }: { items: Dossier[]; filters: Filters }) {
  if (!items.length) return <p className="rounded border border-dashed p-4 text-muted-foreground">{COPY.empty}</p>
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {[DOSSIER.person, DOSSIER.accountContact, COPY.status, DOSSIER.teamCount, ...metrics.map((k) => DOSSIER[k])].map((h) => (
              <TableHead key={h}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((r) => (
            <TableRow key={r.user_id}>
              <TableCell>
                <Link prefetch={false} className="block font-medium text-primary hover:underline"
                  href={href({ tab: filters.tab, review: filters.review, id: r.user_id })}>
                  {r.name || DOSSIER.unnamed}
                  <span className="block font-mono text-xs text-muted-foreground">{r.slug}</span>
                </Link>
              </TableCell>
              <TableCell><div>{r.email ?? '—'}</div><div className="text-xs text-muted-foreground">{r.phone ?? '—'}</div></TableCell>
              <TableCell><Badge variant="outline">{enrollmentLabel(r)}</Badge></TableCell>
              <TableCell className="tabular-nums">{r.team_enabled ? r.team_count : '—'}</TableCell>
              {metrics.map((key) => <TableCell key={key} className="tabular-nums">{money(r[key])}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
