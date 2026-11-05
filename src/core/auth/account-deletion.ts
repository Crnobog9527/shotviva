import { logger } from '../logger'

// Storage seen by account deletion. The real R2 implementation arrives with core/storage (T4);
// tests inject a fake and assert the prefixes.
export type AccountStorage = { deletePrefix(prefix: string): Promise<void> }

export type AuthAdmin = { deleteUser(userId: string): Promise<{ error: { message: string } | null }> }

export type AccountDeletionDeps = { storage: AccountStorage; authAdmin: AuthAdmin }

// Key layout fixed by ARCHITECTURE §8.2 / T4: inputs/{user_id}/…, outputs/{user_id}/….
export function accountPrefixes(userId: string): string[] {
  return [`inputs/${userId}/`, `outputs/${userId}/`]
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

// Until T4 ships uploads there is nothing under either prefix, so this is truthful;
// T4 replaces it with the R2 client in delete-account-route.ts.
export const noUploadsYetStorage: AccountStorage = {
  async deletePrefix() {},
}
