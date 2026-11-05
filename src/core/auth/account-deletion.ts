import { logger } from '../logger'

// Storage seen by account deletion. Production passes core/storage's R2 store; tests inject
// a fake and assert the prefixes.
export type AccountStorage = { deletePrefix(prefix: string): Promise<void> }

export type AuthAdmin = { deleteUser(userId: string): Promise<{ error: { message: string } | null }> }

export type AccountDeletionDeps = { storage: AccountStorage; authAdmin: AuthAdmin }

// Key layout fixed by ARCHITECTURE §8.2 / T4: inputs/{user_id}/…, outputs/{user_id}/…, plus
// the wishlist's reference images requests/{user_id}/… (§15.1, T12).
export function accountPrefixes(userId: string): string[] {
  return [`inputs/${userId}/`, `outputs/${userId}/`, `requests/${userId}/`]
}

// Files go first: if R2 fails the account still exists and the user can retry, whereas the
// reverse order would leave orphaned photos nobody can delete. Deleting the auth user then
// cascades to profiles and everything keyed on it (generation_jobs via T2's FK).
export async function deleteAccount(userId: string, deps: AccountDeletionDeps): Promise<void> {
  for (const prefix of accountPrefixes(userId)) {
    await deps.storage.deletePrefix(prefix)
  }
  const { error } = await deps.authAdmin.deleteUser(userId)
  if (error) throw new Error(`auth deleteUser failed: ${error.message}`)
  logger.info('account deleted', { userId })
}
