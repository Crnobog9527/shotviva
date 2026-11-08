'use client'

import { Columns2, Pencil, X } from 'lucide-react'

import { Button } from '@/core/ui/button'

import type { CoverLanguage } from '../templates/types'
import type { TestRunView } from '../test-runs'
import { TEST_RUN_COPY as COPY } from './copy'
import type { RunActions } from './run-card'
import { RunNodeView } from './run-node'
import { buildRunTree } from './run-tree'

type Props = {
  runs: readonly TestRunView[]
  languages: readonly CoverLanguage[]
  actions: RunActions
  onCompare: () => void
  onEditSelected: () => void
  onClear: () => void
}

// 记录和对比 (ARCHITECTURE §10.b): the template's last 50 runs as a tree, with a bar for what the
// ticked results can do together: compare two, or edit up to three with one sentence.
export function Records({ runs, languages, actions, onCompare, onEditSelected, onClear }: Props) {
  const tree = buildRunTree(runs)
  const count = actions.selected.size
  return (
    <section aria-labelledby="test-records-title" className="grid gap-3">
      <div className="bg-background/95 sticky top-0 z-10 flex flex-wrap items-center gap-2 py-1 backdrop-blur">
        <h3 id="test-records-title" className="text-sm font-semibold">
          {COPY.records.title(runs.length)}
        </h3>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {count > 0 ? <span className="text-muted-foreground text-xs">{COPY.records.selected(count)}</span> : null}
          <Button size="sm" variant="outline" onClick={onCompare} disabled={count !== 2} title={COPY.records.compareHint}>
            <Columns2 />
            {COPY.records.compare}
          </Button>
          <Button size="sm" variant="outline" onClick={onEditSelected} disabled={count === 0 || count > 3}>
            <Pencil />
            {COPY.records.editSelected}
          </Button>
          {count > 0 ? (
            <Button size="icon-sm" variant="ghost" onClick={onClear} aria-label={COPY.records.clear} title={COPY.records.clear}>
              <X />
            </Button>
          ) : null}
        </div>
      </div>
      {tree.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">{COPY.records.empty}</p>
      ) : (
        <ul className="grid gap-6">
          {tree.map((node) => (
            <RunNodeView key={node.key} node={node} actions={actions} languages={languages} />
          ))}
        </ul>
      )}
    </section>
  )
}
