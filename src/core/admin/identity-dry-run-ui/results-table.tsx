'use client'

import { Badge } from '@/core/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import type { DryRunRow } from '../identity-dry-run/types'
import { DRY_RUN_COPY as COPY } from './copy'

function Verdict({ refused }: { refused: boolean }) {
  return <Badge variant={refused ? 'destructive' : 'secondary'}>{refused ? COPY.refuse : COPY.allow}</Badge>
}

function ModelCell({ row }: { row: DryRunRow }) {
  if (row.identitySwap === null) return <span className="text-xs text-destructive">{row.error ?? COPY.none}</span>
  return <span className="text-sm">{row.identitySwap ? COPY.refuse : COPY.allow}</span>
}

// One row per line: the words, the keyword hit, the model's answer, the production verdict, and
// the call's latency and tokens.
export function DryRunTable({ rows }: { rows: DryRunRow[] }) {
  const c = COPY.columns
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{c.text}</TableHead>
          <TableHead>{c.keyword}</TableHead>
          <TableHead>{c.model}</TableHead>
          <TableHead>{c.final}</TableHead>
          <TableHead className="text-right">{c.ms}</TableHead>
          <TableHead className="text-right">{c.tokens}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => (
          <TableRow key={`${i}-${row.text}`}>
            <TableCell className="max-w-[28rem] text-sm break-words whitespace-normal">{row.text}</TableCell>
            <TableCell className="text-sm">{row.keyword ? COPY.refuse : COPY.none}</TableCell>
            <TableCell>
              <ModelCell row={row} />
            </TableCell>
            <TableCell>
              <Verdict refused={row.refused} />
            </TableCell>
            <TableCell className="text-right font-mono text-xs tabular-nums">{row.ms ?? COPY.none}</TableCell>
            <TableCell className="text-right font-mono text-xs tabular-nums">
              {row.inputTokens ?? COPY.none} / {row.outputTokens ?? COPY.none}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
