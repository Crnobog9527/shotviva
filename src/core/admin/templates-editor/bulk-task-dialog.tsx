'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'
import { Label } from '@/core/ui/label'

import type { AdminTemplate } from '../templates/types'
import { bulkMoreCopy as copy } from './bulk-more-copy'
import { planTask, type BulkTask, type TaskPlan } from './bulk-task-plan'
import type { SeriesOption } from './catalog-groups'

type Props = {
  task: BulkTask | null
  selected: AdminTemplate[]
  series: readonly SeriesOption[]
  pending: boolean
  onCancel: () => void
  onConfirm: (seriesId: string | null) => void
}

// The confirm step of 删除 / 售卖 / 系列 / 复制 (Owner 2026-11-14): what will be handled and what
// will be skipped and why, before anything is sent. 删除 says plainly that it cannot be undone.
export function BulkTaskDialog({ task, selected, series, pending, onCancel, onConfirm }: Props) {
  const [seriesId, setSeriesId] = useState('')
  if (!task) return null
  const plan = planTask(task, selected)
  const needsSeries = task === 'seriesJoin'
  const moving = seriesId ? plan.will.filter(t => t.seriesId && t.seriesId !== seriesId) : []
  const close = () => { setSeriesId(''); onCancel() }
  return (
    <Dialog open onOpenChange={open => !open && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{copy.title[task](selected.length)}</DialogTitle>
          <DialogDescription className={task === 'delete' ? 'text-destructive' : undefined}>{copy.hint[task]}</DialogDescription>
        </DialogHeader>
        {needsSeries ? <SeriesSelect value={seriesId} series={series} onChange={setSeriesId} /> : null}
        <PlanLists plan={plan} moving={moving} />
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={pending}>{copy.cancel}</Button>
          <Button variant={task === 'delete' ? 'destructive' : 'default'} disabled={pending || plan.will.length === 0 || needsSeries !== !!seriesId}
            onClick={() => { onConfirm(needsSeries ? seriesId : null); setSeriesId('') }}>
            {copy.confirm[task](plan.will.length)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PlanLists({ plan, moving }: { plan: TaskPlan; moving: AdminTemplate[] }) {
  return (
    <>
      {plan.will.length > 0 ? <NameList title={copy.will(plan.will.length)} rows={plan.will.map(t => ({ template: t, reason: null }))} /> : <p className="text-sm">{copy.nothing}</p>}
      {plan.skipped.length > 0 ? <NameList title={copy.skipped(plan.skipped.length)} rows={plan.skipped} muted /> : null}
      {moving.length > 0 ? <p className="text-sm text-amber-700">{copy.moving(moving.map(t => `「${t.name}」`).join('、'))}</p> : null}
    </>
  )
}

function SeriesSelect({ value, series, onChange }: { value: string; series: readonly SeriesOption[]; onChange: (id: string) => void }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="bulk-series">{copy.pickSeries}</Label>
      <select id="bulk-series" className="border-input h-9 rounded-md border bg-transparent px-3 text-sm" value={value} onChange={e => onChange(e.target.value)}>
        <option value="">{copy.seriesPlaceholder}</option>
        {series.map(item => <option key={item.id} value={item.id}>{item.nameZh}</option>)}
      </select>
    </div>
  )
}

function NameList({ title, rows, muted }: { title: string; rows: { template: AdminTemplate; reason: string | null }[]; muted?: boolean }) {
  return (
    <div className="grid gap-1 text-sm">
      <p className={muted ? 'text-muted-foreground' : 'font-medium'}>{title}</p>
      <ul className="max-h-48 overflow-y-auto rounded-md border p-3">
        {rows.map(({ template, reason }) => (
          <li key={template.id} className="flex flex-wrap justify-between gap-x-3 py-0.5">
            <span>{template.name}{reason ? <span className="text-muted-foreground">：{reason}</span> : null}</span>
            <span className="text-muted-foreground font-mono text-xs">{template.id}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
