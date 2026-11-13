// Shared with the client card, so no server-only import here.
export type WishlistSwitch = {
  enabled: boolean
  // Null until the switch is first saved (it is off by default).
  updatedAt: string | null
  updatedByEmail: string | null
}

export type WishlistSwitchInput = { enabled: boolean }

// The boolean runtime switches the admin shows as on/off cards.
export type SwitchKey = 'wishlist_enabled' | 'gallery_enabled' | 'gallery_auto_approve' | 'signup_gift_paused'

// 1350 + 1410: the signup gift card on /admin/features. Today is the Beijing day the cap counts.
export type SignupGiftRules = { cap: number; perIp: number; claimPhone: boolean; claimGoogle: boolean }
export type SignupGiftState = { granted: number; rules: SignupGiftRules; paused: WishlistSwitch }
