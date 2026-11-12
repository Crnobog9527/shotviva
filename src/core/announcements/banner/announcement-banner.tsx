import { getLocale, getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { bannerState } from '../banner-read'
// The plain module, never the 'use client' view: a value imported from a client module into this
// server component is a client reference, not the string (dismissal.ts).
import { HIDE_CLOSED_SCRIPT, HIDE_ENDED_SCRIPT } from '../rules/dismissal-scripts'
import type { BannerLocale } from '../rules'
import { BannerView } from './banner-view'

// Site-wide top banner (ARCHITECTURE §10) for the marketing and app layouts. The text comes
// from the table in the visitor's language; the read is cached under the announcements tag.
//
// HIDE_CLOSED_SCRIPT sits outside the boundary, so it is in the static shell ahead of the banner
// on every route and has added its hiding <style> before the banner's HTML is parsed: a closed
// banner never paints. Nothing here depends on the request, so marketing pages stay static.
//
// BannerView reads usePathname. Under cacheComponents that suspends on routes whose params are
// only known at request time (/photos/[jobId], /admin/users/[id]), and a suspending client hook
// outside a Suspense boundary fails the prerender. The boundary keeps the rest of the layout
// prerendered; on those routes the banner streams in with the request. The ended-check sits
// inside the same boundary so it runs right after the banner's HTML arrives.
export async function AnnouncementBanner() {
  const locale: BannerLocale = (await getLocale()) === 'zh' ? 'zh' : 'en'
  const [state, t] = await Promise.all([bannerState(locale), getTranslations('announcement')])
  if (state.items.length === 0) return null
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: HIDE_CLOSED_SCRIPT }} />
      <Suspense fallback={null}>
        <BannerView items={state.items} initialId={state.initialId} dismissLabel={t('dismiss')} />
        <script dangerouslySetInnerHTML={{ __html: HIDE_ENDED_SCRIPT }} />
      </Suspense>
    </>
  )
}
