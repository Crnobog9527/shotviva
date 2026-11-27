import type { FeatureSetting } from '../features/types'
import type { WishlistSwitch } from '../system-settings/types'
import { FEATURES_COPY as COPY } from './copy'
import { AUTO_APPROVE_SWITCH_COPY, GALLERY_SWITCH_COPY } from './gallery-copy'
import { FOOD_TOGGLES_SWITCH_COPY } from './food-toggles-card'
import { POSTER_PHOTO_COPY } from './poster-photo-card'
import { SIGNUP_GIFT_PAUSE_COPY } from './signup-gift-copy'
import { APP_SHELL_SWITCH_COPY, SERVICE_WORKER_SWITCH_COPY } from './service-worker-card'
import type { SwitchCopy } from './switch-copy'
import { WISHLIST_SWITCH_COPY } from './wishlist-copy'

// One row of the overview table at the top of 功能开关: the name links to the card (or page) that
// changes it. `on` drives the badge colour; `emergency` marks the switches turned off first.
export type OverviewRow = { name: string; href: string; section: string; state: string; on: boolean; emergency: boolean }

// Plain data, so the server page can hand it to the client overview.
export type OverviewInput = {
  signupPaused: WishlistSwitch
  food: WishlistSwitch
  posterGate: FeatureSetting | null
  photoCredits: number | null
  wishlist: WishlistSwitch | null
  gallery: { enabled: WishlistSwitch; autoApprove: WishlistSwitch } | null
  serviceWorker: WishlistSwitch
  appShell: WishlistSwitch
  affiliate: boolean
}

const S = COPY.sections
const switchRow = (copy: SwitchCopy, value: WishlistSwitch, section: string): OverviewRow => ({
  name: copy.title,
  href: `#${copy.key}`,
  section,
  state: value.enabled ? copy.state.on : copy.state.off,
  on: value.enabled,
  emergency: copy.summary?.emergency ?? false,
})

export function overviewRows(input: OverviewInput): OverviewRow[] {
  const rows: OverviewRow[] = [
    { ...switchRow(SIGNUP_GIFT_PAUSE_COPY, input.signupPaused, S.signup.title), on: !input.signupPaused.enabled },
    // Turned off first when food generations go wrong, though its card predates the summary.
    { ...switchRow(FOOD_TOGGLES_SWITCH_COPY, input.food, S.generation.title), emergency: true },
  ]
  if (input.posterGate) {
    rows.push({ name: `${input.posterGate.name} · ${COPY.who}`, href: `#feature-${input.posterGate.key}`, section: S.generation.title,
      state: COPY.tiers[input.posterGate.minTier ?? 'all'], on: true, emergency: false })
  }
  rows.push({ name: POSTER_PHOTO_COPY.title, href: '#poster_photo_credits', section: S.generation.title,
    state: input.photoCredits === null ? POSTER_PHOTO_COPY.overview.off : POSTER_PHOTO_COPY.overview.on, on: input.photoCredits !== null, emergency: false })
  if (input.wishlist) rows.push(switchRow(WISHLIST_SWITCH_COPY, input.wishlist, S.site.title))
  if (input.gallery) {
    rows.push(switchRow(GALLERY_SWITCH_COPY, input.gallery.enabled, S.site.title))
    rows.push(switchRow(AUTO_APPROVE_SWITCH_COPY, input.gallery.autoApprove, S.site.title))
  }
  rows.push(switchRow(SERVICE_WORKER_SWITCH_COPY, input.serviceWorker, S.speed.title))
  rows.push(switchRow(APP_SHELL_SWITCH_COPY, input.appShell, S.speed.title))
  rows.push({ name: COPY.overview.affiliate, href: '/admin/affiliates', section: COPY.overview.affiliateSection,
    state: input.affiliate ? COPY.overview.on : COPY.overview.off, on: input.affiliate, emergency: true })
  return rows
}
