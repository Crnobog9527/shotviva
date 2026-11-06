'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useRef, type DragEvent } from 'react'

import { UPLOAD_ACCEPT } from '@/core/storage/rules'
import { cn } from '@/core/ui/cn'

import { UPLOAD_FORMAT_NAMES, UPLOAD_MAX_MB } from './upload-formats'

// Upload zone, empty (DESIGN §4.3 step 1, "Upload Zone"): a 16:9 hatched recess that also
// takes dropped files on desktop, then two entries. "Take photo" opens the camera (capture),
// "Choose from gallery" the library (no capture). No HEIC in accept: iOS converts to JPEG.
// `multiple` (Pro and Max, T28) lets the gallery pick a batch; the camera always takes one.
// Every picked file goes to onPick; the caller decides how many fit.
export function PhotoPickers({ onPick, multiple = false }: { onPick(files: File[]): void; multiple?: boolean }) {
  const t = useTranslations('app.workspace')
  const formats = t('formats', { formats: useFormatter().list(UPLOAD_FORMAT_NAMES, { type: 'disjunction' }), mb: UPLOAD_MAX_MB })
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    const files = Array.from(event.dataTransfer.files)
    if (files.length) onPick(files)
  }
  const take = (input: HTMLInputElement | null) => {
    const files = Array.from(input?.files ?? [])
    if (files.length) onPick(files)
    if (input) input.value = ''
  }
  return (
    <div className="hairline-lit rounded-panel bg-card p-3">
      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
        className="grid aspect-video place-content-center md:aspect-[5/2] justify-items-center gap-2 rounded-button bg-[repeating-linear-gradient(135deg,var(--hatch)_0_8px,transparent_8px_16px),var(--recess)] text-center shadow-[inset_0_0_0_1px_var(--recess-edge)]"
      >
        <b className="text-body leading-[1.2] font-semibold">{t(multiple ? 'addPhotos' : 'addPhoto')}</b>
        <span className="text-caption text-muted-foreground">{formats}</span>
      </div>
      <div className="mt-3 grid gap-2">
        <PickButton label={t('takePhoto')} icon="camera" filled onClick={() => camera.current?.click()} />
        <PickButton label={t(multiple ? 'chooseGalleryMany' : 'chooseGallery')} icon="gallery" onClick={() => gallery.current?.click()} />
      </div>
      <input ref={camera} type="file" accept={UPLOAD_ACCEPT} capture="environment" hidden onChange={(e) => take(e.currentTarget)} />
      <input ref={gallery} type="file" accept={UPLOAD_ACCEPT} multiple={multiple} hidden onChange={(e) => take(e.currentTarget)} />
    </div>
  )
}

export const ICONS = {
  camera: (
    <>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.5-2h5L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </>
  ),
  gallery: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <path d="M3.5 15l4.5-4.5 4.5 4.5 2.5-2.5 5.5 5.5" />
      <circle cx="15.5" cy="9" r="1.5" />
    </>
  ),
}

function PickButton({ label, icon, filled, onClick }: { label: string; icon: keyof typeof ICONS; filled?: boolean; onClick(): void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'press inline-flex min-h-12 items-center justify-center gap-2 rounded-button px-3 py-2 text-center text-body leading-tight font-semibold',
        filled ? 'bg-foreground text-background' : 'hairline bg-wash text-foreground',
      )}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        {ICONS[icon]}
      </svg>
      {label}
    </button>
  )
}
