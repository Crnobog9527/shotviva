'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import type { TableRow } from '@/core/poster'
import { Button } from '@/core/ui/button'

import { insertRow, removeRow, setBreak, setCell, setColumn, setTableText } from '../content-edit'
import type { BlockProps } from './block-props'
import { PosterField } from './poster-field'

// The level table: column names, one narrow card per row (number keypad), full-width break rows,
// and an insert point after every row (DESIGN mobile 375: one row per line, no sideways scroll).
export function TableEditor({ content, onChange, flagged }: BlockProps) {
  const t = useTranslations('app.poster')
  const [insertAfter, setInsertAfter] = useState<number | null>(null)
  const table = content.table
  if (!table) return <p className="text-caption text-muted-foreground">{t('table.none')}</p>
  const insert = (after: number, kind: 'data' | 'break') => {
    onChange(insertRow(content, after, kind), 'table.rows')
    setInsertAfter(null)
  }
  return (
    <div className="grid gap-3">
      <PosterField label={t('table.title')} value={table.title} flagged={flagged('table.title')} flagNote={t('flagged')}
        onChange={(value) => onChange(setTableText(content, 'title', value), 'table.title')} />
      <fieldset className="grid gap-1">
        <legend className="mb-1 text-caption font-medium">{t('table.columns')}</legend>
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${table.columns.length}, minmax(0, 1fr))` }}>
          {table.columns.map((column, c) => (
            <PosterField key={c} compact label={`${t('table.column')} ${c + 1}`} value={column} flagged={flagged(`table.columns.${c}`)}
              onChange={(value) => onChange(setColumn(content, c, value), `table.columns.${c}`)} />
          ))}
        </div>
      </fieldset>
      <InsertPoint open={insertAfter === -1} onOpen={() => setInsertAfter(-1)} onInsert={(kind) => insert(-1, kind)} />
      {table.rows.map((row, r) => (
        <div key={r} className="grid gap-1">
          <RowEditor row={row} index={r} columns={table.columns} {...{ content, onChange, flagged }} />
          <InsertPoint open={insertAfter === r} onOpen={() => setInsertAfter(r)} onInsert={(kind) => insert(r, kind)} />
        </div>
      ))}
      <PosterField label={t('table.footnote')} value={table.footnote} flagged={flagged('table.footnote')} flagNote={t('flagged')}
        onChange={(value) => onChange(setTableText(content, 'footnote', value), 'table.footnote')} />
    </div>
  )
}

function RowEditor({ row, index, columns, content, onChange, flagged }: BlockProps & { row: TableRow; index: number; columns: readonly string[] }) {
  const t = useTranslations('app.poster')
  const remove = <Button variant="ghost" size="sm" aria-label={t('remove')} onClick={() => onChange(removeRow(content, index), `table.rows.${index}`)}>✕</Button>
  if (!Array.isArray(row)) {
    return (
      <div className="grid grid-cols-[1fr_auto] items-center gap-1 rounded-control bg-wash-faint p-1">
        <PosterField compact label={t('table.break')} value={row.break} flagged={flagged(`table.rows.${index}.break`)}
          onChange={(value) => onChange(setBreak(content, index, value), `table.rows.${index}.break`)} />
        {remove}
      </div>
    )
  }
  return (
    <div className="grid items-center gap-1" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr)) auto` }}>
      {row.map((cell, c) => (
        <PosterField key={c} compact inputMode="numeric" label={columns[c] || `${t('table.column')} ${c + 1}`} value={cell}
          flagged={flagged(`table.rows.${index}.${c}`)} onChange={(value) => onChange(setCell(content, index, c, value), `table.rows.${index}.${c}`)} />
      ))}
      {remove}
    </div>
  )
}

function InsertPoint({ open, onOpen, onInsert }: { open: boolean; onOpen(): void; onInsert(kind: 'data' | 'break'): void }) {
  const t = useTranslations('app.poster')
  if (!open) {
    return <button type="button" className="h-6 text-caption text-muted-foreground" onClick={onOpen}>{t('table.insert')}</button>
  }
  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" className="min-h-11 flex-1" onClick={() => onInsert('data')}>{t('table.insertRow')}</Button>
      <Button variant="outline" size="sm" className="min-h-11 flex-1" onClick={() => onInsert('break')}>{t('table.insertBreak')}</Button>
    </div>
  )
}
