import { Link } from '@/core/i18n/navigation'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'
import { seriesCopy as copy } from './copy'
import type { listAdminSeriesPage } from './repository'

const path = '/admin/templates/series'
type Props = { page: Awaited<ReturnType<typeof listAdminSeriesPage>>; first: boolean; saved: boolean; search: string }

export function SeriesList({ page, first, saved, search }: Props) {
  const last = page.items.at(-1)
  const query = new URLSearchParams()
  if (search) query.set('q', search)
  const firstPage = path + '?' + query
  if (last) {
    query.set('after', last.id)
    query.set('order', String(last.sort_order))
  }
  return (
    <main className="mx-auto grid w-full max-w-5xl gap-4 p-6">
      <header className="flex flex-wrap items-center gap-4">
        <h1 className="mr-auto text-xl font-semibold">{copy.title}</h1>
        <Link className="text-sm underline" href="/admin/templates">{copy.templates}</Link>
        <Button asChild><Link href={path + '?new=1'}>{copy.create}</Link></Button>
      </header>
      {saved && <p role="status" className="text-sm">{copy.saved}</p>}
      <form className="flex max-w-md gap-2">
        <Input type="search" name="q" aria-label={copy.seriesSearch} placeholder={copy.seriesSearch} maxLength={160} defaultValue={search} />
        <Button variant="outline" type="submit">{copy.searchButton}</Button>
      </form>
      {page.items.length ? (
        <Table>
          <TableHeader><TableRow>{[copy.name_zh, copy.sort_order, copy.status, copy.selectStatus].map(label =>
            <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader>
          <TableBody>
            {page.items.map(item => <TableRow key={item.id}>
              <TableCell><Link href={path + '?id=' + item.id} className="font-medium underline">{item.name_zh}</Link>
                <span className="text-muted-foreground block text-xs">{item.slug}</span></TableCell>
              <TableCell>{item.sort_order}</TableCell>
              <TableCell>{item.is_active ? copy.published : copy.unpublished}</TableCell>
              <TableCell>{item.show_members ? copy.separate : copy.onlySeries}</TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
      ) : <p className="text-muted-foreground text-sm">{search ? copy.noSeriesMatch : copy.empty}</p>}
      <nav className="flex gap-3 text-sm underline">
        {!first && <Link href={firstPage}>{copy.first}</Link>}
        {last && page.hasNext && <Link href={path + '?' + query}>{copy.next}</Link>}
      </nav>
    </main>
  )
}
