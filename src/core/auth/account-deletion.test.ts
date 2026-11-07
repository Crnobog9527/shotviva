import { describe, expect, it, vi } from 'vitest'

import { accountPrefixes, deleteAccount, type AccountDeletionDeps } from './account-deletion'

function deps(overrides: Partial<{ storageError: Error; authError: string; cancelError: Error }> = {}) {
  const calls: string[] = []
  const value: AccountDeletionDeps = {
    cancelSubscriptions: vi.fn(async (id: string) => {
      calls.push(`stripe:${id}`)
      if (overrides.cancelError) throw overrides.cancelError
    }),
    storage: {
      deletePrefix: vi.fn(async (prefix: string) => {
        calls.push(`r2:${prefix}`)
        if (overrides.storageError) throw overrides.storageError
      }),
    },
    authAdmin: {
      deleteUser: vi.fn(async (id: string) => {
        calls.push(`auth:${id}`)
        return { error: overrides.authError ? { message: overrides.authError } : null }
      }),
    },
  }
  return { value, calls }
}

describe('deleteAccount', () => {
  it('cancels subscriptions, clears every R2 prefix (wishlist images included), then deletes the auth user', async () => {
    const { value, calls } = deps()
    await deleteAccount('u1', value)
    expect(calls).toEqual(['stripe:u1', 'r2:inputs/u1/', 'r2:outputs/u1/', 'r2:requests/u1/', 'r2:tickets/u1/', 'auth:u1'])
  })

  it('deletes nothing when a subscription cannot be cancelled (ARCHITECTURE §13)', async () => {
    const { value, calls } = deps({ cancelError: new Error('stripe down') })
    await expect(deleteAccount('u1', value)).rejects.toThrow('stripe down')
    expect(calls).toEqual(['stripe:u1'])
  })

  it('keeps the account when R2 fails, so the user can retry', async () => {
    const { value } = deps({ storageError: new Error('r2 down') })
    await expect(deleteAccount('u1', value)).rejects.toThrow('r2 down')
    expect(value.authAdmin.deleteUser).not.toHaveBeenCalled()
  })

  it('surfaces an auth admin failure', async () => {
    const { value } = deps({ authError: 'boom' })
    await expect(deleteAccount('u1', value)).rejects.toThrow(/boom/)
  })

  it('scopes prefixes to the user id with a trailing slash', () => {
    // Without the slash, deleting "u1" would also match "u10…".
    expect(accountPrefixes('u1')).toEqual(['inputs/u1/', 'outputs/u1/', 'requests/u1/', 'tickets/u1/'])
  })
})
