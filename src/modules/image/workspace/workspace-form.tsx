'use client'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { balanceSentence } from '@/core/app-shell/balance-copy'
import type { Balance } from '@/core/billing/pools'
import type { OutputAspect, Resolution } from '@/core/templates'

import type { MembershipTier } from '@/core/config'

import { AgainNote } from '../again/again-note'
import type { AgainStart } from '../again/again-start'
import { MissingPhoto } from '../again/missing-photo'
import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { TemplateToggles, type ToggleSurface } from '../toggles'
import { BatchHint } from './batch-hint'
import { BatchPhotos } from './batch-photos'
import { ResolutionPicker, SizePicker } from './option-pickers'
import { PhotoCard } from './photo-card'
import { PhotoPickers } from './photo-pickers'
import { CopyFields, NoteField } from './text-fields'
import type { PhotoBatch } from './use-photo-batch'
import { notePlaceholder, SIZE_OPTIONS } from './workspace-options'

// toggles (T89): the template's on/off options, key → on; {} is every one off.
export type FormValues = { aspect: OutputAspect; resolution: Resolution; note: string; copy: Record<string, string>; toggles: Record<string, boolean> }

type Props = {
  template: CatalogueTemplate
  balance: Balance
  tier: MembershipTier | null
  photos: PhotoBatch
  values: FormValues
  onChange(next: Partial<FormValues>): void
  // Opened with Make again (T40): the note on top, and the photo slot when the photo is missing.
  again?: AgainStart | null
  // Under the photo slot: the creation dialog's way to a batch on the workspace page.
  photoExtra?: ReactNode
  // Which frame renders the form, for the template_toggle event (T89).
  surface?: Exclude<ToggleSurface, 'home'>
}

// One column, one scroll, no wizard (DESIGN §4.3): photo → text the template needs → its on/off
// options (T89) → the optional note → size → resolution, then the balance line above the action bar. The one form
// source (T38): the workspace page and the creation dialog both render it, and their frames
// set the side padding.
export function WorkspaceForm({ template, balance, tier, photos, values, onChange, again, photoExtra, surface = 'workspace' }: Props) {
  const t = useTranslations('app')
  const balanceT = useTranslations('app.balance')
  const noteT = useTranslations('app.workspace.notePlaceholder')
  const size = SIZE_OPTIONS.find((option) => option.id === values.aspect)
  return (
    <>
      {again ? <AgainNote again={again} template={template} /> : null}
      <Section id="photo-h" title={t(photos.batchMax > 1 ? 'workspace.yourPhotos' : 'workspace.yourPhoto')} aside={<PhotoAside photos={photos} />}>
        <PhotoField photos={photos} missing={again?.missing ?? null} tier={tier} />
        <BatchHint tier={tier} dropped={photos.dropped} />
        {photoExtra}
      </Section>
      {template.copyFields.length > 0 ? (
        <div className="pt-6">
          <CopyFields fields={template.copyFields} values={values.copy} onChange={(copy) => onChange({ copy })} />
        </div>
      ) : null}
      <TemplateToggles className="pt-6" template={template} values={values.toggles} onChange={(toggles) => onChange({ toggles })} surface={surface} />
      <div className="pt-6">
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
      <p className="flex items-center gap-2 pt-5 text-caption text-muted-foreground">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 flex-none text-primary" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 8v4.5M12 16h.01" />
        </svg>
        {balanceSentence(balance, balanceT)}
      </p>
    </>
  )
}

// Single-photo tiers keep the one-photo card with Replace; Pro and Max get the batch list. Make
// again without its photo asks for it again in the empty slot.
function PhotoField({ photos, missing, tier }: { photos: PhotoBatch; missing: 'old' | 'failed' | null; tier: MembershipTier | null }) {
  const [first] = photos.photos
  if (!first && missing) return <MissingPhoto reason={missing} multiple={photos.batchMax > 1} onPick={photos.add} />
  if (photos.batchMax <= 1) {
    return first ? <PhotoCard photo={first} upload={first.upload} onPick={(file) => photos.add([file])} /> : <PhotoPickers onPick={photos.add} />
  }
  if (!first) return <PhotoPickers onPick={photos.add} multiple />
  return <BatchPhotos photos={photos.photos} max={photos.batchMax} tier={tier} onAdd={photos.add} onRemove={photos.remove} />
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
    <section aria-labelledby={id} className="pt-6">
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
