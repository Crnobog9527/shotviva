'use client'

import { ImageDownIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'

import { REPLAY_BLOCK_CLASS } from '@/core/analytics/browser'
import { buttonVariants } from '@/core/ui/button'
import { ResponsiveSheet } from '@/core/ui/responsive-sheet'

import { GroundedImg } from './grounded-img'
import { handPhotoToSystem, type ShareMode } from './share-mode'

// onSaved: the share sheet closed (T107 watermark moment; the OS does not say whether it saved).
// hold: where this is not an iPhone (a phone whose browser cannot share files). hint: what the
// long press is called there (its menu says 保存图片, not 存储图像). shown: the full-size photo
// loaded in the sheet, which stands for the download that phone used to get: the caller notes
// it, and onSaved follows when the sheet closes (after the long press, never over it).
export type HoldSave = { hint: string; shown(): void }

export function IosPhotoActions({ mode, fileUrl, onSaved, hold }: { mode: ShareMode; fileUrl: string; onSaved?(): void; hold?: HoldSave }) {
  const t = useTranslations('app.result')
  const [unavailable, setUnavailable] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [showPhoto, setShowPhoto] = useState(false)
  const fallback = mode.kind === 'download' || unavailable
  const hint = hold?.hint ?? t('holdPhotoHint')
  const shown = useRef(false)
  const closeSheet = (open: boolean) => {
    setShowPhoto(open)
    if (!open && hold && shown.current) onSaved?.()
  }
  const photoShown = () => {
    shown.current = true
    hold?.shown()
  }

  async function saveToPhotos() {
    if (fallback) return setShowPhoto(true)
    if (mode.kind !== 'share' || sharing) return
    setSharing(true)
    const result = await handPhotoToSystem(navigator, mode.file)
    setSharing(false)
    if (result === 'unavailable') {
      setUnavailable(true)
      setShowPhoto(true)
    } else onSaved?.()
  }

  return (
    <div className="grid gap-1 text-center">
      <button type="button" className={buttonVariants({ variant: 'cta', size: 'cta' })} disabled={mode.kind === 'loading' || sharing} onClick={saveToPhotos}>
        <ImageDownIcon />{t(mode.kind === 'loading' ? 'preparingPhoto' : 'saveToPhotos')}
      </button>
      <p className="text-caption text-muted-foreground">{fallback ? hint : t('saveToPhotosHint')}</p>
      {showPhoto ? (
        <ResponsiveSheet open onOpenChange={closeSheet} title={t('saveToPhotos')} description={hint}>
          <GroundedImg src={fileUrl} alt={t('views.result')} onLoad={photoShown} data-vaul-no-drag="" className={`${REPLAY_BLOCK_CLASS} mt-4 block max-h-[65dvh] w-full object-contain`} />
        </ResponsiveSheet>
      ) : null}
    </div>
  )
}
