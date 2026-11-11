'use client'

import { useTranslations } from 'next-intl'
import { useSyncExternalStore } from 'react'

import { buttonVariants } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'

import { monoTag, sizeTag } from '../workspace/result-panel'
import { IosPhotoActions } from './ios-photo-actions'
import { useWatermarkMoment } from './use-watermark-moment'
import { useShareFile } from './use-share-file'
import { isIosBrowser } from './ios-browser'

// watermarked: a free work; saving it is the moment the paywall opens on Starter (T107).
export type ResultActionProps = { fileUrl: string; name: string; shareText: string; px?: number; watermarked?: boolean }

const subscribe = () => () => {}
const onIos = () => isIosBrowser(navigator)
const serverSnapshot = () => false

export default function ResultActions({ fileUrl, name, shareText, px, watermarked = false }: ResultActionProps) {
  const t = useTranslations('app.result')
  const saved = useWatermarkMoment(watermarked)
  const mode = useShareFile(fileUrl, name)
  const ios = useSyncExternalStore(subscribe, onIos, serverSnapshot)
  if (ios) return <IosPhotoActions mode={mode} fileUrl={fileUrl} onSaved={saved} />
  const primary = buttonVariants({ variant: 'cta', size: 'cta', className: 'gap-2' })
  const download = (className?: string) => (
    <a href={mode.kind === 'loading' ? undefined : `${fileUrl}?download=1`} download onClick={saved} aria-disabled={mode.kind === 'loading'} className={cn(primary, mode.kind === 'loading' && 'pointer-events-none', className)}>
      <DownloadIcon />
      <span>{px ? t.rich('downloadPx', { px, cost: sizeTag, mono: monoTag }) : t('download')}</span>
    </a>
  )
  if (mode.kind === 'share') {
    const share = () => {
      // Called straight from the tap, no await before it (rule 1).
      navigator
        .share({ files: [mode.file], title: name, text: shareText })
        .then(saved, () => undefined)
    }
    return (
      <>
        <div className="flex gap-2">
          {download('min-w-0 flex-1')}
          <button
            type="button"
            onClick={share}
            aria-label={t('share')}
            className={cn(buttonVariants({ variant: 'glass', size: 'cta' }), 'aspect-square rounded-tile px-0 lg:hidden')}
          >
            <ShareIcon />
          </button>
        </div>
        <p className="mt-2 text-center text-caption text-muted-foreground lg:hidden">{t('photosHint')}</p>
      </>
    )
  }
  return (
    <>
      {download()}
      <p className="mt-2 text-center text-caption text-muted-foreground lg:hidden">{t('longPress')}</p>
    </>
  )
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.5v11M8 7.5l4-4 4 4" />
      <path d="M7 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 flex-none" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15" />
    </svg>
  )
}
