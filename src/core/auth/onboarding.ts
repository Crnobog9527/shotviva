// First-run hints an account has already seen (Owner 2026-11-10), kept in Supabase Auth
// user_metadata.onboarding so they follow the account across devices without a table or a
// migration. user_metadata is the user's own to edit; these flags only hide hints, so a
// tampered value costs nothing. Unknown keys inside `onboarding` are kept on every write.
export const ONBOARDING_FLAGS = ['wishlistSeen', 'wishlistHintSeen'] as const
export type OnboardingFlag = (typeof ONBOARDING_FLAGS)[number]
export type Onboarding = Readonly<Record<OnboardingFlag, boolean>>

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

function stored(metadata: unknown): Record<string, unknown> {
  const value = isRecord(metadata) ? metadata.onboarding : undefined
  return isRecord(value) ? value : {}
}

// Only a literal true counts as seen: anything missing or malformed shows the hint.
export function readOnboarding(metadata: unknown): Onboarding {
  const flags = stored(metadata)
  return { wishlistSeen: flags.wishlistSeen === true, wishlistHintSeen: flags.wishlistHintSeen === true }
}

// The user_metadata patch that sets one flag. Supabase Auth merges user_metadata one level
// deep, so the whole `onboarding` object is sent, rebuilt from the current one.
export function onboardingPatch(metadata: unknown, flag: OnboardingFlag): { onboarding: Record<string, unknown> } {
  return { onboarding: { ...stored(metadata), [flag]: true } }
}
