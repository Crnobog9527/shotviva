// Shared with the client card, so no server-only import here.
export type WishlistSwitch = {
  enabled: boolean
  // Null until the switch is first saved (it is off by default).
  updatedAt: string | null
  updatedByEmail: string | null
}

export type WishlistSwitchInput = { enabled: boolean }

// The boolean runtime switches the admin shows as on/off cards.
export type SwitchKey = 'wishlist_enabled' | 'gallery_enabled' | 'gallery_auto_approve' | 'signup_gift_paused' | 'food_plating_enabled' | 'food_tableware_enabled' | 'service_worker_enabled' | 'service_worker_shell_enabled'

// 1350 + 1480 + 2008: the signup gift card on /admin/features. Today is the Beijing day the cap
// counts; credits is what one new account gets.
export type SignupGiftRules = { credits: number; cap: number; perIp: number; perIpPartner: number; claimPhone: boolean; claimGoogle: boolean }
export type SignupGiftState = { granted: number; rules: SignupGiftRules; paused: WishlistSwitch }
