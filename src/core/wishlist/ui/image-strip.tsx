'use client'

/* eslint-disable @next/next/no-img-element -- short-lived signed R2 URLs, not optimisable */
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Dialog, DialogContent, DialogTitle } from '../../ui/dialog'

// Reference photos on a card (DESIGN §4.7): one fills the width, several scroll sideways.
// A tap opens the photo full screen; long-press does nothing (§8.3).
export function ImageStrip({ urls }: { urls: readonly string[] }) {
  const t = useTranslations('app.wishlist')
  const [open, setOpen] = useState<number | null>(null)
  if (urls.length === 0) return null
  const alt = (index: number) => t('imageAlt', { index: index + 1, count: urls.length })
  return (
    <>
      <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1">
        {urls.map((url, index) => (
          <button
            key={url}
            type="button"
            onClick={() => setOpen(index)}
            className={`press relative aspect-[4/5] flex-none snap-start overflow-hidden rounded-inner bg-muted ${urls.length === 1 ? 'w-full' : 'w-[78%]'}`}
          >
            <img src={url} alt={alt(index)} className="size-full object-cover" loading="lazy" />
          </button>
        ))}
      </div>
      <Dialog open={open !== null} onOpenChange={(value) => !value && setOpen(null)}>
        <DialogContent className="max-w-[min(92vw,720px)] border-none bg-black p-0">
          <DialogTitle className="sr-only">{open === null ? '' : alt(open)}</DialogTitle>
          {open !== null && <img src={urls[open]} alt={alt(open)} className="max-h-[85dvh] w-full rounded-media object-contain" />}
        </DialogContent>
      </Dialog>
    </>
  )
}
