/**
 * Loads the vessel library (ARCHITECTURE §5.1c「器皿图库」) from a local list into the test site.
 *
 *   pnpm dishware:import .local/<路径>/manifest.json --dry-run   # check the list and files only
 *   pnpm dishware:import .local/<路径>/manifest.json             # write the test site's library
 *
 * Same environment as templates:apply (.env.local: NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, SHOTVIVA_IMPORT_ADMIN_ID, TEMPLATE_TOOLS_R2_*): test site or a local
 * stack only. Production gets the library from the test site (Actions → Sync vessel library).
 */
import { readFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'

import { createClient } from '@supabase/supabase-js'

import { encodeDishware, listDishware } from '../../src/core/dishware/admin'
import { withDbTiers } from '../../src/core/templates/db-resolution'
import { RunError, targetStores } from '../template-apply/batch-file'
import { envSchema, targetOf } from '../template-apply/options'
import { readManifest } from './manifest'
import { mirrorDishware, type MirrorItem } from './mirror'

async function main() {
  const { values, positionals } = parseArgs({ args: process.argv.slice(2), allowPositionals: true, options: { 'dry-run': { type: 'boolean' } } })
  if (positionals.length !== 1) throw new RunError('用法：pnpm dishware:import .local/<路径>/manifest.json [--dry-run]')
  const env = envSchema.safeParse(process.env)
  if (!env.success) throw new RunError(`环境变量缺失或不对：${env.error.issues.map((i) => i.path.join('.')).join('、')}`)
  const { manifest, fileOf } = await readManifest(positionals[0]!)
  const items: MirrorItem[] = await Promise.all(manifest.items.map(async (entry) => {
    const encoded = await encodeDishware(entry.id, await readFile(fileOf(entry.file)))
    return { id: entry.id, label: entry.label, category: entry.category, shape: entry.shape, isActive: entry.active,
      imageKey: encoded.key, width: encoded.width, height: encoded.height, bytes: async () => encoded.data }
  }))
  process.stdout.write(`清单 ${items.length} 只器皿，图片都能读。\n`)
  if (values['dry-run']) return
  const target = targetOf(env.data)
  const { privateStore } = await targetStores(target)
  if (!privateStore) throw new RunError('缺测试站 R2 密钥（TEMPLATE_TOOLS_R2_*）')
  const db = createClient(env.data.NEXT_PUBLIC_SUPABASE_URL, env.data.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }, global: { fetch: withDbTiers() } })
  const current = await listDishware(db)
  const result = await mirrorDishware({ db, store: privateStore, actorId: env.data.SHOTVIVA_IMPORT_ADMIN_ID, current }, items, (line) => process.stdout.write(`${line}\n`))
  process.stdout.write(`完成：新写图片 ${result.written}，保存 ${result.saved}，停用 ${result.deactivated}。测试站最多 5 分钟后用上新图库。\n`)
}

main().catch((error: unknown) => {
  const ours = error instanceof RunError || (error instanceof Error && !/https?:\/\/|token|eyJ|secret/i.test(error.message))
  process.stderr.write(`${ours ? (error as Error).message : 'FAILED'}\n`)
  process.exitCode = 1
})
