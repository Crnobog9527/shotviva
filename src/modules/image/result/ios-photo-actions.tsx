'use client'

import { ImageDownIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { REPLAY_BLOCK_CLASS } from '@/core/analytics/browser'
import { buttonVariants } from '@/core/ui/button'
import { ResponsiveSheet } from '@/core/ui/responsive-sheet'

import { GroundedImg } from './grounded-img'
import { handPhotoToSystem, type ShareMode } from './share-mode'

// onSaved: the share sheet closed (T107 watermark moment; the OS does not say whether it saved).
export function IosPhotoActions({ mode, fileUrl, onSaved }: { mode: ShareMode; fileUrl: string; onSaved?(): void }) {
  const t = useTranslations('app.result')
  const [unavailable, setUnavailable] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [showPhoto, setShowPhoto] = useState(false)
  const fallback = mode.kind === 'download' || unavailable

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
      <p className="text-caption text-muted-foreground">{t(fallback ? 'holdPhotoHint' : 'saveToPhotosHint')}</p>
      {showPhoto ? (
        <ResponsiveSheet open onOpenChange={setShowPhoto} title={t('saveToPhotos')} description={t('holdPhotoHint')}>
          <GroundedImg src={fileUrl} alt={t('views.result')} data-vaul-no-drag="" className={`${REPLAY_BLOCK_CLASS} mt-4 block max-h-[65dvh] w-full object-contain`} />
        </ResponsiveSheet>
      ) : null}
    </div>
  )
}
