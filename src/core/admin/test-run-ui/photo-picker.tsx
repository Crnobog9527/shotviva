'use client'

import { ImagePlus, LoaderCircle } from 'lucide-react'
import { useState } from 'react'

import { buttonVariants } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'

import type { TestPhotoView } from '../test-runs'
import { AssetManager } from './asset-manager'
import { uploadTestPhoto } from './api'
import { TestThumbnail } from './test-thumbnail'
import { TEST_RUN_COPY as COPY } from './copy'
import { failureMessage } from './messages'

export const MAX_PICKED = 3

type Props = {
  // One image slot's picker (§5.1e): its own title, one photo at most, no asset manager.
  slot?: { label: string }
  photos: readonly TestPhotoView[]
  picked: readonly string[]
  onPick: (ids: string[]) => void
  onUploaded: () => void
  onNotice: (notice: string) => void
  onError: (message: string) => void
}

const ACCEPT = 'image/jpeg,image/png,image/webp'

function toggle(picked: readonly string[], id: string, max = MAX_PICKED): string[] {
  if (picked.includes(id)) return picked.filter((other) => other !== id)
  return picked.length >= max ? [...picked.slice(picked.length - max + 1), id] : [...picked, id]
}

// 测试照片 (ARCHITECTURE §10.b): upload a new one (picked at once) or tick up to three of the
// recently used ones. The order ticked is the order the runs start in.
export function PhotoPicker({ slot, photos, picked, onPick, onUploaded, onError, onNotice }: Props) {
  const max = slot ? 1 : MAX_PICKED
  const [progress, setProgress] = useState<number | null>(null)
  const upload = async (file: File) => {
    setProgress(0)
    try {
      const photo = await uploadTestPhoto(file, setProgress)
      onUploaded()
      onPick(toggle(picked, photo.id, max))
    } catch (error) {
      onError(failureMessage(error))
    } finally {
      setProgress(null)
    }
  }
  return (
    <fieldset className="grid min-w-0 gap-2">
      <legend className="text-sm font-medium">{slot ? slot.label : COPY.first.photos}</legend>
      <p className="text-muted-foreground text-xs">{slot ? COPY.first.slotHint : COPY.first.photosHint}</p>
      <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6" aria-label={COPY.first.recent}>
        <li>
          <UploadTile progress={progress} onFile={upload} />
        </li>
        {photos.map((photo) => (
          <li key={photo.id}>
            <PhotoTile photo={photo} order={picked.indexOf(photo.id)} onToggle={() => onPick(toggle(picked, photo.id, max))} />
          </li>
        ))}
      </ul>
      {photos.length === 0 ? <p className="text-muted-foreground text-xs">{COPY.first.noRecent}</p> : null}
      {slot ? null : <AssetManager kind="photo" onRemoved={ids => { onPick(picked.filter(id => !ids.includes(id))); onUploaded() }} onError={onError} onNotice={onNotice} />}
    </fieldset>
  )
}

function UploadTile({ progress, onFile }: { progress: number | null; onFile: (file: File) => void }) {
  const busy = progress !== null
  return (
    <label className={cn(buttonVariants({ variant: 'outline' }), 'aspect-square h-auto w-full flex-col gap-1 text-xs', busy && 'pointer-events-none opacity-70')}>
      <input
        type="file"
        accept={ACCEPT}
        className="sr-only"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) onFile(file)
        }}
      />
      {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />}
      {busy ? `${Math.round(progress * 100)}%` : COPY.first.upload}
    </label>
  )
}

function PhotoTile({ photo, order, onToggle }: { photo: TestPhotoView; order: number; onToggle: () => void }) {
  const on = order >= 0
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={cn('bg-muted relative block aspect-square w-full overflow-hidden rounded-md border-2', on ? 'border-primary' : 'border-transparent')}
    >
      {/* Admin-only signed URL of a private test photo; next/image cannot fetch it. */}
      <TestThumbnail kind="photo" id={photo.id} src={photo.url} originalUrl={photo.originalUrl} thumbnailMissing={photo.thumbnailMissing} alt="" className="h-full w-full object-cover" />
      {on ? (
        <span className="bg-primary text-primary-foreground absolute top-1 right-1 flex size-5 items-center justify-center rounded-full text-[11px] font-semibold">
          {order + 1}
        </span>
      ) : null}
      <span className="sr-only">{on ? COPY.first.picked(order + 1) : COPY.first.pick}</span>
    </button>
  )
}
