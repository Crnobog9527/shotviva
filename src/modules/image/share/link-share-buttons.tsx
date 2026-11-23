'use client'

import { useEffect, useState } from 'react'

import { Button } from '@/core/ui/button'

import { copyText, shareLink } from './share-or-copy'

type Labels = { copy: string; copied: string; share: string; copiedHint: string; copyByHand: string }
type Props = { url: string; title: string; text: string; labels: Labels }

// 「复制链接」 and 「分享链接」 side by side under a made link (work and template collections).
// Share opens the system share sheet (WeChat and the other apps); with no sheet, or one that fails,
// the link is copied and a line says to paste it. Closing the sheet shows nothing.
export function LinkShareButtons({ url, title, text, labels }: Props) {
  const [copied, setCopied] = useState(false)
  const [hint, setHint] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2200)
    return () => window.clearTimeout(timer)
  }, [copied])
  const copy = async () => {
    if (await copyText(url)) return setCopied(true)
    window.prompt(labels.copyByHand, url)
  }
  const share = async () => {
    setHint(false)
    const outcome = await shareLink(url, { title, text })
    if (outcome === 'copied') setHint(true)
    if (outcome === 'failed') window.prompt(labels.copyByHand, url)
  }
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="glass" size="touch" onClick={() => void copy()}>
          <span aria-live="polite">{copied ? labels.copied : labels.copy}</span>
        </Button>
        <Button variant="glass" size="touch" onClick={() => void share()}>
          {labels.share}
        </Button>
      </div>
      <p role="status" className="min-h-5 text-center text-caption text-muted-foreground">{hint ? labels.copiedHint : null}</p>
    </div>
  )
}
