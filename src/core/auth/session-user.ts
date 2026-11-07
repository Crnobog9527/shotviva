import type { User } from '@supabase/supabase-js'

import { isLocale, type Locale } from '../i18n/locales'

export type Role = 'user' | 'admin'

export type SessionUser = {
  id: string
  email: string | null
  // E.164 digits without '+' (8614000005678) for phone sign-ups (T63); null otherwise. A phone
  // account may have no email at all.
  phone: string | null
  role: Role
  // Email confirmed, Google, or phone confirmed by its SMS code: the one gate for the app.
  verified: boolean
  // Banned accounts keep signing in but cannot generate, post or check out (ARCHITECTURE §7).
  banned: boolean
  // user_metadata.locale, written at sign-up (ARCHITECTURE §7); null for older and Google accounts.
  locale: Locale | null
}

export function metadataLocale(user: Pick<User, 'user_metadata'>): Locale | null {
  const value: unknown = user.user_metadata?.locale
  return isLocale(value) ? value : null
}

// Google accounts arrive verified; email sign-ups only after the link is clicked; phone
// sign-ups once the SMS code is entered (ARCHITECTURE §7: a verified phone counts as a verified
// email for everything).
export function isVerified(user: Pick<User, 'email_confirmed_at' | 'app_metadata'> & Partial<Pick<User, 'phone_confirmed_at'>>): boolean {
  if (user.email_confirmed_at || user.phone_confirmed_at) return true
  const providers: unknown = user.app_metadata?.providers
  return user.app_metadata?.provider === 'google' || (Array.isArray(providers) && providers.includes('google'))
}

export function toSessionUser(
  user: Pick<User, 'id' | 'email' | 'email_confirmed_at' | 'app_metadata'> &
    Partial<Pick<User, 'user_metadata' | 'phone' | 'phone_confirmed_at'>>,
  profile: { role: string; banned_at?: string | null } | null,
): SessionUser {
  return {
    id: user.id,
    // Supabase gives '' rather than null for the missing one.
    email: user.email || null,
    phone: user.phone || null,
    // A missing profile row is treated as the least privileged role.
    role: profile?.role === 'admin' ? 'admin' : 'user',
    verified: isVerified(user),
    banned: profile?.banned_at != null,
    locale: metadataLocale({ user_metadata: user.user_metadata ?? {} }),
  }
}
