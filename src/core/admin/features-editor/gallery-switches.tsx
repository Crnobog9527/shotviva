'use client'

import type { WishlistSwitch, WishlistSwitchInput } from '../system-settings/types'
import type { ActionResult } from '../templates/types'
import { AUTO_APPROVE_SWITCH_COPY, GALLERY_SWITCH_COPY } from './gallery-copy'
import { SettingSwitchCard } from './setting-switch-card'

export type GallerySwitchKey = 'gallery_enabled' | 'gallery_auto_approve'

// Null when the site has no gallery at all (site.gallery.enabled false): no switches to show.
export type GallerySwitchState = { enabled: WishlistSwitch; autoApprove: WishlistSwitch } | null

type Props = {
  state: NonNullable<GallerySwitchState>
  save: (key: GallerySwitchKey, input: WishlistSwitchInput) => Promise<ActionResult>
}

// The public gallery's two switches (ARCHITECTURE §9 第 1、5 条, T108): open the gallery, and
// whether unflagged works skip the person.
export function GallerySwitches({ state, save }: Props) {
  return (
    <>
      <SettingSwitchCard copy={GALLERY_SWITCH_COPY} value={state.enabled} save={(input) => save('gallery_enabled', input)} />
      <SettingSwitchCard
        copy={AUTO_APPROVE_SWITCH_COPY}
        value={state.autoApprove}
        save={(input) => save('gallery_auto_approve', input)}
      />
    </>
  )
}
