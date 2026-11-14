'use client'

import { describeFailure, describePatch, type BulkEditFailure, type BulkEditPatch } from '../templates/bulk-edit-rules'
import type { ImageProviderOption } from '../image-provider-field'
import type { AdminTemplate } from '../templates/types'
import { categoryChoices, type CategoryOption } from './category-options'
import { bulkEditCopy as COPY } from './copy'

type Props = { providers: readonly ImageProviderOption[]; templates: AdminTemplate[]; patch: BulkEditPatch; failures: BulkEditFailure[]; categories: readonly CategoryOption[] }

// The confirm step (T79): what changes, on which templates, and every template that would fail
// the floor or the web rules (the whole batch is then refused).
export function BulkEditReview({ templates, patch, failures, categories, providers }: Props) {
  const categoryName = (key: string) => categoryChoices(categories).find(node => node.key === key)?.label ?? key
  const offWeb = patch.visibleIn !== undefined && !patch.visibleIn.includes('web')
  const featured = offWeb ? templates.filter((template) => template.featuredRank !== null) : []
  return (
    <div className="grid gap-3 text-sm">
      <div>
        <p className="font-medium">{COPY.changes}</p>
        <ul className="mt-1 list-disc pl-5">
          {describePatch(patch, categoryName, id => providers.find(p => p.id === id)?.model ?? id).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
      {failures.length > 0 ? <FailureList failures={failures} /> : null}
      {featured.length > 0 ? (
        <p className="text-amber-700">{COPY.featuredNote(featured.map((t) => `「${t.name}」`).join('、'))}</p>
      ) : null}
      <div>
        <p className="font-medium">{COPY.templates(templates.length)}</p>
        <ul className="mt-1 max-h-48 overflow-y-auto rounded-md border p-3">
          {templates.map((template) => (
            <li key={template.id} className="flex justify-between gap-3 py-0.5">
              <span className="min-w-0 truncate">{template.name}</span>
              <span className="text-muted-foreground font-mono text-xs">{template.id}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function FailureList({ failures }: { failures: BulkEditFailure[] }) {
  const count = new Set(failures.map((failure) => failure.id)).size
  return (
    <div role="alert" className="text-destructive rounded-md border border-current/30 p-3">
      <p className="font-medium">{COPY.failuresTitle(count)}</p>
      <ul className="mt-1 list-disc pl-5">
        {failures.map((failure, index) => (
          <li key={`${failure.id}-${index}`}>
            「{failure.name}」<span className="font-mono text-xs opacity-80">{failure.id}</span>：{describeFailure(failure)}
          </li>
        ))}
      </ul>
    </div>
  )
}
