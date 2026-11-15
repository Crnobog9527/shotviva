/**
 * Writes system_settings.catalog_economics_policy (ARCHITECTURE §6.1 保本预算, §6.2 第 5 项) through
 * admin_set_system_setting, never by hand-written SQL. The template floors (1568) and the
 * catalogue checks read it; without it the floors keep the old 60%-margin budget.
 *
 *   pnpm settings:catalog-policy                      # dry run: validate, show current vs new
 *   pnpm settings:catalog-policy --apply              # write (test database)
 *   pnpm settings:catalog-policy --apply --prod       # production, only with the Owner's go
 *   pnpm settings:catalog-policy path/to/policy.json  # default .local/pricing/catalog-economics-policy.json
 *
 * The file (gitignored, never in the repo) holds the five basis-point integers:
 *   { "payment_bp": …, "refund_bp": …, "yearly_commission_bp": …, "other_commission_bp": …, "margin_bp": … }
 * Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SHOTVIVA_IMPORT_ADMIN_ID (the
 * operator's admin UUID on that database), e.g. from .env.local.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { withDbTiers } from '../src/core/templates/db-resolution'
import { checkPolicyTarget, parsePolicy } from './set-catalog-policy-rules'

const env = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SHOTVIVA_IMPORT_ADMIN_ID: z.uuid({ message: 'SHOTVIVA_IMPORT_ADMIN_ID must be the operator admin UUID' }),
})

async function main() {
  const { values, positionals } = parseArgs({ options: { apply: { type: 'boolean' }, prod: { type: 'boolean' } }, allowPositionals: true })
  const file = resolve(positionals[0] ?? '.local/pricing/catalog-economics-policy.json')
  const policy = parsePolicy(JSON.parse(readFileSync(file, 'utf8')))
  const config = env.parse(process.env)
  const target = checkPolicyTarget(config.NEXT_PUBLIC_SUPABASE_URL, Boolean(values.prod))
  const client = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }, global: { fetch: withDbTiers() } })
  const current = await client.from('system_settings').select('value').eq('key', 'catalog_economics_policy').maybeSingle()
  if (current.error) throw new Error(`Could not read the current policy: ${current.error.message}`)
  process.stdout.write(`target: ${target}\ncurrent: ${JSON.stringify(current.data?.value ?? null)}\nnew:     ${JSON.stringify(policy)}\n`)
  if (!values.apply) {
    process.stdout.write('dry run: nothing written (add --apply to write)\n')
    return
  }
  const { error } = await client.rpc('admin_set_system_setting', { p_key: 'catalog_economics_policy', p_value: policy, p_actor: config.SHOTVIVA_IMPORT_ADMIN_ID })
  if (error) throw new Error(`admin_set_system_setting refused: ${error.message}${error.details ? ` (${error.details})` : ''}`)
  const after = await client.from('system_settings').select('value').eq('key', 'catalog_economics_policy').single()
  if (after.error || JSON.stringify(parsePolicy(after.data.value)) !== JSON.stringify(policy)) throw new Error('Read-back does not match the written policy')
  process.stdout.write('written and read back\n')
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'catalog policy write failed'}\n`)
  process.exitCode = 1
})
