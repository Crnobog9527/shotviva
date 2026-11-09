import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

import type { PersonaId } from './personas'
import { assertQaTarget, QaGuardError, resolveSiteUrl } from './target'

export const ENV_FILE = '.env.local'

// The two Supabase values come from .env.local only. The npm scripts load it with
// --env-file, but Node lets an exported shell variable win over the file; a shell value that
// differs is refused so nothing outside .env.local can point the scripts at another project.
const FILE_ONLY = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const

export type R2Config = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string }

export type QaEnv = {
  ref: string
  supabaseUrl: string
  serviceKey: string
  siteUrl: string
  r2: R2Config | null
}

function fromFile(path: string): Record<(typeof FILE_ONLY)[number], string> {
  if (!existsSync(path)) throw new QaGuardError(`${path} not found; see scripts/qa/README.md (setup).`)
  const file = parseEnv(readFileSync(path, 'utf8'))
  const values = { NEXT_PUBLIC_SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' }
  for (const name of FILE_ONLY) {
    const value = file[name]
    if (!value) throw new QaGuardError(`${name} is missing from ${path}.`)
    const shell = process.env[name]
    if (shell !== undefined && shell !== value) {
      throw new QaGuardError(`${name} in your shell differs from ${path}; unset it (QA scripts read ${path} only).`)
    }
    values[name] = value
  }
  return values
}

function r2FromEnv(): R2Config | null {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) return null
  return { accountId: R2_ACCOUNT_ID, accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, bucket: R2_BUCKET }
}

export function loadQaEnv(ids: readonly PersonaId[], path = ENV_FILE): QaEnv {
  const file = fromFile(path)
  const ref = assertQaTarget({
    supabaseUrl: file.NEXT_PUBLIC_SUPABASE_URL,
    serviceKey: file.SUPABASE_SERVICE_ROLE_KEY,
    extraRefs: ids.includes('qa-invitee') ? undefined : process.env.QA_EXTRA_SUPABASE_REFS,
  })
  return {
    ref,
    supabaseUrl: file.NEXT_PUBLIC_SUPABASE_URL,
    serviceKey: file.SUPABASE_SERVICE_ROLE_KEY,
    siteUrl: resolveSiteUrl(process.env.QA_SITE_URL, ref),
    r2: r2FromEnv(),
  }
}
