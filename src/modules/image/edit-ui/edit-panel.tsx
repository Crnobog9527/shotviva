'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import type { Balance } from '@/core/billing/pools'
import type { CreditsCost } from '@/core/templates/pricing'

import { sizeLabel, tierName } from '../workspace/workspace-options'
import { EditAction } from './edit-action'
import { editCta } from './edit-cta'
import { EditForm } from './edit-form'
import { EditSheet } from './edit-sheet'
import type { EditDraft, EditSource } from './edit-source'

type Props = {
  open: boolean
  onOpenChange(open: boolean): void
  source: EditSource
  balance: Balance
  creditsCost: CreditsCost
  draft: EditDraft
  onDraft(next: Partial<EditDraft>): void
  onGenerate(draft: EditDraft): void
}

// The edit panel: frame + form + bar, and the one rule the comp adds on top of the workspace's
// primary: pressing Generate with an empty field only says so and puts the cursor in it.
export function EditPanel({ open, onOpenChange, source, balance, creditsCost, draft, onDraft, onGenerate }: Props) {
  const t = useTranslations('app')
  const [showRequired, setShowRequired] = useState(false)
  const cta = editCta(balance, creditsCost[draft.resolution], draft.text)
  const change = (next: Partial<EditDraft>) => {
    if (next.text?.trim()) setShowRequired(false)
    onDraft(next)
  }
  const pointAtField = () => {
    setShowRequired(true)
    document.querySelector<HTMLTextAreaElement>('[data-edit-field]')?.focus()
  }
  return (
    <EditSheet
      open={open}
      onOpenChange={onOpenChange}
      photo={source.fileUrl}
      meta={t('edit.meta', { name: source.name, size: sizeLabel(source.aspect, t), tier: tierName(source.resolution, t) })}
      form={<EditForm source={source} balance={balance} creditsCost={creditsCost} draft={draft} showRequired={showRequired} onChange={change} />}
      bar={<EditAction cta={cta} tier={tierName(draft.resolution, t)} onEmpty={pointAtField} onGenerate={() => onGenerate({ ...draft, text: draft.text.trim() })} />}
    />
  )
}
