import Link from 'next/link'

import { Badge } from '@/core/ui/badge'
import { Button } from '@/core/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import type { AdminPostRow } from '../blog'
import { formatBeijing } from '../shell/format'
import { BLOG_COPY as COPY } from './copy'

const COLUMNS = ['title', 'locale', 'slug', 'status', 'updated'] as const

// /admin/blog: one row per post, newest first; the title opens the editor.
export function BlogList({ rows, nextHref }: { rows: readonly AdminPostRow[]; nextHref: string | null }) {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">{COPY.intro}</p>
        <Button className="ml-auto" asChild>
          <Link href="/admin/blog/new">{COPY.add}</Link>
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{COPY.empty}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((column) => (
                <TableHead key={column}>{COPY.columns[column]}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="max-w-96 truncate">
                  <Link href={`/admin/blog/${row.id}`} className="font-medium underline-offset-4 hover:underline">
                    {row.title}
                  </Link>
                </TableCell>
                <TableCell>{COPY.locales[row.locale]}</TableCell>
                <TableCell className="font-mono text-xs">{row.slug}</TableCell>
                <TableCell>
                  <Badge variant={row.status === 'published' ? 'default' : 'secondary'}>{COPY.status[row.status]}</Badge>
                </TableCell>
                <TableCell className="font-mono text-xs whitespace-nowrap">{formatBeijing(row.updated_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {nextHref ? (
        <Link href={nextHref} className="text-sm underline underline-offset-4">
          {COPY.nextPage}
        </Link>
      ) : null}
    </div>
  )
}
