'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { Button } from '@/core/ui/button'

import { shareOrCopy } from '../share/share-or-copy'

type Props = { url: string; title: string; primary?: boolean }

// A made link: shown in full (selectable), and sent through the phone's share sheet or copied.
export function ShareLinkActions({ url, title, primary = true }: Props) {
  const t = useTranslations('app.templateShare')
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2200)
    return () => window.clearTimeout(timer)
  }, [copied])
  const send = async () => {
    const outcome = await shareOrCopy(url, { title, text: t('sendText', { title }) })
    if (outcome === 'failed') return void window.prompt(t('copyByHand'), url)
    if (outcome === 'copied') setCopied(true)
  }
  return (
    <div className="grid gap-3">
      <input readOnly value={url} aria-label={t('linkLabel')} onFocus={(event) => event.currentTarget.select()}
        className="hairline h-12 w-full rounded-control bg-wash-faint px-4 text-caption text-bone-dim" />
      <Button variant={primary ? 'cta' : 'glass'} size={primary ? 'cta' : 'touch'} onClick={() => void send()}>
        <span aria-live="polite">{copied ? t('copied') : t('send')}</span>
      </Button>
    </div>
  )
}
