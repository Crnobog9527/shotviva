'use client'

import { useTranslations } from 'next-intl'

import { buttonVariants } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'

import { monoTag, sizeTag } from '../workspace/result-panel'
import { useShareFile } from './use-share-file'

type Props = { fileUrl: string; name: string; shareText: string; px?: number }

// Share (DESIGN §4.4, MOBILE_UI_rules §1.8.1): the system share sheet where the browser can
// hand files to the OS (save to Photos, WhatsApp, Instagram…), otherwise a download link with
// "Long-press to save" for in-app browsers. text carries one line and a utm link; apps that
// cannot take text drop it on their own. From lg up it is always Download (B comp
// workspace.html, photo.html: "Download · 1024 px" with `px`); a desktop share sheet is not
// where a file is saved.
export function ShareButton({ fileUrl, name, shareText, px }: Props) {
  const t = useTranslations('app.result')
  const mode = useShareFile(fileUrl, name)
  const primary = buttonVariants({ variant: 'cta', size: 'cta', className: 'gap-2' })
  const download = (className?: string) => (
    <a href={`${fileUrl}?download=1`} download aria-disabled={mode.kind === 'loading'} className={cn(primary, mode.kind === 'loading' && 'pointer-events-none', className)}>
      <DownloadIcon />
      <span>{px ? t.rich('downloadPx', { px, cost: sizeTag, mono: monoTag }) : t('download')}</span>
    </a>
  )
  if (mode.kind === 'share') {
    const share = () => {
      // Called straight from the tap, no await before it (rule 1).
      navigator
        .share({ files: [mode.file], title: name, text: shareText })
        .catch(() => undefined)
    }
    return (
      <>
        <button type="button" onClick={share} className={cn(primary, 'lg:hidden')}>
          <ShareIcon />
          {t('share')}
        </button>
        {download('max-lg:hidden')}
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
