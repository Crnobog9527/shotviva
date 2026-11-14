'use client'

/* eslint-disable @next/next/no-img-element -- local object URL of the picked photo */
import { useTranslations } from 'next-intl'
import { useRef, type DragEvent } from 'react'

import { REPLAY_BLOCK_CLASS } from '@/core/analytics/browser'
import { UPLOAD_ACCEPT } from '@/core/storage/rules'

import type { CatalogueCopyField, CatalogueImageSlot } from '../catalogue/catalogue-template'
import { ICONS } from './photo-pickers'
import { PhotoSize, UploadStage } from './photo-card'
import { CopyFields } from './text-fields'
import type { SlotPhotos } from './use-photo-batch'

type Props = {
  slots: readonly CatalogueImageSlot[]
  // Make again whose photos could not come back: say so above the boxes (they stay pickable).
  missing?: 'old' | 'failed' | null
  photos: SlotPhotos
  // The template's text fields: a slot's paired note is drawn under its box.
  fields: readonly CatalogueCopyField[]
  copy: Record<string, string>
  onCopy(next: Record<string, string>): void
}

// Named image slots (ARCHITECTURE §5.1e, DESIGN §4.3): one labelled box per slot, each taking one
// image (picked or dropped onto that box only), with its help line and paired note right under
// it. Replaces the photo section for such a template, which makes one image at a time.
export function SlotBoxes({ slots, photos, fields, copy, onCopy, missing = null }: Props) {
  const t = useTranslations('app.workspace')
  return (
    <div className="grid gap-6 pt-6">
      {missing ? <MissingSlotPhotos reason={missing} /> : null}
      {slots.map((slot) => {
        const note = slot.note ? fields.find((field) => field.key === slot.note) : undefined
        return (
          <section key={slot.key} aria-labelledby={`slot-${slot.key}-h`}>
            <h2 id={`slot-${slot.key}-h`} className="mb-3 flex items-baseline gap-2 text-headline leading-[1.2] font-semibold tracking-[-0.01em]">
              {slot.label}
              {slot.required ? null : <span className="text-label font-normal text-muted-foreground">{t('optional')}</span>}
            </h2>
            <SlotBox slot={slot} photos={photos} />
            {slot.help ? <p className="mt-2 text-caption leading-[1.4] text-muted-foreground">{slot.help}</p> : null}
            {note ? <div className="pt-4"><CopyFields fields={[note]} values={copy} onChange={onCopy} idPrefix={`slot-${slot.key}`} /></div> : null}
          </section>
        )
      })}
      <p className="text-caption text-muted-foreground">{t('slots.oneAtATime')}</p>
    </div>
  )
}

// Make again without its photos (T40): the same words as the single-photo template's notice.
export function MissingSlotPhotos({ reason }: { reason: 'old' | 'failed' }) {
  const t = useTranslations('app.workspace.again')
  return (
    <p role="status" className="hairline-lit grid gap-1 rounded-panel bg-card px-4 py-3.5">
      <b className="text-body leading-[1.3] font-semibold">{t('missingTitle')}</b>
      <span className="text-caption leading-[1.4] text-muted-foreground">{t(reason === 'old' ? 'missingOld' : 'missingFailed')}</span>
    </p>
  )
}

export function SlotBox({ slot, photos }: { slot: CatalogueImageSlot; photos: SlotPhotos }) {
  const t = useTranslations('app')
  const input = useRef<HTMLInputElement>(null)
  const photo = photos.byKey[slot.key]
  const pick = (files: FileList | File[] | null | undefined) => {
    const [file] = Array.from(files ?? [])
    if (file) photos.set(slot.key, file)
  }
  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    pick(event.dataTransfer.files)
  }
  const chooser = (
    <input ref={input} type="file" accept={UPLOAD_ACCEPT} hidden aria-label={slot.label}
      onChange={(event) => { pick(event.currentTarget.files); event.currentTarget.value = '' }} />
  )
  if (!photo) {
    return (
      <div onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
        <button type="button" onClick={() => input.current?.click()} aria-label={`${t('workspace.slots.upload')} · ${slot.label}`}
          className="press hairline-lit flex min-h-[72px] w-full items-center justify-center gap-2 rounded-panel bg-card px-4 text-body font-semibold text-foreground md:hover:bg-wash">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
            {ICONS.gallery}
          </svg>
          {t('workspace.slots.upload')}
        </button>
        {chooser}
      </div>
    )
  }
  return (
    <div onDragOver={(event) => event.preventDefault()} onDrop={onDrop} className="hairline-lit flex items-center gap-4 rounded-panel bg-card p-3">
      <div className="relative aspect-square w-20 flex-none overflow-hidden rounded-inner bg-muted">
        <img src={photo.url} alt={slot.label} className={`${REPLAY_BLOCK_CLASS} size-full object-contain`} />
      </div>
      <div className="min-w-0 flex-1" aria-live="polite">
        <UploadStage upload={photo.upload} kept={photo.keptFrom !== undefined} />
        <PhotoSize size={t('units.megabytes', { size: (photo.bytes / 1024 / 1024).toFixed(1) })} keptFrom={photo.keptFrom} className="mt-2" />
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={() => input.current?.click()} aria-label={`${t('workspace.slots.replace')} · ${slot.label}`}
            className="press hairline inline-flex min-h-11 items-center rounded-full bg-wash px-4 text-caption font-semibold">
            {t('workspace.slots.replace')}
          </button>
          <button type="button" onClick={() => photos.remove(slot.key)} aria-label={`${t('workspace.slots.remove')} · ${slot.label}`}
            className="press inline-flex min-h-11 items-center px-3 text-caption">{t('workspace.slots.remove')}</button>
        </div>
        {chooser}
      </div>
    </div>
  )
}
