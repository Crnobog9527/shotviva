import { z } from 'zod'

// The runtime switches the Owner flips in the admin (ARCHITECTURE §15.6, T62). The database
// accepts the same keys and types (admin_set_system_setting, migration 0421); a new setting
// is added in both places. No stored row means the default.
type SettingTypes = {
  // Whether the template wishlist is open. Only read when site.features.wishlist is true.
  wishlist_enabled: boolean
  // Whether the public gallery is open (ARCHITECTURE §9 第 1 条). Only read when site.gallery.enabled.
  gallery_enabled: boolean
  // Whether a work the automatic screen did not flag is approved without a person (§9 第 5 条).
  gallery_auto_approve: boolean
  // 1350 (ARCHITECTURE §7): no signup gift at all while on. grant_credits reads the row itself.
  signup_gift_paused: boolean
  // 1350: signup gifts per Beijing day (0 = none). grant_credits reads the row itself.
  signup_gift_daily_cap: number
}

export type SystemSettingKey = keyof SettingTypes

type SettingDefinition<T> = { schema: z.ZodType<T>; fallback: T }

export const SYSTEM_SETTINGS: { [K in SystemSettingKey]: SettingDefinition<SettingTypes[K]> } = {
  wishlist_enabled: { schema: z.boolean(), fallback: false },
  gallery_enabled: { schema: z.boolean(), fallback: false },
  gallery_auto_approve: { schema: z.boolean(), fallback: false },
  signup_gift_paused: { schema: z.boolean(), fallback: false },
  signup_gift_daily_cap: { schema: z.number().int().min(0).max(100_000), fallback: 30 },
}

export function isSystemSettingKey(key: string): key is SystemSettingKey {
  return Object.hasOwn(SYSTEM_SETTINGS, key)
}

// Stored values as the read hands them over: key → raw jsonb value.
export type SystemSettingValues = Partial<Record<string, unknown>>

// A setting's value, or its default when the row is missing or holds the wrong type.
export function settingValue<K extends SystemSettingKey>(values: SystemSettingValues, key: K): SettingTypes[K] {
  const definition: SettingDefinition<SettingTypes[K]> = SYSTEM_SETTINGS[key]
  const parsed = definition.schema.safeParse(values[key])
  return parsed.success ? parsed.data : definition.fallback
}
