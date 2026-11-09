import type { SupabaseClient, User } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { recordSignupIp } from '../../src/core/auth/signup-ip'
import { currentTier, grantSignup, readProfile, resetPool } from './ledger'
import { BULK_PERSONA_IDS, INVITEE_SIGNUP_IP, PERSONAS } from './personas'
import { setupPersona } from './setup-persona'
import type { QaStorage } from './storage'
import { createPersonaUser, deletePersonaUser, findUserByEmail } from './users'

vi.mock('../../src/core/auth/signup-ip')
vi.mock('./ledger')
vi.mock('./users')

const ctx = { db: {} as SupabaseClient, storage: {} as QaStorage }
const persona = PERSONAS['qa-invitee']

function qaUser(id: string, user_metadata: User['user_metadata'] = {}): User {
  return { id, user_metadata, app_metadata: {}, aud: 'authenticated', created_at: '2026-11-09T00:00:00Z' }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(findUserByEmail).mockResolvedValue(null)
  vi.mocked(createPersonaUser).mockResolvedValue(qaUser('new-invitee', { qa_persona: persona.id }))
  vi.mocked(recordSignupIp).mockResolvedValue(true)
  vi.mocked(grantSignup).mockResolvedValue(true)
})

describe('qa-invitee reset', () => {
  it('creates a test identity with its fixed IP before applying the real signup grant', async () => {
    expect(BULK_PERSONA_IDS).not.toContain(persona.id)
    const result = await setupPersona(ctx, persona)
    expect(result.outcome).toBe('created')
    expect(findUserByEmail).toHaveBeenCalledWith(ctx.db, persona.email)
    expect(recordSignupIp).toHaveBeenCalledWith(ctx.db, result.userId, INVITEE_SIGNUP_IP)
    expect(grantSignup).toHaveBeenCalledWith(ctx.db, result.userId)
    expect(recordSignupIp).toHaveBeenCalledBefore(vi.mocked(grantSignup))
    expect(resetPool).not.toHaveBeenCalled()
  })

  it('recreates the named QA identity even if previous payments left no balance', async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(qaUser('old-invitee', { qa_persona: persona.id }))
    vi.mocked(readProfile).mockResolvedValue({ credits: 0, paid_until: null, role: 'user', free_credits: 0, banned_at: null })
    vi.mocked(currentTier).mockResolvedValue(null)
    expect((await setupPersona(ctx, persona)).outcome).toBe('recreated')
    expect(deletePersonaUser).toHaveBeenCalledExactlyOnceWith(ctx.db, ctx.storage, 'old-invitee')
  })

  it('refuses to recreate an unrelated account with the reserved email', async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(qaUser('another-user'))
    await expect(setupPersona(ctx, persona)).rejects.toThrow(/not created by the QA script/)
    expect(deletePersonaUser).not.toHaveBeenCalled()
    expect(createPersonaUser).not.toHaveBeenCalled()
  })

  it('surfaces a refused IP write or grant without using an adjustment to fund the account', async () => {
    vi.mocked(recordSignupIp).mockResolvedValueOnce(false)
    await expect(setupPersona(ctx, persona)).rejects.toThrow(/signup IP/)
    expect(grantSignup).not.toHaveBeenCalled()
    vi.mocked(grantSignup).mockResolvedValueOnce(false)
    await expect(setupPersona(ctx, persona)).rejects.toThrow(/signup grant/)
    expect(resetPool).not.toHaveBeenCalled()
  })
})
