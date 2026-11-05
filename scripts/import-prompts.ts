/**
 * Imports templates and their private prompts from a gitignored local file.
 *
 *   pnpm import:prompts                 # reads .local/prompts.json
 *   pnpm import:prompts path/to/file    # any other local file
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. from .env.local).
 * Format: scripts/prompts.example.json. Real prompts never go into git (AGENTS §5).
 * Re-running is safe: rows are upserted by id; omitted sortOrder / isActive keep stored values.
 * Prices below the floor table (modules/image/credits-floor.ts) are refused, as in the admin page.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { toUpsertArgs } from '../src/core/admin/templates/rpc-payload'
import { creditsBelowFloor } from '../src/core/templates/pricing'
import { templateWithPromptSchema } from '../src/core/templates/schema'
import { CREDITS_FLOOR } from '../src/modules/image/credits-floor'

const fileSchema = z.object({ templates: z.array(templateWithPromptSchema).min(1) })

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
})

function readTemplates(path: string) {
  const parsed = fileSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')))
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    throw new Error(`Invalid ${path}:\n  ${detail.join('\n  ')}`)
  }
  for (const template of parsed.data.templates) {
    const low = creditsBelowFloor(template.quality, template.creditsCost, CREDITS_FLOOR)
    if (low.length > 0) {
      const detail = low.map((v) => `${v.resolution} ${v.given} < floor ${v.floor}`).join(', ')
      throw new Error(`${template.id}: credits below the floor (${detail})`)
    }
  }
  return parsed.data.templates
}

async function main() {
  const path = resolve(process.argv[2] ?? '.local/prompts.json')
  const env = envSchema.parse(process.env)
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const templates = readTemplates(path)
  for (const { prompt, ...template } of templates) {
    const { error } = await client.rpc('admin_upsert_template', toUpsertArgs(template, prompt))
    if (error) throw new Error(`Failed on ${template.id}: ${error.message}`)
    // Ids and counts only: prompt bodies must never reach logs.
    process.stdout.write(`imported ${template.id}\n`)
  }
  process.stdout.write(`done: ${templates.length} template(s)\n`)
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
