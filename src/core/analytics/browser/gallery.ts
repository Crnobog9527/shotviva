'use client'

import { publicEnv } from '../../public-env'
import type { EventProps } from '../events'
import { track } from './client'

// The gallery's events (ARCHITECTURE §16.2, T108) count real visitors only: never on the test site
// or a preview, never from an admin or QA account (the signed-in layout marks those browsers
// with the sv_staff cookie, AnalyticsIdentify).
export const STAFF_COOKIE = 'sv_staff'

export function isStaffBrowser(cookie: string = document.cookie): boolean {
  return cookie.split(';').some((part) => part.trim() === `${STAFF_COOKIE}=1`)
}

type GalleryEvent = 'gallery_view' | 'gallery_work_view' | 'gallery_reuse'

export function trackGallery<E extends GalleryEvent>(event: E, props: EventProps<E>): void {
  if (publicEnv.NEXT_PUBLIC_VERCEL_ENV !== 'production' || isStaffBrowser()) return
  track(event, props)
}
