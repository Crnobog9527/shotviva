import type { CollectionStats, Counted, PvuvCollections, TopCollection } from '../analytics/collections'
import { readCollections } from '../analytics/collections-load'
import type { Range } from '../analytics/range'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table'
import { COLLECTIONS_COPY as COPY } from './collections-copy'
import { n } from './format'
import { BlockFrame, Empty, MetricLabel, Unavailable } from './parts'

const NUM = 'text-right font-mono tabular-nums'
const num = (value: number | null) => (value === null ? '—' : n(value))

type Line = { key: keyof typeof COPY.metrics; people: number | null; events: number | null; indent?: boolean }

function linesOf(data: CollectionStats): Line[] {
  const pvuv = data.pvuv.status === 'ok' ? data.pvuv : null
  const counted = (value: Counted | undefined) => ({ people: value?.visitors ?? null, events: value?.events ?? null })
  return [
    { key: 'links', people: data.creators, events: data.links },
    { key: 'revoked', people: null, events: data.revoked, indent: true },
    { key: 'opens', ...counted(pvuv?.opens) },
    { key: 'signupStarts', ...counted(pvuv?.signupStarts) },
    { key: 'signups', people: pvuv ? pvuv.signups : null, events: null },
  ]
}

export function CollectionsTable({ data }: { data: CollectionStats }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{COPY.step}</TableHead>
          <TableHead className="text-right">{COPY.people}</TableHead>
          <TableHead className="text-right">{COPY.events}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {linesOf(data).map((line) => (
          <TableRow key={line.key}>
            <TableCell className={line.indent ? 'pl-6' : undefined}>
              <MetricLabel id={`collection-${line.key}`} metric={COPY.metrics[line.key]} />
            </TableCell>
            <TableCell className={NUM}>{num(line.people)}</TableCell>
            <TableCell className={NUM}>{num(line.events)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function TopTable({ rows }: { rows: readonly TopCollection[] }) {
  if (rows.length === 0) return <Empty />
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{COPY.topCollection}</TableHead>
          <TableHead>{COPY.topCode}</TableHead>
          <TableHead className="text-right">{COPY.topVisitors}</TableHead>
          <TableHead className="text-right">{COPY.topSignups}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="max-w-64 truncate">{row.title ?? COPY.untitled}</TableCell>
            <TableCell className="font-mono text-xs">{row.id}</TableCell>
            <TableCell className={NUM}>{num(row.visitors)}</TableCell>
            <TableCell className={NUM}>{num(row.signups)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

// Why the PVUV half is empty or partial, if it is.
function PvuvNote({ pvuv }: { pvuv: PvuvCollections }) {
  const text = pvuv.status === 'unconfigured' ? COPY.pvuvUnconfigured : pvuv.status === 'failed' ? COPY.pvuvFailed : pvuv.ready ? null : COPY.pvuvPending
  return text ? <p role="status" className="text-sm text-muted-foreground">{text}</p> : null
}

export function CollectionsView({ data }: { data: CollectionStats }) {
  return (
    <div className="grid gap-4">
      <PvuvNote pvuv={data.pvuv} />
      <CollectionsTable data={data} />
      {data.pvuv.status === 'ok' ? (
        <div className="grid gap-2">
          <h3 className="text-sm font-semibold">{COPY.topTitle}</h3>
          <p className="text-sm text-muted-foreground">{COPY.topHelp}</p>
          <TopTable rows={data.pvuv.top} />
        </div>
      ) : null}
    </div>
  )
}

// Shown on 「明细」 whether PostHog is on or off: its numbers come from the database and PVUV.
export async function CollectionsBlock({ range }: { range: Range }) {
  const block = await readCollections(range)
  return (
    <BlockFrame title={COPY.title} desc={COPY.desc} links={[{ href: COPY.pvuvHref, label: COPY.openPvuv }]}>
      {block.status === 'ok' ? <CollectionsView data={block.data} /> : <Unavailable />}
    </BlockFrame>
  )
}
