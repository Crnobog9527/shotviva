'use client'

/* eslint-disable @next/next/no-img-element -- short-lived signed R2 URLs, not optimisable */
import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'

import { REPLAY_BLOCK_CLASS } from '../../analytics/browser'
import { Dialog, DialogContent, DialogTitle } from '../../ui/dialog'
import { StackIcon } from './icons'

// The reference photos on a print (B comp wishlist.html .refs): one fills the width, more scroll
// sideways with a count in the corner. A tap opens the photo full screen; long-press does
// nothing (DESIGN §8.3).
export function ImageStrip({ urls }: { urls: readonly string[] }) {
  const t = useTranslations('app.wishlist')
  const format = useFormatter()
  const [open, setOpen] = useState<number | null>(null)
  if (urls.length === 0) return null
  const alt = (index: number) => t('imageAlt', { index: index + 1, count: urls.length })
  return (
    <>
      <div className="wl-refs">
        {urls.map((url, index) => (
          <button key={url} type="button" onClick={() => setOpen(index)} aria-label={alt(index)} className="press">
            <img className={REPLAY_BLOCK_CLASS} src={url} alt="" loading="lazy" />
          </button>
        ))}
        {urls.length > 1 && (
          <span className="wl-count" aria-hidden="true">
            <StackIcon />
            {format.number(urls.length)}
          </span>
        )}
      </div>
      <Dialog open={open !== null} onOpenChange={(value) => !value && setOpen(null)}>
        <DialogContent className="max-w-[min(92vw,720px)] border-none bg-photo-ground p-0">
          <DialogTitle className="sr-only">{open === null ? '' : alt(open)}</DialogTitle>
          {open !== null && <img src={urls[open]} alt={alt(open)} className={`${REPLAY_BLOCK_CLASS} max-h-[85dvh] w-full rounded-media object-contain`} />}
        </DialogContent>
      </Dialog>
    </>
  )
}
