import type { SupabaseClient } from '@supabase/supabase-js'

import { ensureCreatorWork } from './creator-work'
import { currentTier, grantSignup, purchaseMax, readProfile, resetPool, unban } from './ledger'
import { needsRecreate, type Persona } from './personas'
import type { QaStorage } from './storage'
import { createPersonaUser, deletePersonaUser, findUserByEmail } from './users'

export type Outcome = 'created' | 'recreated' | 'reset' | 'unchanged'
export type SetupResult = { userId: string; outcome: Outcome; ownerStep: string | null }

type Ctx = { db: SupabaseClient; storage: QaStorage }

// Finds the persona's user, deleting it first when it drifted past what a reset can undo.
async function ensureUser({ db, storage }: Ctx, persona: Persona): Promise<{ userId: string; outcome: Outcome | null }> {
  const existing = await findUserByEmail(db, persona.email)
  if (existing) {
    const profile = await readProfile(db, existing.id)
    const snapshot = { credits: profile.credits, paidUntil: profile.paid_until, tier: await currentTier(db, existing.id) }
    if (!needsRecreate(persona, snapshot)) return { userId: existing.id, outcome: null }
    await deletePersonaUser(db, storage, existing.id)
  }
  const user = await createPersonaUser(db, persona)
  return { userId: user.id, outcome: existing ? 'recreated' : 'created' }
}

// Each step is a no-op when the state is already right; the flags say whether any wrote.
async function applyState({ db, storage }: Ctx, persona: Persona, userId: string): Promise<boolean> {
  const steps: boolean[] = [await grantSignup(db, userId)]
  if (persona.tier === 'max') steps.push(await purchaseMax(db, userId))
  if (persona.succeededWork && persona.paidCredits !== null) {
    steps.push(await ensureCreatorWork(db, storage, userId, persona.paidCredits))
  }
  if (persona.freeCredits !== null) steps.push(await resetPool(db, userId, 'free', persona.freeCredits))
  if (persona.paidCredits !== null) steps.push(await resetPool(db, userId, 'paid', persona.paidCredits))
  if ((await readProfile(db, userId)).banned_at !== null) {
    await unban(db, userId)
    steps.push(true)
  }
  return steps.some(Boolean)
}

// profiles.role has no SQL function and service_role may not update it; it is an operational
// edit the Owner makes once in the Supabase SQL editor (AGENTS §5). qa-admin is never
// recreated, so the step survives every later run.
async function adminStep(db: SupabaseClient, persona: Persona, userId: string): Promise<string | null> {
  if (!persona.admin || (await readProfile(db, userId)).role === 'admin') return null
  return `update public.profiles set role = 'admin' where id = '${userId}';`
}

export async function setupPersona(ctx: Ctx, persona: Persona): Promise<SetupResult> {
  const { userId, outcome } = await ensureUser(ctx, persona)
  // qa-fresh stays exactly as created: its first sign-in grants the signup credits for real.
  const wrote = persona.alwaysRecreate ? false : await applyState(ctx, persona, userId)
  return {
    userId,
    outcome: outcome ?? (wrote ? 'reset' : 'unchanged'),
    ownerStep: await adminStep(ctx.db, persona, userId),
  }
}
