'use client'

import { Badge } from '@/core/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import type { DryRunRow } from '../identity-dry-run/types'
import { DRY_RUN_COPY as COPY } from './copy'

// The model's answer is the production verdict; a failed call lets the request through.
function Verdict({ row }: { row: DryRunRow }) {
  if (row.identitySwap === null) return <span className="text-xs text-destructive">{row.error ?? COPY.none}</span>
  return <Badge variant={row.identitySwap ? 'destructive' : 'secondary'}>{row.identitySwap ? COPY.refuse : COPY.allow}</Badge>
}

// One row per line: the words, the model's verdict, and the call's latency and tokens.
export function DryRunTable({ rows }: { rows: DryRunRow[] }) {
  const c = COPY.columns
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{c.text}</TableHead>
          <TableHead>{c.model}</TableHead>
          <TableHead className="text-right">{c.ms}</TableHead>
          <TableHead className="text-right">{c.tokens}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => (
          <TableRow key={`${i}-${row.text}`}>
            <TableCell className="max-w-[28rem] text-sm break-words whitespace-normal">{row.text}</TableCell>
            <TableCell>
              <Verdict row={row} />
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
