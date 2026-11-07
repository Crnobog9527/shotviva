'use client'

import { useTranslations } from 'next-intl'
/* eslint-disable @next/next/no-img-element -- local object URLs of the picked photos */
import { useRef } from 'react'

import { REPLAY_BLOCK_CLASS } from '@/core/analytics/browser'
import type { MembershipTier } from '@/core/config'
import { UPLOAD_ACCEPT } from '@/core/storage/rules'
import { cn } from '@/core/ui/cn'

import { percent } from '../generation/progress'
import type { BatchPhoto } from './photo-batch'

type Props = { photos: readonly BatchPhoto[]; max: number; tier: MembershipTier | null; onAdd(files: File[]): void; onRemove(id: string): void }

// The batch's photos before Generate (T28, B comp workspace.html?batch&state=ready): a tray of
// thumbnails, five across on phones and six from md, each numbered with a remove control that
// also cancels its upload, each showing its own upload (a bar while it compresses and uploads, a
// red edge if it failed); an "Add more" tile until the batch is full; a footer with the count and
// the tier's limit.
export function BatchPhotos({ photos, max, tier, onAdd, onRemove }: Props) {
  const t = useTranslations('app.workspace')
  const tiers = useTranslations('paywall.tiers')
  const input = useRef<HTMLInputElement>(null)
  const uploaded = photos.every((photo) => photo.upload.phase === 'done')
  const failed = photos.flatMap((photo, index) => (photo.upload.phase === 'error' ? [{ index: index + 1, code: photo.upload.code }] : []))
  return (
    <div className="hairline-lit rounded-panel bg-card">
      <ul aria-label={t('batch.trayLabel', { count: photos.length })} className="grid grid-cols-5 gap-1.5 p-2.5 md:grid-cols-6 md:gap-2">
        {photos.map((photo, index) => (
          <TrayPhoto key={photo.id} photo={photo} index={index + 1} onRemove={() => onRemove(photo.id)} />
        ))}
        {photos.length < max ? (
          <li>
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="press grid aspect-[4/5] w-full place-content-center justify-items-center gap-1 rounded-[10px] bg-wash-faint text-center text-caption leading-tight font-medium text-bone-dim shadow-[inset_0_0_0_1px_var(--input)] hover:text-foreground"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              {t('batch.addMore')}
              <small className="font-mono text-caption text-muted-foreground">{t('batch.left', { count: max - photos.length })}</small>
            </button>
          </li>
        ) : null}
      </ul>
      <FailedUploads failed={failed} />
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 pb-3 text-caption text-muted-foreground">
        <span>{t.rich(uploaded ? 'batch.trayReady' : 'batch.trayUploading', { count: photos.length, b: (chunks) => <b className="font-medium text-foreground">{chunks}</b> })}</span>
        <span>{t('batch.trayLimit', { tier: tiers(tier ?? 'starter'), count: max })}</span>
      </p>
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

function TrayPhoto({ photo, index, onRemove }: { photo: BatchPhoto; index: number; onRemove(): void }) {
  const t = useTranslations('app.workspace')
  const { upload } = photo
  const moving = upload.phase === 'idle' || upload.phase === 'compressing' || upload.phase === 'uploading'
  const fraction = upload.phase === 'uploading' ? upload.progress : upload.phase === 'compressing' ? 0.08 : 0
  return (
    <li className={cn('relative aspect-[4/5] overflow-hidden rounded-[10px] bg-muted', upload.phase === 'error' && 'shadow-[inset_0_0_0_1.5px_var(--destructive)]')}>
      <img src={photo.url} alt={t('photoN', { index })} className={cn(REPLAY_BLOCK_CLASS, 'size-full object-cover', moving && 'brightness-75', upload.phase === 'error' && 'opacity-60')} />
      <span aria-hidden="true" className="frost absolute bottom-1 left-1 grid h-5 min-w-5 place-items-center rounded-[6px] px-1 font-mono text-caption leading-none text-photo-ink">
        {index}
      </span>
      {moving ? (
        <span role="progressbar" aria-label={t('photoN', { index })} aria-valuenow={percent(fraction)} aria-valuemin={0} aria-valuemax={100} className="absolute inset-x-1.5 bottom-7 h-1 overflow-hidden rounded-full bg-[var(--frost)]">
          <span className="block h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent(fraction)}%` }} />
        </span>
      ) : null}
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('removePhoto', { index })}
        className="frost absolute top-1 right-1 grid size-6 place-items-center rounded-full text-photo-ink before:absolute before:-inset-2.5 before:content-['']"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </li>
  )
}

// A photo that did not upload says so under the tray, by number; removing it clears the line.
function FailedUploads({ failed }: { failed: { index: number; code: string }[] }) {
  const t = useTranslations('app')
  if (failed.length === 0) return null
  return (
    <ul role="alert" className="grid gap-1 px-3 pb-2 text-caption leading-[1.4] text-destructive">
      {failed.map(({ index, code }) => (
        <li key={index}>{t('workspace.batch.uploadFailed', { index, reason: t(`errors.${code}`) })}</li>
      ))}
    </ul>
  )
}
