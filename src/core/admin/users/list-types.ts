// The /admin/users list (ARCHITECTURE §10.a, T77): one row per account from admin_list_users
// (0620). credits = paid pool, freeCredits = free pool.

export const USER_TIERS = ['free', 'starter', 'pro', 'max'] as const
export type UserTier = (typeof USER_TIERS)[number]

export const SIGNUP_PROVIDERS = ['email', 'google', 'phone'] as const
export type SignupProvider = (typeof SIGNUP_PROVIDERS)[number]

export const USER_STATUSES = ['active', 'banned'] as const
export type UserStatusFilter = (typeof USER_STATUSES)[number]

export const USER_SORTS = ['created', 'last_job', 'paid_credits'] as const
export type UserSort = (typeof USER_SORTS)[number]

export const USERS_PAGE_SIZE = 50

// Batch actions take at most one page of users (ARCHITECTURE §10.a).
export const BATCH_MAX = USERS_PAGE_SIZE

export type UserListRow = {
  id: string
  email: string | null
  // auth.users.phone, E.164 digits without '+' (T63).
  phone: string | null
  createdAt: string
  // The sign-up method from auth app_metadata; null or another value for odd accounts.
  provider: string | null
  role: 'user' | 'admin'
  credits: number
  freeCredits: number
  paidUntil: string | null
  tier: UserTier
  // Monthly or yearly plan; null when free.
  interval: 'month' | 'year' | null
  lastGenerationAt: string | null
  bannedAt: string | null
  // Face-swap refusals in the last 24 hours (ARCHITECTURE §5.1a, T81); `refusalFlag` at three or
  // more, shown red. Banning stays the Owner's call.
  refusals24h: number
  refusalFlag: boolean
}

// unavailable: the database has no admin_list_users yet (this code deployed before migration
// 0620 ran); the page says so and the lookup box keeps working.
export type UserListPage = { total: number; page: number; pageCount: number; rows: UserListRow[]; unavailable?: true }

// A batch either ran (changed: users it changed; unchanged: already in that state, or already
// adjusted by this same batch) or was refused as a whole because of the named users: gone,
// a pool that would drop below zero, or (a ban) an admin or the acting admin.
export type BatchOutcome =
  | { kind: 'done'; changed: number; unchanged: number }
  | { kind: 'rejected'; reason: 'missing' | 'insufficient' | 'protected'; userIds: string[] }
