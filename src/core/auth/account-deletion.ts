import { logger } from '../logger'

// Storage seen by account deletion. Production passes core/storage's R2 store; tests inject
// a fake and assert the prefixes.
export type AccountStorage = { deletePrefix(prefix: string): Promise<void> }

export type AuthAdmin = { deleteUser(userId: string): Promise<{ error: { message: string } | null }> }

// Cancels every subscription Stripe may still bill (core/billing's cancelAllSubscriptions,
// wired in by app/: core/auth does not reach into billing). Throws when one cannot be cancelled.
export type CancelSubscriptions = (userId: string) => Promise<unknown>

export type AccountDeletionDeps = { storage: AccountStorage; authAdmin: AuthAdmin; cancelSubscriptions: CancelSubscriptions }

// Key layout fixed by ARCHITECTURE §8.2 / T4: inputs/{user_id}/…, outputs/{user_id}/…, plus
// the wishlist's reference images requests/{user_id}/… (§15.1, T12) and the support-ticket
// images tickets/{user_id}/… (§10, T69; the Owner's replies are filed under the author too).
export function accountPrefixes(userId: string): string[] {
  return [`inputs/${userId}/`, `outputs/${userId}/`, `requests/${userId}/`, `tickets/${userId}/`]
}

// Subscriptions go first (ARCHITECTURE §13): if Stripe will not cancel one, nothing is deleted
// and the user can retry; deleting first would leave a card being charged for an account that
// no longer exists. Files next: if R2 fails the account still exists and the user can retry,
// whereas the reverse order would leave orphaned photos nobody can delete. Deleting the auth
// user then cascades to profiles and everything keyed on it (generation_jobs via T2's FK, the
// subscriptions mirror).
export async function deleteAccount(userId: string, deps: AccountDeletionDeps): Promise<void> {
  await deps.cancelSubscriptions(userId)
  for (const prefix of accountPrefixes(userId)) {
    await deps.storage.deletePrefix(prefix)
  }
  const { error } = await deps.authAdmin.deleteUser(userId)
  if (error) throw new Error(`auth deleteUser failed: ${error.message}`)
  logger.info('account deleted', { userId })
}
