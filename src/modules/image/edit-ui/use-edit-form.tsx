'use client'

import { useTranslations } from 'next-intl'
import { useState, type ReactNode } from 'react'

import type { Balance } from '@/core/billing/pools'
import type { ImageOptions } from '@/core/templates/image-options'
import type { CreditsCost } from '@/core/templates/pricing'

import { chosenAspect, closestResolution, selectedAspect } from '../workspace/output-choice'
import { useOriginalRatio } from '../workspace/use-original-ratio'
import { sizeLabel, tierName } from '../workspace/workspace-options'
import { EditAction } from './edit-action'
import { editCta } from './edit-cta'
import { EditForm } from './edit-form'
import type { EditDraft, EditSource } from './edit-source'

type Input = {
  source: EditSource
  balance: Balance
  imageOptions: ImageOptions
  creditsCost: CreditsCost
  draft: EditDraft
  onDraft(next: Partial<EditDraft>): void
  onGenerate(draft: EditDraft): void
}

// The edit form (T6 comp photo.html?edit) for whatever frames it: its meta line, the fields and
// the bar, plus the one rule the comp adds on top of the workspace's primary: pressing Generate
// with an empty field only says so and puts the cursor in it.
export function useEditForm({ source, balance, creditsCost, imageOptions, draft: requested, onDraft, onGenerate }: Input): { meta: string; form: ReactNode; bar: ReactNode } {
  const t = useTranslations('app')
  const [showRequired, setShowRequired] = useState(false)
  const photoRatio = useOriginalRatio(imageOptions.originalRatio ? null : source.fileUrl)
  const resolution = closestResolution(requested.resolution, imageOptions)
  const aspect = chosenAspect(requested.aspect, imageOptions, photoRatio)
  const draft = { ...requested, resolution: resolution ?? requested.resolution, aspect: selectedAspect(requested.aspect, imageOptions) }
  const cta = editCta(balance, creditsCost[draft.resolution], draft.text)
  const change = (next: Partial<EditDraft>) => {
    if (next.text?.trim()) setShowRequired(false)
    onDraft(next)
  }
  const pointAtField = () => {
    setShowRequired(true)
    document.querySelector<HTMLTextAreaElement>('[data-edit-field]')?.focus()
  }
  return {
    meta: t('edit.meta', { name: source.name, size: sizeLabel(source.aspect, t), tier: tierName(source.resolution, t) }),
    form: <EditForm options={imageOptions} photoRatio={photoRatio} outputAspect={aspect} source={source} balance={balance} creditsCost={creditsCost} draft={draft} showRequired={showRequired} onChange={change} />,
    bar:
      resolution && aspect ? (
        <EditAction cta={cta} privateOnly={source.privateOnly ?? false} tier={tierName(draft.resolution, t)} onEmpty={pointAtField} onGenerate={() => onGenerate({ ...draft, aspect, resolution, text: draft.text.trim() })} />
      ) : (
        <button type="button" disabled className="h-12 w-full text-muted-foreground">
          {t(!resolution || !imageOptions.aspectRatios.length ? 'workspace.noOptions' : 'workspace.pickSize')}
        </button>
      ),
  }
}
