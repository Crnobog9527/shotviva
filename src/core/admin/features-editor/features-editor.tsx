'use client'

import type { ActionResult } from '../templates/types'
import { EmptyState } from '../shell/admin-blocks'
import type { FeatureAccessInput, FeatureInviteInput, FeatureSetting } from '../features/types'
import type { WishlistSwitch, WishlistSwitchInput } from '../system-settings/types'
import { FEATURES_COPY as COPY } from './copy'
import { FeatureCard } from './feature-card'
import { InviteCard } from './invite-card'
import { GallerySwitches, type GallerySwitchKey, type GallerySwitchState } from './gallery-switches'
import { SettingSwitchCard } from './setting-switch-card'
import { WISHLIST_SWITCH_COPY } from './wishlist-copy'

// Null when the site has no wishlist at all (site.features.wishlist false): no switch to show.
export type WishlistSwitchState = { value: WishlistSwitch; previewOverride: boolean } | null

type SiteSwitchProps = {
  wishlist: WishlistSwitchState
  gallery: GallerySwitchState
  saveWishlist: (input: WishlistSwitchInput) => Promise<ActionResult>
  saveGallery: (key: GallerySwitchKey, input: WishlistSwitchInput) => Promise<ActionResult>
}

// 前台功能: 需求墙 (§15.6, T62) and the public gallery (§9, T108), each only on a site that has it.
export function SiteSwitches({ wishlist, gallery, saveWishlist, saveGallery }: SiteSwitchProps) {
  return (
    <>
      {wishlist ? (
        <SettingSwitchCard
          copy={WISHLIST_SWITCH_COPY}
          value={wishlist.value}
          note={wishlist.previewOverride ? WISHLIST_SWITCH_COPY.previewOverride : null}
          save={saveWishlist}
        />
      ) : null}
      {gallery ? <GallerySwitches state={gallery} save={saveGallery} /> : null}
    </>
  )
}

type GateProps = {
  settings: FeatureSetting[]
  save: (input: FeatureAccessInput) => Promise<ActionResult>
  invite: (input: FeatureInviteInput) => Promise<ActionResult>
  // Shown when the list is empty (the 会员抢先用 section); a placed feature passes none.
  empty?: boolean
}

// Who may use each registered feature (ARCHITECTURE §6.2 新功能抢先用): a tier and date, or an
// invite list. Each card saves on its own.
export function FeatureGates({ settings, save, invite, empty }: GateProps) {
  if (settings.length === 0) return empty ? <EmptyState title={COPY.empty} body={COPY.emptyBody} /> : null
  return settings.map((setting) => (
    <div key={setting.key} id={`feature-${setting.key}`} className="scroll-mt-20">
      {setting.inviteOnly ? <InviteCard setting={setting} invite={invite} /> : <FeatureCard setting={setting} save={save} />}
    </div>
  ))
}
