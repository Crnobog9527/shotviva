'use client'

import { ImageDownIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { buttonVariants } from '@/core/ui/button'

import { handPhotoToSystem, type ShareMode } from './share-mode'

export function IphonePhotoActions({ mode, fileUrl }: { mode: ShareMode; fileUrl: string }) {
  const t = useTranslations('app.result')
  const [unavailable, setUnavailable] = useState(false)
  const [sharing, setSharing] = useState(false)
  const fallback = mode.kind === 'download' || unavailable
  const primary = buttonVariants({ variant: 'cta', size: 'cta' })
  async function saveToPhotos() {
    if (mode.kind !== 'share' || sharing) return
    setSharing(true)
    const result = await handPhotoToSystem(navigator, mode.file)
    setUnavailable(result === 'unavailable')
    setSharing(false)
  }
  return (
    <div className="grid gap-1 text-center">
      {fallback ? (
        <a href={fileUrl} target="_blank" rel="noopener" className={primary}><ImageDownIcon />{t('openPhoto')}</a>
      ) : (
        <button
          type="button"
          className={primary}
          disabled={mode.kind === 'loading' || sharing}
          onClick={saveToPhotos}
        >
          <ImageDownIcon />{t(mode.kind === 'loading' ? 'preparingPhoto' : 'saveToPhotos')}
        </button>
      )}
      <p className="text-caption text-muted-foreground">{t(fallback ? 'holdPhotoHint' : 'saveToPhotosHint')}</p>
      <a href={`${fileUrl}?download=1`} download className="mx-auto inline-flex min-h-11 items-center px-3 text-label underline underline-offset-4">
        {t('downloadToFiles')}
      </a>
    </div>
  )
}
