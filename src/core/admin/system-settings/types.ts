// Shared with the client card, so no server-only import here.
export type WishlistSwitch = {
  enabled: boolean
  // Null until the switch is first saved (it is off by default).
  updatedAt: string | null
  updatedByEmail: string | null
}

export type WishlistSwitchInput = { enabled: boolean }

// The boolean runtime switches the admin shows as on/off cards.
export type SwitchKey = 'wishlist_enabled' | 'gallery_enabled' | 'gallery_auto_approve'
