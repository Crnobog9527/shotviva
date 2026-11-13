'use client'

import { useState, type ReactNode } from 'react'

import { coverImage } from '@/core/ui/cover-image'
import { cn } from '@/core/ui/cn'
import { Dialog, DialogContent, DialogTitle } from '@/core/ui/dialog'

import { previewCopy as copy } from './copy'

export type PreviewImage = { url: string; label?: string }

// A thumbnail that opens the large picture (Owner 2026-11-13): 原图 and AI 出图 side by side when the
// cover has both. Esc, the overlay, the close button or a click on a picture closes it.
export function PreviewThumb({ images, title, children }: { images: PreviewImage[]; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  if (!images.length) return <>{children}</>
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={copy.open(title)} title={copy.hint}
        className="focus-visible:ring-ring shrink-0 cursor-zoom-in rounded-md outline-none focus-visible:ring-2">
        {children}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby={undefined}
          className="max-h-[94vh] overflow-y-auto p-4 sm:max-w-[min(94vw,1400px)]">
          <DialogTitle className="pr-8 text-base">{title}</DialogTitle>
          <div className={cn('grid gap-3', images.length > 1 && 'sm:grid-cols-2')}>
            {images.map(image => (
              <figure key={image.label ?? image.url} className="grid cursor-zoom-out gap-1.5" onClick={() => setOpen(false)}>
                {/* eslint-disable-next-line @next/next/no-img-element -- coverImage() supplies the optimiser's srcset */}
                <img {...coverImage(image.url, images.length > 1 ? '(min-width: 640px) 47vw, 94vw' : '94vw')} alt={image.label ?? ''}
                  className="bg-muted max-h-[80vh] w-full rounded-md object-contain" />
                {image.label && <figcaption className="text-muted-foreground text-xs">{image.label}</figcaption>}
              </figure>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// 原图 first, as the site's cards show it; either may be missing.
export function beforeAfter(before: string | null | undefined, after: string | null | undefined): PreviewImage[] {
  return [
    ...(before ? [{ url: before, label: copy.before }] : []),
    ...(after ? [{ url: after, label: copy.after }] : []),
  ]
}
