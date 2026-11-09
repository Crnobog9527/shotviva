/**
 * Imports templates and their private prompts from a gitignored local file.
 *
 *   pnpm import:prompts                 # reads .local/prompts.json
 *   pnpm import:prompts path/to/file    # any other local file
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. from .env.local).
 * Format: scripts/prompts.example.json. Real prompts never go into git (AGENTS §5).
 * Re-running is safe: rows are upserted by id; omitted sortOrder / isActive keep stored values.
 * Prices below the selected model’s floor are refused, as in the admin page.
 * `category`: a category key from 分类管理 (e.g. food-drink) or a category's English / Chinese
 * name; a value no category has creates one (T75, resolved by the 0581 trigger).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { toUpsertArgs } from '../src/core/admin/templates/rpc-payload'
import { listImageProviderOptions, pricingFromOptions } from '../src/core/admin/templates/provider-pricing'
import { maxCostPerCredit } from '../src/core/templates/provider-pricing'
import { site } from '../src/site/site.config'
import { templateWithPromptSchema } from '../src/core/templates/schema'
import { toggleSetupProblems } from '../src/core/templates/toggles'

const fileSchema = z.object({ templates: z.array(templateWithPromptSchema).min(1) })

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_IMAGE_MODEL: z.string().default('gpt-image-2.5-sunburst'),
})

function readTemplates(path: string) {
  const parsed = fileSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')))
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    throw new Error(`Invalid ${path}:\n  ${detail.join('\n  ')}`)
  }
  for (const template of parsed.data.templates) {
    // The admin save's T89 rule: names the toggle, never the prompt text.
    const unwired = toggleSetupProblems(template.fields.toggles, template.prompt.body, template.prompt.modelParams)
    if (unwired.length > 0) throw new Error(`${template.id}: ${unwired.join('; ')}`)
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
  const pricing = await listImageProviderOptions(client, maxCostPerCredit(site.billing.products), env.OPENAI_IMAGE_MODEL)
  const floors = pricingFromOptions(pricing)
  for (const { prompt, ...template } of templates) {
    const { error } = await client.rpc('admin_upsert_template', toUpsertArgs(template, prompt, { categoryByName: true, floors }))
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
