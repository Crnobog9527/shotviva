'use client'

import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'
import { useState, useSyncExternalStore } from 'react'

import { buttonVariants } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'

import { monoTag, sizeTag } from '../workspace/result-panel'
import { fileHref, pairHref, shareSource, type WorkFile } from './download-background'
import { IosPhotoActions } from './ios-photo-actions'
import { useCutOutChoice } from './use-download-background'
import type { ShareMode } from './share-mode'
import { useShareFile } from './use-share-file'
import { useWatermarkMoment } from './use-watermark-moment'
import { isIosBrowser } from './ios-browser'
import { noteSaved } from '../work-share/album-save'
import type { CreateShareAction } from '../work-share/share-types'
import { shareChoice } from './share-choice'

// The Photos link dialog (作品集分享), loaded on the first tap that needs it.
const CreateShareSheet = dynamic(() => import('../work-share/create-share-sheet').then((mod) => mod.CreateShareSheet), { ssr: false })

// work: the result's pool and cut-out record, for the 白底 / 透明 choice (absent: no choice).
// watermarked: a free work; saving it is the moment the paywall opens on Starter (T107).
// link: this work's id and the Photos 作品集分享 action, so 「分享」 is always there and falls back
// to a share link (same server checks and watermark rules as Photos) where the file can't be shared.
export type ResultActionProps = { fileUrl: string; name: string; shareText: string; px?: number; work?: WorkFile; watermarked?: boolean; link?: ShareLink }
export type ShareLink = { jobId: string; create: CreateShareAction }

const subscribe = () => () => {}
const onIos = () => isIosBrowser(navigator)
const serverSnapshot = () => false
const onTouch = () => window.matchMedia('(pointer: coarse)').matches

// Phones where the primary is 存入相册 and not a download. An iPhone always. Any other phone
// whose browser cannot hand the file to the share sheet (Huawei's browser, WeChat): a download
// there lands in a Download folder the gallery never shows, so the primary opens the photo full
// size for a long press, as the iPhone's fallback does.
function useHoldToSave(mode: ShareMode): { hold: boolean; ios: boolean } {
  const ios = useSyncExternalStore(subscribe, onIos, serverSnapshot)
  const touch = useSyncExternalStore(subscribe, onTouch, serverSnapshot)
  return { hold: ios || (touch && mode.kind === 'download'), ios }
}

const LABEL = { white: 'downloadWhite', transparent: 'downloadTransparent' } as const
const LABEL_PX = { white: 'downloadWhitePx', transparent: 'downloadTransparentPx' } as const

// A cut-out's 白底 / 透明 is picked on the photo's chips (white by default, then the last pick);
// the primary names and saves that file, Share and the iPhone fallback photo follow it, and
// 「下载白底 + 透明图」 under it saves both as one ZIP. The routes record one download per click
// whichever file they serve.
export default function ResultActions({ fileUrl, name, shareText, px, work, watermarked = false, link }: ResultActionProps) {
  const t = useTranslations('app.result')
  const saved = useWatermarkMoment(watermarked)
  const [background] = useCutOutChoice(fileUrl, work)
  const mode = useShareFile(shareSource(fileUrl, work, background), name, background === 'transparent')
  const phone = useHoldToSave(mode)
  // One ZIP, not two downloads: iOS Safari saves only the first file of a tap and Android Chrome
  // asks before a second, so one file is what lands on every phone.
  const pair = background ? (
    <a href={pairHref(fileUrl)} download onClick={saved} className={buttonVariants({ variant: 'glass', size: 'touch', className: 'gap-2' })}>
      <PairIcon />
      {t('downloadBoth')}
    </a>
  ) : null
  if (phone.hold) return <div className="grid gap-2"><IosPhotoActions mode={mode} fileUrl={fileHref(fileUrl, background, false)} onSaved={saved} hold={phone.ios ? undefined : { hint: t('holdToAlbumHint'), shown: () => noteSaved(fileUrl) }} />{pair}{link ? <ShareAction mode={mode} link={link} name={name} shareText={shareText} onShared={saved} block /> : null}</div>
  const label = () => {
    if (px) return t.rich(background ? LABEL_PX[background] : 'downloadPx', { px, cost: sizeTag, mono: monoTag })
    return t(background ? LABEL[background] : 'download')
  }
  const primary = buttonVariants({ variant: 'cta', size: 'cta', className: 'gap-2' })
  const download = (className?: string) => (
    <a href={mode.kind === 'loading' ? undefined : fileHref(fileUrl, background, true)} download onClick={saved} aria-disabled={mode.kind === 'loading'} className={cn(primary, mode.kind === 'loading' && 'pointer-events-none', className)}>
      <DownloadIcon />
      <span>{label()}</span>
    </a>
  )
  return (
    <>
      {mode.kind === 'share' || link ? (
        <div className="flex gap-2">
          {download('min-w-0 flex-1')}
          <ShareAction mode={mode} link={link} name={name} shareText={shareText} onShared={saved} />
        </div>
      ) : (
        download()
      )}
      {pair ? <div className="mt-2 grid">{pair}</div> : null}
      <p className="mt-2 text-center text-caption text-muted-foreground lg:hidden">{t(mode.kind === 'share' ? 'photosHint' : 'longPress')}</p>
    </>
  )
}

type ShareActionProps = { mode: ShareMode; link?: ShareLink; name: string; shareText: string; onShared(): void; block?: boolean }

// Secondary beside the primary: an icon and 「分享」 when a link can be made (every browser, from
// lg too); the icon alone, phones only, when only the file can be shared. block: the iPhone's
// full-width button under 存入相册, which already hands the file over, so it makes the link.
function ShareAction({ mode, link, name, shareText, onShared, block = false }: ShareActionProps) {
  const t = useTranslations('app.result')
  const [linkOpen, setLinkOpen] = useState(false)
  const fileReady = !block && mode.kind === 'share'
  const share = () => {
    const touch = window.matchMedia('(pointer: coarse)').matches
    if (shareChoice({ fileReady, touch, link: !!link }) === 'link') return setLinkOpen(true)
    if (mode.kind !== 'share') return
    // Called straight from the tap, no await before it (rule 1).
    navigator.share({ files: [mode.file], title: name, text: shareText }).then(onShared, () => undefined)
  }
  const shape = block
    ? buttonVariants({ variant: 'glass', size: 'touch', className: 'gap-2' })
    : cn(buttonVariants({ variant: 'glass', size: 'cta' }), link ? 'flex-none gap-2 rounded-tile px-5' : 'aspect-square rounded-tile px-0 lg:hidden')
  return (
    <>
      <button type="button" onClick={share} aria-label={link ? undefined : t('share')} className={shape}>
        <ShareIcon />
        {link ? <span>{t('share')}</span> : null}
      </button>
      {link && linkOpen ? <CreateShareSheet open onOpenChange={setLinkOpen} jobIds={[link.jobId]} create={link.create} onDone={() => undefined} /> : null}
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

function PairIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px] flex-none text-primary" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="6.5" width="11" height="11" rx="2" />
      <path d="M9.5 3.5h9a2 2 0 0 1 2 2v9" />
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
