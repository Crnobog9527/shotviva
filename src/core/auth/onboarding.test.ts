import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { onboardingPatch, readOnboarding } from './onboarding'
import { markOnboardingSeen } from './onboarding-store'

describe('onboarding flags in user_metadata', () => {
  it('reads only literal true as seen', () => {
    expect(readOnboarding(undefined)).toEqual({ wishlistSeen: false, wishlistHintSeen: false })
    expect(readOnboarding({ onboarding: 'yes' })).toEqual({ wishlistSeen: false, wishlistHintSeen: false })
    expect(readOnboarding({ onboarding: { wishlistSeen: 'true', wishlistHintSeen: true } })).toEqual({ wishlistSeen: false, wishlistHintSeen: true })
  })

  it('patches one flag and keeps the others, unknown keys included', () => {
    expect(onboardingPatch({ locale: 'zh', onboarding: { wishlistHintSeen: true, later: 1 } }, 'wishlistSeen')).toEqual({
      onboarding: { wishlistHintSeen: true, later: 1, wishlistSeen: true },
    })
    expect(onboardingPatch(null, 'wishlistHintSeen')).toEqual({ onboarding: { wishlistHintSeen: true } })
  })
})

function adminDb(metadata: unknown, error: { code: string } | null = null) {
  const updateUserById = vi.fn(async () => ({ data: {}, error: null }))
  const getUserById = vi.fn(async () => (error ? { data: { user: null }, error } : { data: { user: { user_metadata: metadata } }, error: null }))
  const db = { auth: { admin: { getUserById, updateUserById } } }
  return { db: db as never, getUserById, updateUserById }
}

describe('markOnboardingSeen', () => {
  it('writes the merged onboarding object for the given (session) user id', async () => {
    const { db, getUserById, updateUserById } = adminDb({ locale: 'en', onboarding: { wishlistHintSeen: true } })
    await markOnboardingSeen(db, 'user-1', 'wishlistSeen')
    expect(getUserById).toHaveBeenCalledWith('user-1')
    expect(updateUserById).toHaveBeenCalledWith('user-1', { user_metadata: { onboarding: { wishlistHintSeen: true, wishlistSeen: true } } })
  })

  it('skips the write when the flag is already set, and swallows a failed read', async () => {
    const seen = adminDb({ onboarding: { wishlistSeen: true } })
    await markOnboardingSeen(seen.db, 'user-1', 'wishlistSeen')
    expect(seen.updateUserById).not.toHaveBeenCalled()
    const failed = adminDb(null, { code: 'user_not_found' })
    await expect(markOnboardingSeen(failed.db, 'user-1', 'wishlistSeen')).resolves.toBeUndefined()
    expect(failed.updateUserById).not.toHaveBeenCalled()
  })
})
