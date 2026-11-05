'use client'

import { buttonVariants } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'

import { useShareFile } from './use-share-file'

// Share (DESIGN §4.4, MOBILE_UI_rules §1.8.1): the system share sheet where the browser can
// hand files to the OS (save to Photos, WhatsApp, Instagram…), otherwise a download link with
// "Long-press to save" for in-app browsers. text carries one line and a utm link; apps that
// cannot take text drop it on their own.
export function ShareButton({ fileUrl, name, shareText }: { fileUrl: string; name: string; shareText: string }) {
  const mode = useShareFile(fileUrl, name)
  const primary = buttonVariants({ variant: 'cta', size: 'cta' })
  if (mode.kind === 'share') {
    const share = () => {
      // Called straight from the tap, no await before it (rule 1).
      navigator
        .share({ files: [mode.file], title: name, text: shareText })
        .catch(() => undefined)
    }
    return (
      <button type="button" onClick={share} className={primary}>
        <ShareIcon />
        Share
      </button>
    )
  }
  return (
    <>
      <a href={`${fileUrl}?download=1`} download aria-disabled={mode.kind === 'loading'} className={cn(primary, mode.kind === 'loading' && 'pointer-events-none')}>
        Download
      </a>
      <p className="mt-2 text-center text-caption text-muted-foreground">Long-press to save</p>
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
