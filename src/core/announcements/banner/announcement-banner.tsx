import { getLocale, getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { bannerState } from '../banner-read'
// The plain module, never the 'use client' view: a value imported from a client module into this
// server component is a client reference, not the string (dismissal.ts).
import { HIDE_CLOSED_SCRIPT, HIDE_ENDED_SCRIPT } from '../rules/dismissal-scripts'
import type { BannerLocale } from '../rules'
import { BannerView, PathAwareBannerView } from './banner-view'

// Site-wide top banner (ARCHITECTURE §10) for the marketing and app layouts. The text comes
// from the table in the visitor's language; the read is cached under the announcements tag.
//
// HIDE_CLOSED_SCRIPT sits outside the boundary, so it is in the static shell ahead of the banner
// on every route and has added its hiding <style> before the banner's HTML is parsed: a closed
// banner never paints. Nothing here depends on the request, so marketing pages stay static.
//
// PathAwareBannerView reads usePathname. Keep its Suspense boundary on surfaces with paths
// that exclude the banner (admin and checkout); usePathname can suspend during prerender.
// Every marketing route accepts the banner, so it can go in the shell before the header.
export async function AnnouncementBanner({ checkPath = true }: { checkPath?: boolean } = {}) {
  const locale: BannerLocale = (await getLocale()) === 'zh' ? 'zh' : 'en'
  const [state, t] = await Promise.all([bannerState(locale), getTranslations('announcement')])
  if (state.items.length === 0) return null
  const View = checkPath ? PathAwareBannerView : BannerView
  const banner = (
    <>
      <View items={state.items} initialId={state.initialId} dismissLabel={t('dismiss')} />
      <script dangerouslySetInnerHTML={{ __html: HIDE_ENDED_SCRIPT }} />
    </>
  )
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: HIDE_CLOSED_SCRIPT }} />
      {checkPath ? <Suspense fallback={null}>{banner}</Suspense> : banner}
    </>
  )
}
