'use client'

import { useFormatter, useTranslations } from 'next-intl'
/* eslint-disable @next/next/no-img-element -- local object URL of the picked photo */
import { useRef } from 'react'

import { UPLOAD_ACCEPT } from '@/core/storage/rules'

import { percent } from '../generation/progress'
import type { UploadState } from './use-upload'
import type { PickedPhoto } from './use-photo'

// The picked photo (DESIGN "Upload Zone", §4.4): a 4:5 thumbnail with the upload's visible
// stage, Compressing → Uploading with a bar → Uploaded, and a ghost "Replace photo".
export function PhotoCard({ photo, upload, onPick }: { photo: PickedPhoto; upload: UploadState; onPick(file: File): void }) {
  const t = useTranslations('app')
  const format = useFormatter()
  const size = format.number(photo.bytes / 1024 / 1024, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="hairline-lit flex items-center gap-4 rounded-panel bg-card p-3">
      <div className="relative aspect-[4/5] w-24 flex-none overflow-hidden rounded-inner bg-muted">
        <img src={photo.url} alt={t('workspace.photoAlt')} className="size-full object-cover" />
      </div>
      <div className="min-w-0 flex-1" aria-live="polite">
        <UploadStage upload={upload} />
        <p className="mt-2 font-mono text-caption leading-[1.4] text-muted-foreground">{t('units.megabytes', { size })}</p>
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="press hairline relative mt-2 inline-flex min-h-9 items-center gap-2 rounded-full bg-wash px-4 text-caption font-semibold before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4" />
          </svg>
          {t(upload.phase === 'error' ? 'workspace.chooseAnother' : 'workspace.replace')}
        </button>
        <input
          ref={input}
          type="file"
          accept={UPLOAD_ACCEPT}
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            if (file) onPick(file)
            event.currentTarget.value = ''
          }}
        />
      </div>
    </div>
  )
}

function UploadStage({ upload }: { upload: UploadState }) {
  const t = useTranslations('app')
  if (upload.phase === 'done') {
    return (
      <span className="inline-flex items-center gap-2 text-body leading-none font-semibold">
        <Tick />
        {t('workspace.uploaded')}
      </span>
    )
  }
  if (upload.phase === 'error') {
    return <p role="alert" className="text-caption leading-[1.4] text-destructive">{t(`errors.${upload.code}`)}</p>
  }
  const uploading = upload.phase === 'uploading'
  const fraction = uploading ? upload.progress : 0
  return (
    <>
      <span className="text-body leading-none font-semibold">{t(uploading ? 'workspace.uploading' : 'workspace.compressing')}</span>
      <span
        role="progressbar"
        aria-label={t(uploading ? 'workspace.uploadingAria' : 'workspace.compressingAria')}
        aria-valuenow={percent(fraction)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-3 block h-1 overflow-hidden rounded-full bg-wash-strong"
      >
        <span className="block h-full rounded-full bg-primary transition-[width]" style={{ width: `${uploading ? percent(fraction) : 8}%` }} />
      </span>
    </>
  )
}

// Success tick on its 16% tint: uploaded, and each finished stage while developing.
export function Tick() {
  return (
    <span aria-hidden="true" className="grid size-[18px] flex-none place-items-center rounded-full bg-success-tint text-success">
      <svg viewBox="0 0 24 24" className="size-[11px]" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  )
}
