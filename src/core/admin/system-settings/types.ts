// Shared with the client card, so no server-only import here.
export type WishlistSwitch = {
  enabled: boolean
  // Null until the switch is first saved (it is off by default).
  updatedAt: string | null
  updatedByEmail: string | null
}

export type WishlistSwitchInput = { enabled: boolean }
