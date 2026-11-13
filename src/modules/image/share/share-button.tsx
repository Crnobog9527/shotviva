'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { track } from '@/core/analytics/browser'
import { categorySlug } from '@/core/analytics/event-values'
import { newShareId, sharePath } from '@/core/analytics/share-link'
import { localizePath } from '@/core/i18n'
import type { Locale } from '@/core/i18n/locales'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'

type Props = { template: Pick<CatalogueTemplate, 'id' | 'name' | 'category'> }

// 「分享」 in the creation dialog (Owner 2026-11-13): a public link to the template's share page.
// On a touch screen with a share sheet it opens that sheet; otherwise (or when the sheet is not
// there) the link is copied and the button says so for a moment. Each press is a new share id.
export function ShareButton({ template }: Props) {
  const t = useTranslations('app.share')
  const locale = useLocale() as Locale
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2200)
    return () => window.clearTimeout(timer)
  }, [copied])
  const share = async () => {
    const shareId = newShareId()
    const url = `${window.location.origin}${localizePath(sharePath(template.id, shareId), locale)}`
    const sent = (method: 'copy' | 'native') => track('template_share', { template_id: template.id, category: categorySlug(template.category), method, share_id: shareId })
    const outcome = await shareOrCopy(url, { title: template.name, text: t('text', { name: template.name }) })
    if (outcome === 'cancelled') return
    // No clipboard at all: show the link so it can be copied by hand.
    if (outcome === 'failed') return void window.prompt(t('copyByHand'), url)
    if (outcome === 'copied') setCopied(true)
    sent(outcome === 'shared' ? 'native' : 'copy')
  }
  return (
    <button
      type="button"
      onClick={() => void share()}
      className="press hairline inline-flex min-h-9 items-center gap-1.5 rounded-full bg-wash px-4 text-caption font-medium text-foreground hover:bg-wash-strong"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
      </svg>
      <span aria-live="polite">{copied ? t('copied') : t('button')}</span>
    </button>
  )
}

type Outcome = 'shared' | 'copied' | 'cancelled' | 'failed'

// The phone's share sheet where there is one and the screen is a touch screen (a desktop
// browser's share dialog is less useful than a copied link); a cancelled sheet does nothing.
async function shareOrCopy(url: string, data: { title: string; text: string }): Promise<Outcome> {
  const touch = window.matchMedia('(pointer: coarse)').matches
  if (touch && typeof navigator.share === 'function') {
    try {
      await navigator.share({ ...data, url })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    }
  }
  return (await copyText(url)) ? 'copied' : 'failed'
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    // Older WebViews (WeChat) without the async clipboard: a hidden field and the copy command.
    const field = document.createElement('textarea')
    field.value = value
    field.setAttribute('readonly', '')
    field.style.cssText = 'position:fixed;opacity:0'
    document.body.append(field)
    field.select()
    const ok = document.execCommand('copy')
    field.remove()
    return ok
  }
}
