'use client'

import { useMemo } from 'react'

import { batchMaxFor } from '@/core/billing/tier-limits'
import { matchesStore } from '@/core/store-profile'

import { FormWeeklyTools } from '../again/form-weekly-tools'
import { useFormWeekly } from '../again/use-form-weekly'
import { isSlotTemplate, type CatalogueTemplate } from '../catalogue/catalogue-template'
import type { CatalogueSeries } from '../catalogue/catalogue-view'
import { BatchLink, type CreateContext } from './create-dialog'
import { SetCreateDialog, type SetFrame, type TemplateSet } from './set-create-dialog'
import type { WorkspaceDraft } from './use-workspace-draft'

type Props = CreateContext & { series: CatalogueSeries | null; onClose(): void }

// 用上一期 reads any style of the series (§5.3「每周复用」).
function WeeklyTools({ template, draft, set }: { template: CatalogueTemplate; draft: WorkspaceDraft; set: TemplateSet }) {
  const weekly = useFormWeekly(template, draft, set.members.map((member) => member.id))
  return <FormWeeklyTools weekly={weekly} names={Object.fromEntries(set.members.map((member) => [member.id, member.name]))} storeFields={matchesStore(template.copyFields)} />
}

// Opening a series in Create goes straight to making a photo (Owner 2026-11-12): the set dialog
// (set-create-dialog.tsx) with Create's own extras, 用上一期 and the way to Batch create.
export function SeriesCreateDialog({ series, onClose, ...context }: Props) {
  const set = useMemo<TemplateSet | null>(() => (series ? { id: series.id, kind: 'series', name: series.name, members: series.members } : null), [series])
  const frame: SetFrame = {
    tools: (args) => <WeeklyTools {...args} />,
    photoExtra: ({ template, draft, onClose: close }) => {
      // A slot template is single-run only (§5.1e): no way to a batch.
      const batch = batchMaxFor(context.tier, context.batch) > 1 && template.photoInput !== 'none' && !isSlotTemplate(template) && draft.photos.photos.length === 0
      return batch ? <BatchLink templateId={template.id} onGo={close} /> : null
    },
  }
  return <SetCreateDialog set={set} onClose={onClose} frame={frame} {...context} />
}
