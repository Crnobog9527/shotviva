import { getLocale, getTranslations } from 'next-intl/server'

import { bannerState } from '../banner-read'
import { DISMISS_STORAGE_KEY } from '../rules'
import type { BannerLocale } from '../rules'
import { BANNER_ELEMENT_ID, BannerView } from './banner-view'

// Runs while the HTML is parsed, before hydration, so a visitor who dismissed this id, or a
// banner that ended after the cached HTML was made, never flashes. Constant text: values are
// read from the DOM, nothing is interpolated.
const HIDE_EARLY = `try{var e=document.getElementById(${JSON.stringify(BANNER_ELEMENT_ID)});if(e){var t=e.getAttribute('data-ends-at');if(localStorage.getItem(${JSON.stringify(DISMISS_STORAGE_KEY)})===e.getAttribute('data-announcement')||(t&&Date.parse(t)<=Date.now()))e.hidden=true}}catch(_){}`

// Site-wide top banner (ARCHITECTURE §10) for the marketing and app layouts. The text comes
// from the table in the visitor's language; the read is cached under the announcements tag.
export async function AnnouncementBanner() {
  const locale: BannerLocale = (await getLocale()) === 'zh' ? 'zh' : 'en'
  const [state, t] = await Promise.all([bannerState(locale), getTranslations('announcement')])
  if (state.items.length === 0) return null
  return (
    <>
      <BannerView items={state.items} initialId={state.initialId} dismissLabel={t('dismiss')} />
      <script dangerouslySetInnerHTML={{ __html: HIDE_EARLY }} />
    </>
  )
}
