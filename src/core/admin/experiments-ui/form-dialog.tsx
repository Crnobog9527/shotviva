'use client'

import { useState } from 'react'

import { GOALS, SURFACES, type Goal, type Surface } from '../../experiments'
import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'
import { Input } from '@/core/ui/input'

import { EXPERIMENTS_COPY } from './copy'
import { defaultVariants, MAX_VARIANTS, nextOption, type ExperimentForm, type SurfaceChoices } from './form-state'
import { VariantFields } from './variant-fields'

const COPY = EXPERIMENTS_COPY.form

type Props = {
  isNew: boolean
  initial: ExperimentForm
  choices: SurfaceChoices
  pending: boolean
  error: string | null
  onCancel: () => void
  onSave: (form: ExperimentForm) => void
}

const selectClass = 'h-9 rounded-md border border-input bg-transparent px-3'

export function ExperimentFormDialog({ isNew, initial, choices, pending, error, onCancel, onSave }: Props) {
  const [form, setForm] = useState(initial)
  const set = (patch: Partial<ExperimentForm>) => setForm((current) => ({ ...current, ...patch }))
  const options = choices[form.surface] ?? []
  const next = nextOption(form, choices)
  const surfaces = SURFACES.filter((surface) => (choices[surface]?.length ?? 0) >= 2)
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isNew ? COPY.titleNew : COPY.titleEdit}</DialogTitle>
          <DialogDescription>{COPY.hint}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            onSave(form)
          }}
        >
          <label className="grid gap-1 text-sm">
            <span className="font-medium">{COPY.name}</span>
            <Input maxLength={80} placeholder={COPY.namePlaceholder} value={form.name} onChange={(event) => set({ name: event.target.value })} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">{COPY.surface}</span>
              <select
                className={selectClass}
                disabled={!isNew}
                value={form.surface}
                onChange={(event) => {
                  const surface = event.target.value as Surface
                  set({ surface, variants: defaultVariants(choices[surface] ?? []) })
                }}
              >
                {surfaces.map((surface) => (
                  <option key={surface} value={surface}>
                    {EXPERIMENTS_COPY.surfaces[surface]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">{COPY.goal}</span>
              <select className={selectClass} value={form.goal} onChange={(event) => set({ goal: event.target.value as Goal })}>
                {GOALS.map((goal) => (
                  <option key={goal} value={goal}>
                    {EXPERIMENTS_COPY.goals[goal]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <VariantFields variants={form.variants} options={options} onChange={(variants) => set({ variants })} />
          {next && form.variants.length < MAX_VARIANTS ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-self-start"
              onClick={() => set({ variants: [...form.variants, { optionId: next.id, label: next.label.slice(0, 40), weight: '0', isControl: false }] })}
            >
              {COPY.addVariant}
            </Button>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
              {COPY.cancel}
            </Button>
            <Button type="submit" disabled={pending}>
              {COPY.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
