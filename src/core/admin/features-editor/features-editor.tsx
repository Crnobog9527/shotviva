'use client'

import type { ActionResult } from '../templates/types'
import { EmptyState } from '../shell/admin-blocks'
import type { FeatureAccessInput, FeatureSetting } from '../features/types'
import type { WishlistSwitch, WishlistSwitchInput } from '../system-settings/types'
import { FEATURES_COPY as COPY } from './copy'
import { FeatureCard } from './feature-card'
import { WishlistSwitchCard } from './wishlist-switch-card'

export type FeatureAdminActions = {
  save: (input: FeatureAccessInput) => Promise<ActionResult>
  saveWishlist: (input: WishlistSwitchInput) => Promise<ActionResult>
}

// Null when the site has no wishlist at all (site.features.wishlist false): no switch to show.
export type WishlistSwitchState = { value: WishlistSwitch; previewOverride: boolean } | null

type Props = { settings: FeatureSetting[]; wishlist: WishlistSwitchState; actions: FeatureAdminActions }

export function FeaturesEditor({ settings, wishlist, actions }: Props) {
  return (
    <div className="grid gap-6">
      {wishlist ? (
        <div className="grid gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">{COPY.switchesHeading}</h2>
          <WishlistSwitchCard value={wishlist.value} previewOverride={wishlist.previewOverride} save={actions.saveWishlist} />
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
