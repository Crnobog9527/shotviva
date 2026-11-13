'use client'

import { useState, useTransition } from 'react'

import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import type { ActionValue } from '../templates'
import { profileCopy as copy } from './copy'
import { RESOLUTION_LABEL } from './labels'
import type { ProfileKey, SwitchInput, SwitchRow, SwitchScope, SwitchSide } from './types'

export type SwitchAction = (input: SwitchInput) => Promise<ActionValue<SwitchRow[]>>
type Choice = { key: string; label: string }
type Kind = SwitchScope['kind']

const selectClass = 'h-9 rounded-md border border-input bg-background px-2 text-sm'

function sideText(side: SwitchSide) {
  return side.resolutions.map(tier => `${RESOLUTION_LABEL[tier]} ${side.credits[tier]}`).join(' · ') || '—'
}

function scopeOf(kind: Kind, key: string, ids: string[]): SwitchScope {
  if (kind === 'ids') return { kind, ids }
  return kind === 'site' ? { kind } : { kind, key }
}

function scopeReady(kind: Kind, key: string, ids: string[]) {
  if (kind === 'site') return true
  return kind === 'ids' ? ids.length > 0 : key !== ''
}

function summary(rows: SwitchRow[], validateOnly: boolean) {
  const ok = rows.filter(row => row.ok && !row.unchanged).length
  const skipped = rows.filter(row => !row.ok).length
  if (rows.length === 0) return copy.noTemplates
  return validateOnly ? copy.result(ok, skipped, rows.length - ok - skipped) : copy.switched(ok, skipped)
}

function ScopeFields({ kind, setKind, scopeKey, setKey, categories, series, selected }: {
  kind: Kind; setKind: (kind: Kind) => void; scopeKey: string; setKey: (key: string) => void
  categories: Choice[]; series: Choice[]; selected: number
}) {
  const keyed = kind === 'category' || kind === 'series'
  return <>
    <label className="grid gap-1">{copy.scope}
      <select className={selectClass} value={kind} onChange={e => setKind(e.target.value as Kind)}>
        <option value="site">{copy.scopeSite}</option>
        <option value="category">{copy.scopeCategory}</option>
        <option value="series">{copy.scopeSeries}</option>
        <option value="ids" disabled={selected === 0}>{copy.scopeSelected(selected)}</option>
      </select>
    </label>
    {keyed && <label className="grid gap-1">{kind === 'category' ? copy.scopeCategory : copy.scopeSeries}
      <select className={selectClass} value={scopeKey} onChange={e => setKey(e.target.value)}>
        <option value="" />
        {(kind === 'category' ? categories : series).map(choice => <option key={choice.key} value={choice.key}>{choice.label}</option>)}
      </select>
    </label>}
  </>
}

function Outcome({ row }: { row: SwitchRow }) {
  if (!row.ok) return <TableCell colSpan={3} className="whitespace-normal text-destructive">{row.detail}</TableCell>
  const lost4k = row.before.resolutions.includes('4k') && !row.after.resolutions.includes('4k')
  return <>
    <TableCell>{row.unchanged ? copy.live : `${copy[row.from]} → ${copy[row.to]}`}
      {lost4k && <div className="text-amber-700 text-xs dark:text-amber-400">{copy.dropped4k}</div>}
    </TableCell>
    <TableCell>{sideText(row.before)}</TableCell>
    <TableCell>{sideText(row.after)}</TableCell>
  </>
}

function Report({ rows, names }: { rows: SwitchRow[]; names: Map<string, string> }) {
  return (
    <div className="max-h-96 overflow-auto">
      <Table>
        <TableHeader><TableRow>
          <TableHead>{copy.colTemplate}</TableHead><TableHead>{copy.colOutcome}</TableHead>
          <TableHead>{copy.colBefore}</TableHead><TableHead>{copy.colAfter}</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map(row => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-normal">{names.get(row.id) ?? row.id}<div className="text-muted-foreground text-xs">{row.id}</div></TableCell>
              <Outcome row={row} />
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function useSwitch(preset: { ids: string[]; target: ProfileKey } | null | undefined, selected: string[], action: SwitchAction, onDone: () => void) {
  const [kind, setKind] = useState<Kind>(preset ? 'ids' : 'site')
  const [key, setKey] = useState('')
  const [target, setTarget] = useState<ProfileKey>(preset?.target ?? 'seedream')
  const [reason, setReason] = useState('')
  const [rows, setRows] = useState<SwitchRow[] | null>(null)
  const [message, setMessage] = useState('')
  const [pending, run] = useTransition()
  const ids = preset?.ids ?? selected
  const reset = () => { setRows(null); setMessage('') }
  const submit = (validateOnly: boolean) => {
    setMessage(validateOnly ? copy.previewing : copy.switching)
    run(async () => {
      const result = await action({ scope: scopeOf(kind, key, ids), target, reason: reason.trim(), validateOnly }).catch(() => null)
      if (!result?.ok) { setMessage(result?.message ?? copy.failed); return }
      setRows(result.value)
      setMessage(summary(result.value, validateOnly))
      if (!validateOnly) onDone()
    })
  }
  return {
    kind, key, target, reason, rows, message, pending, submit,
    ready: reason.trim() !== '' && scopeReady(kind, key, ids),
    confirmable: rows?.filter(row => row.ok && !row.unchanged).length ?? 0,
    setKind: (next: Kind) => { setKind(next); setKey(''); reset() },
    setKey: (next: string) => { setKey(next); reset() },
    setTarget: (next: ProfileKey) => { setTarget(next); reset() },
    setReason: (next: string) => { setReason(next); reset() },
  }
}

// 批量切换: pick a scope and a target, preview (validate only: nothing is written), then confirm.
// The preview shows every template's tiers and prices before and after, and a lost 4K tier.
export function SwitchPanel({ categories, series, selected, names, preset, onDone, action }: {
  categories: Choice[]; series: Choice[]; selected: string[]; names: Map<string, string>
  preset?: { ids: string[]; target: ProfileKey } | null
  onDone: () => void; action: SwitchAction
}) {
  const s = useSwitch(preset, selected, action, onDone)
  return (
    <section className="grid gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-end gap-3 text-sm">
        {!preset && <ScopeFields kind={s.kind} scopeKey={s.key} categories={categories} series={series} selected={selected.length}
          setKind={s.setKind} setKey={s.setKey} />}
        <label className="grid gap-1">{copy.target}
          <select className={selectClass} value={s.target} onChange={e => s.setTarget(e.target.value as ProfileKey)}>
            <option value="seedream">{copy.seedream}</option>
            <option value="openai">{copy.openai}</option>
          </select>
        </label>
        <label className="grid min-w-60 flex-1 gap-1">{copy.reason}
          <Input maxLength={200} value={s.reason} onChange={e => s.setReason(e.target.value)} />
        </label>
        <Button variant="outline" disabled={!s.ready || s.pending} onClick={() => s.submit(true)}>{copy.preview}</Button>
        <Button disabled={!s.ready || s.pending || s.confirmable === 0} onClick={() => s.submit(false)}>{copy.confirm(s.confirmable)}</Button>
      </div>
      {s.message && <p className="text-muted-foreground text-sm" role="status">{s.message}</p>}
      {s.rows && s.rows.length > 0 && <Report rows={s.rows} names={names} />}
    </section>
  )
}
