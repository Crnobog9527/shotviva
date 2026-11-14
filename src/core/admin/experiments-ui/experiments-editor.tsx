'use client'

import { useState } from 'react'

import type { Surface } from '../../experiments'
import { Button } from '@/core/ui/button'

import type { ExperimentView } from '../experiments/load'
import type { ExperimentRow } from '../experiments/schemas'
import { useAdminAction } from '../shell/use-admin-action'
import type { ActionValue } from '../templates/types'
import { ConfirmDialog, type ConfirmChoice, type ConfirmTarget } from './confirm-dialog'
import { EXPERIMENTS_COPY as COPY } from './copy'
import { ExperimentCard } from './experiment-card'
import { ExperimentFormDialog } from './form-dialog'
import { emptyForm, toForm, toSaveInput, type ExperimentForm, type SurfaceChoices } from './form-state'

export type ExperimentAdminActions = {
  save: (input: unknown) => Promise<ActionValue<number>>
  act: (input: ConfirmChoice) => Promise<ActionValue<null>>
}

type Props = {
  views: ExperimentView[]
  choices: SurfaceChoices
  previewPaths: Partial<Record<Surface, string>>
  actions: ExperimentAdminActions
}

// /admin/experiments (ARCHITECTURE §16.5): create drafts, start, pause, end, archive variants, and
// read the results, all without a deploy.
export function ExperimentsEditor({ views, choices, previewPaths, actions }: Props) {
  const [editing, setEditing] = useState<{ row: ExperimentRow | null } | null>(null)
  const [confirming, setConfirming] = useState<ConfirmTarget | null>(null)
  const { pending, error, notice, run, clearError } = useAdminAction()
  const canCreate = Object.values(choices).some((options) => (options?.length ?? 0) >= 2)

  const save = (form: ExperimentForm) =>
    run(
      () => actions.save(toSaveInput(form, editing?.row?.id ?? null)),
      () => {
        setEditing(null)
        return COPY.done.save
      },
    )
  const act = (choice: ConfirmChoice) =>
    run(
      () => actions.act(choice),
      () => {
        setConfirming(null)
        return COPY.done[choice.action]
      },
    )

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">{COPY.intro}</p>
        <Button className="ml-auto" disabled={!canCreate} onClick={() => (clearError(), setEditing({ row: null }))}>
          {COPY.add}
        </Button>
      </div>
      {notice ? <p className="text-sm text-success">{notice}</p> : null}
      {error && !editing && !confirming ? <p className="text-sm text-destructive">{error}</p> : null}
      {views.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{COPY.empty}</p> : null}
      {views.map((view) => (
        <ExperimentCard
          key={view.row.id}
          view={view}
          previewPath={previewPaths[view.row.surface] ?? null}
          pending={pending}
          onEdit={(row) => (clearError(), setEditing({ row }))}
          onAct={(target, action) => (clearError(), setConfirming({ view: target, action }))}
        />
      ))}
      {editing ? (
        <ExperimentFormDialog
          isNew={editing.row === null}
          initial={editing.row ? toForm(editing.row) : emptyForm(choices)}
          choices={choices}
          pending={pending}
          error={error}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      ) : null}
      {confirming ? (
        <ConfirmDialog
          key={`${confirming.view.row.id}-${confirming.action}`}
          target={confirming}
          pending={pending}
          error={error}
          onCancel={() => setConfirming(null)}
          onConfirm={act}
        />
      ) : null}
    </div>
  )
}
