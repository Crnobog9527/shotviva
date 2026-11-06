'use client'

import { useFormatter, useTranslations } from 'next-intl'
/* eslint-disable @next/next/no-img-element -- local object URLs of the picked photos */
import { useRef } from 'react'

import { UPLOAD_ACCEPT } from '@/core/storage/rules'

import type { BatchPhoto } from './photo-batch'
import { UploadStage } from './photo-card'
import { ICONS } from './photo-pickers'

type Props = { photos: readonly BatchPhoto[]; max: number; onAdd(files: File[]): void; onRemove(id: string): void }

// The batch's photos (T28): one hairline panel, a row per photo with its own visible upload
// stage (Waiting → Compressing → Uploading → Uploaded) and a remove control that also cancels
// an upload in flight; the last row adds more until the batch is full.
export function BatchPhotos({ photos, max, onAdd, onRemove }: Props) {
  const t = useTranslations('app.workspace')
  const input = useRef<HTMLInputElement>(null)
  const full = photos.length >= max
  return (
    <div className="hairline-lit rounded-panel bg-card px-3 py-1">
      <ul aria-live="polite" className="[&>li+li]:border-t [&>li+li]:border-hairline">
        {photos.map((photo, index) => (
          <BatchPhotoRow key={photo.id} photo={photo} index={index + 1} onRemove={() => onRemove(photo.id)} />
        ))}
      </ul>
      <div className="border-t border-hairline py-2">
        {full ? (
          <p className="flex min-h-11 items-center px-1 text-caption text-muted-foreground">{t('batchFull', { max })}</p>
        ) : (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="press flex min-h-11 w-full items-center gap-3 rounded-button px-1 text-body font-semibold"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px] text-primary" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              {ICONS.gallery}
            </svg>
            {t('addMore')}
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept={UPLOAD_ACCEPT}
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? [])
          if (files.length) onAdd(files)
          event.currentTarget.value = ''
        }}
      />
    </div>
  )
}

function BatchPhotoRow({ photo, index, onRemove }: { photo: BatchPhoto; index: number; onRemove(): void }) {
  const t = useTranslations('app')
  const format = useFormatter()
  const size = format.number(photo.bytes / 1024 / 1024, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="relative block aspect-[4/5] w-12 flex-none overflow-hidden rounded-inner bg-muted">
        <img src={photo.url} alt={t('workspace.photoN', { index })} className="size-full object-cover" />
      </span>
      <div className="min-w-0 flex-1">
        <UploadStage upload={photo.upload} />
        <p className="mt-1.5 font-mono text-caption leading-[1.4] text-muted-foreground">{t('units.megabytes', { size })}</p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('workspace.removePhoto', { index })}
        className="press grid size-11 flex-none place-items-center rounded-full text-muted-foreground hover:text-foreground"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
          <path d="M7 7l10 10M17 7L7 17" />
        </svg>
      </button>
    </li>
  )
}
