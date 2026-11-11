'use client'

import type { ActionResult } from '../templates/types'
import { EmptyState } from '../shell/admin-blocks'
import type { FeatureAccessInput, FeatureSetting } from '../features/types'
import type { WishlistSwitch, WishlistSwitchInput } from '../system-settings/types'
import { FEATURES_COPY as COPY } from './copy'
import { FeatureCard } from './feature-card'
import { GallerySwitches, type GallerySwitchKey, type GallerySwitchState } from './gallery-switches'
import { SettingSwitchCard } from './setting-switch-card'
import { WISHLIST_SWITCH_COPY } from './wishlist-copy'

export type FeatureAdminActions = {
  save: (input: FeatureAccessInput) => Promise<ActionResult>
  saveWishlist: (input: WishlistSwitchInput) => Promise<ActionResult>
  saveGallery: (key: GallerySwitchKey, input: WishlistSwitchInput) => Promise<ActionResult>
}

// Null when the site has no wishlist at all (site.features.wishlist false): no switch to show.
export type WishlistSwitchState = { value: WishlistSwitch; previewOverride: boolean } | null

type Props = {
  settings: FeatureSetting[]
  wishlist: WishlistSwitchState
  gallery: GallerySwitchState
  actions: FeatureAdminActions
}

export function FeaturesEditor({ settings, wishlist, gallery, actions }: Props) {
  return (
    <div className="grid gap-6">
      {wishlist || gallery ? (
        <div className="grid gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">{COPY.switchesHeading}</h2>
          {wishlist ? (
            <SettingSwitchCard
              copy={WISHLIST_SWITCH_COPY}
              value={wishlist.value}
              note={wishlist.previewOverride ? WISHLIST_SWITCH_COPY.previewOverride : null}
              save={actions.saveWishlist}
            />
          ) : null}
          {gallery ? <GallerySwitches state={gallery} save={actions.saveGallery} /> : null}
        </div>
      ) : null}
      <div className="grid gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{COPY.gatesHeading}</h2>
        <p className="text-sm text-muted-foreground">{COPY.intro}</p>
        {settings.length === 0 ? (
          <EmptyState title={COPY.empty} body={COPY.emptyBody} />
        ) : (
          settings.map((setting) => <FeatureCard key={setting.key} setting={setting} save={actions.save} />)
        )}
      </div>
    </div>
  )
}
