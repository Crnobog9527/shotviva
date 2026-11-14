'use client'

import { Badge } from '@/core/ui/badge'
import { Button } from '@/core/ui/button'

import type { ExperimentView } from '../experiments/load'
import type { ExperimentAction, ExperimentRow } from '../experiments/schemas'
import { formatBeijing } from '../shell/format'
import { EXPERIMENTS_COPY } from './copy'
import { ResultsTable } from './results-table'
import { VerdictNote } from './verdict-note'

const COPY = EXPERIMENTS_COPY

// Which buttons each state offers; ended experiments are history.
const ACTIONS_BY_STATUS: Record<ExperimentRow['status'], readonly ExperimentAction[]> = {
  draft: ['start', 'delete'],
  running: ['pause', 'archive', 'end'],
  paused: ['resume', 'archive', 'end'],
  ended: [],
}

type Props = {
  view: ExperimentView
  // The surface's address, for the preview links (`?sv_preview=<option>`); null when none.
  previewPath: string | null
  pending: boolean
  onEdit: (row: ExperimentRow) => void
  onAct: (view: ExperimentView, action: ExperimentAction) => void
}

function Facts({ row }: { row: ExperimentRow }) {
  const winner = row.experiment_variants.find((variant) => variant.id === row.winner_variant_id)
  const parts = [
    `${COPY.card.goal}：${COPY.goals[row.goal]}`,
    row.started_at ? `${COPY.card.started}：${formatBeijing(row.started_at)}` : null,
    row.ended_at ? `${COPY.card.ended}：${formatBeijing(row.ended_at)}` : null,
    winner ? `${COPY.card.winner}：${winner.label}` : null,
  ]
  return <p className="text-sm text-muted-foreground">{parts.filter(Boolean).join(' · ')}</p>
}

function Previews({ row, previewPath }: { row: ExperimentRow; previewPath: string }) {
  const zhPath = previewPath === '/' ? '/zh' : `/zh${previewPath}`
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
      <span className="text-muted-foreground">{COPY.card.preview}：</span>
      {row.experiment_variants.map((variant) => (
        <span key={variant.id} className="flex gap-2">
          {variant.label}
          <a className="text-primary hover:underline" href={`${previewPath}?sv_preview=${variant.option_id}`} target="_blank" rel="noreferrer">
            EN
          </a>
          <a className="text-primary hover:underline" href={`${zhPath}?sv_preview=${variant.option_id}`} target="_blank" rel="noreferrer">
            中文
          </a>
        </span>
      ))}
    </p>
  )
}

export function ExperimentCard({ view, previewPath, pending, onEdit, onAct }: Props) {
  const { row } = view
  const archivable = row.experiment_variants.some((variant) => !variant.is_control && variant.archived_at === null)
  const actions = ACTIONS_BY_STATUS[row.status].filter((action) => action !== 'archive' || archivable)
  return (
    <section className="grid gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">{row.name}</h2>
        <Badge variant="outline">{COPY.surfaces[row.surface]}</Badge>
        <Badge variant={row.status === 'running' ? 'default' : 'secondary'}>{COPY.statuses[row.status]}</Badge>
        <div className="ml-auto flex flex-wrap gap-2">
          {row.status === 'draft' ? (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => onEdit(row)}>
              {COPY.actions.edit}
            </Button>
          ) : null}
          {actions.map((action) => (
            <Button key={action} size="sm" variant={action === 'end' || action === 'delete' ? 'destructive' : 'outline'} disabled={pending} onClick={() => onAct(view, action)}>
              {COPY.actions[action]}
            </Button>
          ))}
        </div>
      </div>
      <Facts row={row} />
      {previewPath ? <Previews row={row} previewPath={previewPath} /> : null}
      <ResultsTable variants={row.experiment_variants} results={view.results} />
      {view.visitorsMissing && row.status !== 'draft' ? <p className="text-xs text-muted-foreground">{COPY.visitorsMissing[view.visitorsMissing]}</p> : null}
      {view.verdict && view.results ? <VerdictNote verdict={view.verdict} results={view.results} /> : null}
    </section>
  )
}
