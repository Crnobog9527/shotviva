import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, it, vi } from 'vitest'

import { loadQaEnv } from './env'
import { PREVIEW_REF } from './target'

it('restricts qa-invitee to the configured preview project before reset or login', () => {
  const dir = mkdtempSync(join(tmpdir(), 't94-qa-env-'))
  const file = join(dir, '.env.local')
  const other = 'abcdefghijklmnopqrst'
  try {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', undefined)
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', undefined)
    vi.stubEnv('QA_SITE_URL', undefined)
    vi.stubEnv('QA_EXTRA_SUPABASE_REFS', other)
    const write = (ref: string) => writeFileSync(file, `NEXT_PUBLIC_SUPABASE_URL=https://${ref}.supabase.co\nSUPABASE_SERVICE_ROLE_KEY=sb_secret_fixture\n`)
    write(other)
    expect(() => loadQaEnv(['qa-invitee'], file)).toThrow(/Refusing to run/)
    expect(loadQaEnv(['qa-free'], file).ref).toBe(other)
    write(PREVIEW_REF)
    expect(loadQaEnv(['qa-invitee'], file).ref).toBe(PREVIEW_REF)
  } finally {
    rmSync(dir, { recursive: true, force: true })
    vi.unstubAllEnvs()
  }
})
