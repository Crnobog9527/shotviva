/**
 * Back-fill the enterprise signup bonus (migration 2010) for customers who signed up through an
 * org's partner link (?ref=) before the trigger covered that path. Each user goes through
 * admin_org_signup_bonus_backfill, which re-checks eligibility, pays the org's current amount at
 * most once (same record row and ledger key as the trigger) and audits it under the admin id.
 *
 *   pnpm tsx --env-file-if-exists=.env.local scripts/org-signup-bonus-backfill.ts <user-id>...          # dry run
 *   pnpm tsx --env-file-if-exists=.env.local scripts/org-signup-bonus-backfill.ts --apply <user-id>...  # pays
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SHOTVIVA_IMPORT_ADMIN_ID (an admin's
 * profile id; pass it on the command line, do not store it). Run --apply only with the Owner's
 * approval of the dry-run list. Safe to rerun: a paid user answers 'already'.
 */
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { withDbTiers } from '../src/core/templates/db-resolution'

const env = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SHOTVIVA_IMPORT_ADMIN_ID: z.uuid(),
}).parse(process.env)

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const users = z.array(z.uuid()).min(1).parse(args.filter(a => a !== '--apply'))

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }, global: { fetch: withDbTiers() } })

let failed = false
for (const user of users) {
  const { data, error } = await db.rpc('admin_org_signup_bonus_backfill', {
    p_actor: env.SHOTVIVA_IMPORT_ADMIN_ID, p_user: user, p_apply: apply,
  })
  if (error) { failed = true; console.error(user, 'error', error.message); continue }
  console.log(user, JSON.stringify(data))
}
console.log(apply ? '已执行（apply）' : '演练（dry run），未写入；加 --apply 才会发放')
if (failed) process.exitCode = 1
