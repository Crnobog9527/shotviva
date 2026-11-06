'use client'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { balanceSentence } from '@/core/app-shell/balance-copy'
import type { Balance } from '@/core/billing/pools'
import type { OutputAspect, Resolution } from '@/core/templates'

import type { MembershipTier } from '@/core/config'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { BatchHint } from './batch-hint'
import { BatchPhotos } from './batch-photos'
import { ResolutionPicker, SizePicker } from './option-pickers'
import { PhotoCard } from './photo-card'
import { PhotoPickers } from './photo-pickers'
import { CopyFields, NoteField } from './text-fields'
import type { PhotoBatch } from './use-photo-batch'
import { notePlaceholder, SIZE_OPTIONS } from './workspace-options'

export type FormValues = { aspect: OutputAspect; resolution: Resolution; note: string; copy: Record<string, string> }

type Props = {
  template: CatalogueTemplate
  balance: Balance
  tier: MembershipTier | null
  photos: PhotoBatch
  values: FormValues
  onChange(next: Partial<FormValues>): void
}

// One column, one scroll, no wizard (DESIGN §4.3): photo → text the template needs → the
// optional note → size → resolution, then the balance line above the fixed action bar.
export function WorkspaceForm({ template, balance, tier, photos, values, onChange }: Props) {
  const t = useTranslations('app')
  const balanceT = useTranslations('app.balance')
  const noteT = useTranslations('app.workspace.notePlaceholder')
  const size = SIZE_OPTIONS.find((option) => option.id === values.aspect)
  return (
    <>
      <Section id="photo-h" title={t(photos.batchMax > 1 ? 'workspace.yourPhotos' : 'workspace.yourPhoto')} aside={<PhotoAside photos={photos} />}>
        <PhotoField photos={photos} />
        <BatchHint tier={tier} dropped={photos.dropped} />
      </Section>
      {template.copyFields.length > 0 ? (
        <div className="px-4 pt-6">
          <CopyFields fields={template.copyFields} values={values.copy} onChange={(copy) => onChange({ copy })} />
        </div>
      ) : null}
      <div className="px-4 pt-6">
        <NoteField value={values.note} placeholder={notePlaceholder(template.category, noteT)} onChange={(note) => onChange({ note })} />
      </div>
      <Section
        id="size-h"
        title={t('workspace.size')}
        aside={
          <span className="text-caption text-muted-foreground">
            {size ? t(`sizes.${size.id}`) : null}
            {size?.ratio ? <span className="font-mono"> · {size.ratio}</span> : null}
          </span>
        }
      >
        <SizePicker value={values.aspect} onChange={(aspect) => onChange({ aspect })} />
      </Section>
      <Section id="res-h" title={t('workspace.resolution')}>
        <ResolutionPicker value={values.resolution} costs={template.creditsCost} balance={balance} onChange={(resolution) => onChange({ resolution })} />
      </Section>
      <p className="flex items-center gap-2 px-4 pt-5 text-caption text-muted-foreground">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 flex-none text-primary" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 8v4.5M12 16h.01" />
        </svg>
        {balanceSentence(balance, balanceT)}
      </p>
    </>
  )
}

// Single-photo tiers keep the one-photo card with Replace; Pro and Max get the batch list.
function PhotoField({ photos }: { photos: PhotoBatch }) {
  const [first] = photos.photos
  if (photos.batchMax <= 1) {
    return first ? <PhotoCard photo={first} upload={first.upload} onPick={(file) => photos.add([file])} /> : <PhotoPickers onPick={photos.add} />
  }
  if (!first) return <PhotoPickers onPick={photos.add} multiple />
  return <BatchPhotos photos={photos.photos} max={photos.batchMax} onAdd={photos.add} onRemove={photos.remove} />
}

// "4:5 · as shot" for one photo; "3 / 10" for a batch.
function PhotoAside({ photos }: { photos: PhotoBatch }) {
  const t = useTranslations('app')
  const [first] = photos.photos
  if (photos.batchMax > 1 && first) {
    return <span className="font-mono text-caption text-muted-foreground">{t('workspace.counter', { count: photos.photos.length, max: photos.batchMax })}</span>
  }
  if (photos.batchMax > 1 || !first?.ratio) return null
  return (
    <span className="text-caption text-muted-foreground">
      <span className="font-mono">{first.ratio}</span> · {t('sizes.asShot')}
    </span>
  )
}

function Section({ id, title, aside, children }: { id: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="px-4 pt-6">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-headline leading-[1.2] font-semibold tracking-[-0.01em]">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  )
}
