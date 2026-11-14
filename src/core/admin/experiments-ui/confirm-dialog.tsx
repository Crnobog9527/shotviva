'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'

import type { ExperimentView } from '../experiments/load'
import type { ExperimentAction, VariantRow } from '../experiments/schemas'
import { EXPERIMENTS_COPY } from './copy'
import { peopleOn } from './people'

const COPY = EXPERIMENTS_COPY.confirm

export type ConfirmTarget = { view: ExperimentView; action: ExperimentAction }
export type ConfirmChoice = { id: number; action: ExperimentAction; variant: number | null; fallback: number | null }

type Props = { target: ConfirmTarget; pending: boolean; error: string | null; onCancel: () => void; onConfirm: (choice: ConfirmChoice) => void }

const selectClass = 'h-9 rounded-md border border-input bg-transparent px-3'
// Ending and archiving cannot be undone: red button, and the people on each variant shown first.
const HEAVY: ReadonlySet<ExperimentAction> = new Set(['end', 'archive', 'delete'])

function VariantSelect({ label, variants, value, onChange }: { label: string; variants: VariantRow[]; value: number | null; onChange: (id: number) => void }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <select className={selectClass} value={value ?? ''} onChange={(event) => onChange(Number(event.target.value))}>
        {variants.map((variant) => (
          <option key={variant.id} value={variant.id}>
            {variant.label}
            {variant.is_control ? `（${EXPERIMENTS_COPY.card.control}）` : ''}
          </option>
        ))}
      </select>
    </label>
  )
}

function PeopleList({ view, action }: ConfirmTarget) {
  return (
    <div className="grid gap-1 text-sm">
      {action === 'end' ? <p className="text-muted-foreground">{COPY.end.warn}</p> : null}
      <ul className="grid gap-1">
        {peopleOn(view).map((row) => (
          <li key={row.id} className="flex justify-between gap-3">
            <span>{row.label}</span>
            <span className="tabular-nums text-muted-foreground">{row.text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// The variant picks the action needs: the winner when ending; the variant and where its people go when archiving.
function useChoice({ view, action }: ConfirmTarget) {
  const open = view.row.experiment_variants.filter((variant) => variant.archived_at === null)
  const archivable = open.filter((variant) => !variant.is_control)
  const controlId = open.find((variant) => variant.is_control)?.id ?? null
  const [variant, setVariant] = useState<number | null>(action === 'archive' ? (archivable[0]?.id ?? null) : controlId)
  const [fallback, setFallback] = useState<number | null>(controlId)
  return { open, archivable, variant, setVariant, fallback, setFallback, ...choiceOf(view.row.id, action, variant, fallback) }
}

function choiceOf(id: number, action: ExperimentAction, variant: number | null, fallback: number | null) {
  const choice: ConfirmChoice = { id, action, variant: action === 'end' || action === 'archive' ? variant : null, fallback: action === 'archive' ? fallback : null }
  return { choice, ready: action !== 'archive' || (variant !== null && variant !== fallback) }
}


// Every state change of an experiment is confirmed here (ARCHITECTURE §16.5).
export function ConfirmDialog({ target, pending, error, onCancel, onConfirm }: Props) {
  const { action } = target
  const copy = COPY[action]
  const { open, archivable, variant, setVariant, fallback, setFallback, choice, ready } = useChoice(target)
  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.body}</DialogDescription>
        </DialogHeader>
        <p className="rounded-md bg-muted p-3 text-sm font-medium">{target.view.row.name}</p>
        {action === 'end' || action === 'archive' ? <PeopleList {...target} /> : null}
        {action === 'end' ? <VariantSelect label={COPY.end.pick} variants={open} value={variant} onChange={setVariant} /> : null}
        {action === 'archive' ? <VariantSelect label={COPY.archive.pick} variants={archivable} value={variant} onChange={setVariant} /> : null}
        {action === 'archive' ? <VariantSelect label={COPY.archive.fallback} variants={open.filter((row) => row.id !== variant)} value={fallback} onChange={setFallback} /> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            {COPY.cancel}
          </Button>
          <Button variant={HEAVY.has(action) ? 'destructive' : 'default'} disabled={pending || !ready} onClick={() => onConfirm(choice)}>
            {copy.title.replace(/？$/, '')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
