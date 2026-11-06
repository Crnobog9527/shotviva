'use client'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { balanceSentence } from '@/core/app-shell/balance-copy'
import type { Balance } from '@/core/billing/pools'
import type { CreditsCost } from '@/core/templates/pricing'

import { ResolutionPicker, SizePicker } from '../workspace/option-pickers'
import { sizeLabel, tierName } from '../workspace/workspace-options'
import { ChangeField } from './change-field'
import type { EditDraft, EditSource } from './edit-source'

type Props = {
  source: EditSource
  balance: Balance
  creditsCost: CreditsCost
  draft: EditDraft
  showRequired: boolean
  onChange(next: Partial<EditDraft>): void
}

// The panel's form (T6 comp photo.html?edit): the change, the size (the eight tiles, the
// original's selected; another one extends the picture around the subject, T47), the resolution
// (defaults to the original's tier), then the balance line.
export function EditForm({ source, balance, creditsCost, draft, showRequired, onChange }: Props) {
  const t = useTranslations('app')
  const balanceT = useTranslations('app.balance')
  return (
    <div className="grid gap-6 pb-4">
      <ChangeField value={draft.text} showRequired={showRequired} onChange={(text) => onChange({ text })} />
      <Section id="edit-size-h" title={t('edit.size')} aside={draft.aspect === source.aspect ? sizeLabel(draft.aspect, t) : t('edit.sizeFrom', { size: sizeLabel(draft.aspect, t), from: sizeLabel(source.aspect, t) })}>
        <SizePicker value={draft.aspect} onChange={(aspect) => onChange({ aspect })} name="edit-size" labelledBy="edit-size-h" />
        <p className="hairline mt-3 rounded-inner bg-wash-faint px-3 py-2.5 text-caption leading-[1.4] text-muted-foreground">
          {draft.aspect === source.aspect ? t('edit.sizeSame') : t('edit.sizeExtend', { size: sizeLabel(draft.aspect, t) })}
        </p>
      </Section>
      <Section id="res-h" title={t('workspace.resolution')} aside={tierName(draft.resolution, t)}>
        <ResolutionPicker value={draft.resolution} costs={creditsCost} balance={balance} onChange={(resolution) => onChange({ resolution })} />
      </Section>
      <p className="flex items-center gap-2 text-caption text-muted-foreground">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 flex-none text-primary" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 8v4.5M12 16h.01" />
        </svg>
        {balanceSentence(balance, balanceT)}
      </p>
    </div>
  )
}

function Section({ id, title, aside, children }: { id: string; title: string; aside: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-headline leading-[1.2] font-semibold tracking-[-0.01em]">
          {title}
        </h2>
        <span className="font-mono text-caption text-muted-foreground">{aside}</span>
      </div>
      {children}
    </section>
  )
}
