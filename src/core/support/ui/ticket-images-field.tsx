'use client'

import { CircleAlertIcon, ImagePlusIcon, XIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef } from 'react'

import type { UploadErrorCode } from '../../storage/upload'

import { UPLOAD_ACCEPT } from '../../storage/rules'
import { buttonVariants } from '../../ui/button'
import { cn } from '../../ui/cn'
import { TICKET_IMAGES_MAX } from '../rules'
import { useTicketImages, type PickedImage } from './use-ticket-images'

// The field's words: the dialog's from next-intl (useImagesText), the admin page's own Chinese.
export type ImagesText = {
  label: string
  hint: string
  add: string
  count(count: number, max: number): string
  remove(n: number): string
  uploading: string
  failed: string
  error(code: UploadErrorCode | 'TOO_MANY'): string
}

type Props = {
  text: ImagesText
  onBusyChange(busy: boolean): void
  // For a form that is not posted (the admin reply): the uploaded keys as they change.
  onKeys?(keys: string[]): void
}

export function useImagesText(): ImagesText {
  const t = useTranslations('app.support.images')
  return {
    label: t('label'),
    hint: t('hint'),
    add: t('add'),
    count: (count, max) => t('count', { count, max }),
    remove: (n) => t('remove', { n }),
    uploading: t('uploading'),
    failed: t('failed'),
    error: (code) => t(`errors.${code}`, { max: TICKET_IMAGES_MAX }),
  }
}

// "Add images" under a message field (ARCHITECTURE §10 「可以附图片」, T69): up to 3 screenshots
// or photos, each uploading at once with its progress, each removable. The uploaded keys go
// with the form as `image` fields. accept lists JPEG / PNG / WebP like the generation picker
// (AGENTS §6): iOS then hands over HEIC photos as JPEG; a HEIC that still arrives is decoded in
// the browser.
export function TicketImagesField({ text, onBusyChange, onKeys }: Props) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const images = useTicketImages()
  useEffect(() => onBusyChange(images.busy), [images.busy, onBusyChange])
  const keys = images.items.flatMap((item) => (item.status === 'ready' && item.key ? [item.key] : []))
  const keyList = keys.join(' ')
  useEffect(() => onKeys?.(keyList ? keyList.split(' ') : []), [keyList, onKeys])
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span id={`${id}-label`} className="text-headline font-semibold">
          {text.label}
        </span>
        <span className="font-mono text-caption text-muted-foreground">{text.count(images.items.length, TICKET_IMAGES_MAX)}</span>
      </div>
      <p id={`${id}-hint`} className="text-caption text-muted-foreground">
        {text.hint}
      </p>
      <ul aria-labelledby={`${id}-label`} className="flex flex-wrap gap-3">
        {images.items.map((item, index) => (
          <li key={item.id}>
            <Thumb item={item} text={text} n={index + 1} onRemove={() => images.remove(item.id)} />
          </li>
        ))}
        {images.full ? null : (
          <li>
            <button
              type="button"
              aria-describedby={`${id}-hint`}
              onClick={() => input.current?.click()}
              className={buttonVariants({ variant: 'glass', size: 'touch', className: 'size-20 flex-col gap-1 rounded-control px-1 text-caption' })}
            >
              <ImagePlusIcon className="size-5" strokeWidth={1.75} aria-hidden="true" />
              {text.add}
            </button>
          </li>
        )}
      </ul>
      <input
        ref={input}
        type="file"
        accept={UPLOAD_ACCEPT}
        multiple
        hidden
        onChange={(event) => {
          images.add(Array.from(event.target.files ?? []))
          event.target.value = ''
        }}
      />
      <Problems items={images.items} overflow={images.overflow} text={text} />
      {keys.map((key) => (
        <input key={key} type="hidden" name="image" value={key} />
      ))}
    </div>
  )
}

function Thumb({ item, text, n, onRemove }: { item: PickedImage; text: ImagesText; n: number; onRemove(): void }) {
  return (
    <div className="relative size-20">
      {/* A local object URL of the picked file: next/image has nothing to optimise here. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.preview} alt="" className={cn('size-20 rounded-control object-cover shadow-[inset_0_0_0_1px_var(--border)]', item.status !== 'ready' && 'opacity-55')} />
      {item.status === 'uploading' ? (
        <span role="progressbar" aria-label={text.uploading} aria-valuenow={Math.round(item.progress * 100)} className="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-wash-strong">
          <span className="block h-full rounded-full bg-foreground transition-[width] motion-reduce:transition-none" style={{ width: `${Math.max(8, item.progress * 100)}%` }} />
        </span>
      ) : null}
      {item.status === 'failed' ? (
        <span className="absolute inset-0 grid place-items-center text-destructive">
          <CircleAlertIcon className="size-6" strokeWidth={2} aria-label={text.failed} />
        </span>
      ) : null}
      <button type="button" aria-label={text.remove(n)} onClick={onRemove} className="absolute -top-3 -right-3 grid size-11 place-items-center rounded-full">
        <span className="grid size-6 place-items-center rounded-full bg-foreground text-background shadow-raised">
          <XIcon className="size-3.5" strokeWidth={2.4} aria-hidden="true" />
        </span>
      </button>
    </div>
  )
}

// One line for what went wrong: the first failed upload's reason, or too many picked at once.
function Problems({ items, overflow, text }: { items: readonly PickedImage[]; overflow: boolean; text: ImagesText }) {
  const failed = items.find((item) => item.status === 'failed')
  if (!failed && !overflow) return null
  return (
    <p role="alert" className="text-caption text-destructive">
      {text.error(failed ? (failed.error ?? 'UPLOAD_FAILED') : 'TOO_MANY')}
    </p>
  )
}
