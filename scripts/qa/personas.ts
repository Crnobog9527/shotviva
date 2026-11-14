import { site } from '../../src/site/site.config'

// Keep the dedicated payment acceptance account outside the shared bulk reset.
export const BULK_PERSONA_IDS = ['qa-admin', 'qa-creator', 'qa-fresh', 'qa-max', 'qa-free'] as const
export const PERSONA_IDS = [...BULK_PERSONA_IDS, 'qa-invitee'] as const
export const INVITEE_SIGNUP_IP = '192.0.2.94' // TEST-NET-1, reserved for documentation.
export type PersonaId = (typeof PERSONA_IDS)[number]

export const SIGNUP_FREE_CREDITS = site.billing.freeCredits

// A yearly membership so the fixed purchase key keeps the tier active for a whole year of
// validation rounds; a monthly one would lapse after 30 days and the key could not renew it.
export const MAX_PRODUCT_ID = 'max_yearly'
export const MAX_PRODUCT_CREDITS = site.billing.products.find((product) => product.id === MAX_PRODUCT_ID)!.credits

export type Persona = {
  id: PersonaId
  email: string
  // A fresh identity keeps registration age, invite bindings and payment history reset together.
  alwaysRecreate: boolean
  admin: boolean
  // Balances reset to these after setup; null leaves the pool alone (qa-fresh).
  freeCredits: number | null
  paidCredits: number | null
  tier: 'max' | null
  succeededWork: boolean
}

const base = { alwaysRecreate: false, admin: false, freeCredits: SIGNUP_FREE_CREDITS, paidCredits: 0, tier: null, succeededWork: false }

export const PERSONAS: Record<PersonaId, Persona> = {
  'qa-admin': { ...base, id: 'qa-admin', email: 'qa-admin@shotviva.com', admin: true, paidCredits: 200 },
  'qa-creator': { ...base, id: 'qa-creator', email: 'qa-creator@shotviva.com', paidCredits: 100, succeededWork: true },
  'qa-fresh': { ...base, id: 'qa-fresh', email: 'qa-fresh@shotviva.com', alwaysRecreate: true, freeCredits: null, paidCredits: null },
  'qa-max': { ...base, id: 'qa-max', email: 'qa-max@shotviva.com', paidCredits: MAX_PRODUCT_CREDITS, tier: 'max' },
  'qa-free': { ...base, id: 'qa-free', email: 'qa-free@shotviva.com' },
  'qa-invitee': { ...base, id: 'qa-invitee', email: 'qa-invitee@shotviva.com', alwaysRecreate: true },
}

export function isPersonaId(value: string): value is PersonaId {
  return (PERSONA_IDS as readonly string[]).includes(value)
}

export type Snapshot = { credits: number; paidUntil: string | null; tier: string | null }

// A persona that drifted beyond what a balance reset can undo is deleted and recreated:
// qa-free must never have bought anything, qa-max must still be on Max.
export function needsRecreate(persona: Persona, snapshot: Snapshot): boolean {
  if (persona.alwaysRecreate) return true
  if (persona.id === 'qa-free') return snapshot.credits > 0 || snapshot.paidUntil !== null || snapshot.tier !== null
  if (persona.tier) return snapshot.tier !== persona.tier
  return false
}

// Deterministic, so a rerun finds the same ledger row instead of writing a new one. The key
// moves only when the balance it resets has moved (a new latest ledger row).
export function resetKey(userId: string, pool: 'free' | 'paid', latestLedgerId: number): string {
  return `qa:reset:${userId}:${pool}:${latestLedgerId}`
}

// apply_purchase prefixes this with `purchase:`; real Stripe ids are cs_… / in_…, never qa-.
export const MAX_PURCHASE_EVENT_ID = `qa-max:${MAX_PRODUCT_ID}`

// The app's own signup-grant key (core/billing signupGrantKey), so the first real sign-in
// finds it used and grants nothing twice.
export function signupKey(userId: string): string {
  return `signup:${userId}`
}
