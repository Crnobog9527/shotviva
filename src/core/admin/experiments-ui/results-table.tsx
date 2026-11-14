'use client'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import type { VariantResult } from '../experiments/results'
import type { VariantRow } from '../experiments/schemas'
import { EXPERIMENTS_COPY } from './copy'

const COPY = EXPERIMENTS_COPY.columns
const COLUMNS = ['variant', 'weight', 'visitors', 'signups', 'firstGenerations', 'payments', 'rate', 'nowOn', 'moved'] as const

const percent = (rate: number | null) => (rate === null ? '—' : `${(rate * 100).toFixed(1)}%`)
const number = (value: number | null) => (value === null ? '—' : String(value))

// The number columns after the variant's name, in COLUMNS order.
function cellsOf(variant: VariantRow, row: VariantResult | undefined): string[] {
  if (!row) return [String(variant.weight), '—', '—', '—', '—', '—', '—', '—']
  return [String(variant.weight), number(row.visitors), number(row.signups), number(row.firstGenerations), number(row.payments), percent(row.rate), number(row.nowOn), number(row.moved)]
}

type Props = { variants: VariantRow[]; results: VariantResult[] | null }

// Per variant: visitors → sign-ups → first images → payments, each person against the variant they saw first.
export function ResultsTable({ variants, results }: Props) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((column) => (
              <TableHead key={column} className={column === 'variant' ? undefined : 'text-right'}>
                {COPY[column]}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {variants.map((variant) => (
            <TableRow key={variant.id}>
              <TableCell>
                <span className="font-medium">{variant.label}</span>
                {variant.is_control ? <span className="ml-2 text-xs text-muted-foreground">{EXPERIMENTS_COPY.card.control}</span> : null}
                {variant.archived_at ? <span className="ml-2 text-xs text-destructive">{EXPERIMENTS_COPY.card.archived}</span> : null}
              </TableCell>
              {cellsOf(variant, results?.find((result) => result.id === variant.id)).map((cell, index) => (
                <TableCell key={index} className="text-right tabular-nums">
                  {cell}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
