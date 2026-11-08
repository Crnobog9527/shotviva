'use client'

import { CornerDownRight } from 'lucide-react'

import { ASPECT_LABEL, RESOLUTION_LABEL, TEST_RUN_COPY as COPY } from './copy'
import { RunCard, type RunActions } from './run-card'
import type { RunNode } from './run-tree'

function Heading({ node }: { node: RunNode }) {
  const first = node.runs[0]!
  const title = node.kind === 'generate' ? COPY.records.first : COPY.records.editOf(first.instruction ?? '')
  const facts = [
    RESOLUTION_LABEL[first.resolution],
    first.aspectRatio ? (ASPECT_LABEL[first.aspectRatio] ?? first.aspectRatio) : null,
    first.editScope ? COPY.run.scope(first.editScope) : null,
    first.promptVersion === null ? null : node.kind === 'generate' ? COPY.run.prompt(first.promptVersion) : COPY.run.editPrompt(first.promptVersion),
    first.model,
    new Date(first.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
  ].filter(Boolean)
  return (
    <header className="grid gap-0.5">
      <p className="text-sm font-medium break-words">
        {title}
        {node.orphan ? <span className="text-muted-foreground ml-2 text-xs font-normal">{COPY.records.orphan}</span> : null}
      </p>
      <p className="text-muted-foreground text-xs">{facts.join(' · ')}</p>
      {first.note ? <p className="text-muted-foreground text-xs break-words">{COPY.records.note(first.note)}</p> : null}
    </header>
  )
}

// One click's runs side by side, then, for each of them, the edits made on it, indented: the
// chain 首次出图 → 编辑 → 再编辑 reads top to bottom (ARCHITECTURE §10.b 「记录树」).
export function RunNodeView({ node, actions }: { node: RunNode; actions: RunActions }) {
  const position = (runId: string) => node.runs.findIndex((run) => run.id === runId) + 1
  return (
    <li className="grid gap-2">
      <Heading node={node} />
      <div className="grid grid-cols-3 gap-2">
        {node.runs.map((run) => (
          <RunCard key={run.id} run={run} actions={actions} />
        ))}
      </div>
      {Object.entries(node.children).map(([runId, children]) => (
        <div key={runId} className="border-border ml-2 grid gap-2 border-l-2 pl-3">
          {node.runs.length > 1 ? (
            <p className="text-muted-foreground flex items-center gap-1 text-xs">
              <CornerDownRight className="size-3" aria-hidden />
              {COPY.records.onRun(position(runId))}
            </p>
          ) : null}
          <ul className="grid gap-4">
            {children.map((child) => (
              <RunNodeView key={child.key} node={child} actions={actions} />
            ))}
          </ul>
        </div>
      ))}
    </li>
  )
}
