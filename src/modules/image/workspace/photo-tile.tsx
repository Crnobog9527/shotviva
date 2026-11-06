'use client'

/* eslint-disable @next/next/no-img-element -- local object URL of the picked photo */
import { useTranslations } from 'next-intl'
import { useEffect, useRef } from 'react'

import { UPLOAD_ACCEPT } from '@/core/storage/rules'
import { cn } from '@/core/ui/cn'

import { percent } from '../generation/progress'
import type { UploadState } from './use-upload'
import { usePhoto } from './use-photo'

export type PhotoTileProps = {
  // The small line under "Add a photo" ("up to 3", "2 left"); the form that owns the tiles knows it.
  hint?: string
  // The uploaded input key once the photo is in R2; null while nothing usable is there.
  onKeyChange?(key: string | null): void
  // Whether a photo has been picked into this tile (uploading or not), so the form can open the next one.
  onPickedChange?(picked: boolean): void
  onRemove?(): void
}

// One 4:5 photo slot (B comp wishlist.html .slot), for forms that take a few photos side by side
// (the wishlist request): empty, a viewfinder with "Add a photo"; picked, the photo with its
// Compressing → Uploading bar over it and a remove button. Same upload as the workspace (usePhoto).
export function PhotoTile({ hint, onKeyChange, onPickedChange, onRemove }: PhotoTileProps) {
  const t = useTranslations('app.workspace')
  const photo = usePhoto()
  const input = useRef<HTMLInputElement>(null)
  const picked = photo.photo !== null
  useEffect(() => onKeyChange?.(photo.inputKey), [photo.inputKey, onKeyChange])
  useEffect(() => onPickedChange?.(picked), [picked, onPickedChange])

  if (!photo.photo) {
    return (
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="press viewfinder relative grid aspect-[4/5] place-content-center justify-items-center gap-1.5 rounded-[14px] bg-background p-2 text-center shadow-[inset_0_0_0_1px_var(--input)] before:inset-2.5"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[22px]" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <b className="text-caption leading-tight font-semibold">{t('tile.add')}</b>
        {hint && <small className="text-[13px] text-muted-foreground">{hint}</small>}
        <input
          ref={input}
          type="file"
          accept={UPLOAD_ACCEPT}
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            if (file) void photo.pick(file)
            event.currentTarget.value = ''
          }}
        />
      </button>
    )
  }
  return (
    <div className={cn('relative aspect-[4/5] overflow-hidden rounded-[14px] bg-muted', photo.upload.phase === 'error' && 'shadow-[inset_0_0_0_1.5px_var(--destructive)]')}>
      <img src={photo.photo.url} alt={t('photoAlt')} className="absolute inset-0 size-full object-cover" />
      <TileStage upload={photo.upload} />
      <button
        type="button"
        onClick={() => {
          photo.clear()
          onRemove?.()
        }}
        aria-label={t('tile.remove')}
        className="press absolute top-1.5 right-1.5 grid size-8 place-items-center rounded-full bg-frost-light text-foreground backdrop-blur-md"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  )
}

// Compressing → Uploading with a bar, on a scrim at the foot of the photo; gone once uploaded.
function TileStage({ upload }: { upload: UploadState }) {
  const t = useTranslations('app')
  if (upload.phase === 'done') return null
  if (upload.phase === 'error') {
    return (
      <p role="alert" className="absolute inset-x-0 bottom-0 bg-photo-fade px-2 py-1.5 text-[12px] leading-snug text-destructive">
        {t('workspace.tile.failed')}
      </p>
    )
  }
  const uploading = upload.phase === 'uploading'
  const width = uploading ? percent(upload.progress) : upload.phase === 'idle' ? 0 : 8
  return (
    <div className="absolute inset-x-0 bottom-0 bg-photo-fade px-2 pt-1.5 pb-2" aria-live="polite">
      <span className="text-[12px] leading-none font-semibold">{t(uploading ? 'workspace.uploading' : 'workspace.compressing')}</span>
      <span
        role="progressbar"
        aria-label={t(uploading ? 'workspace.uploadingAria' : 'workspace.compressingAria')}
        aria-valuenow={width}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-1.5 block h-1 overflow-hidden rounded-full bg-wash-strong"
      >
        <span className="block h-full rounded-full bg-primary transition-[width]" style={{ width: `${width}%` }} />
      </span>
    </div>
  )
}
