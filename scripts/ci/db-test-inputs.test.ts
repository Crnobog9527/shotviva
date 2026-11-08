import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { dbTestClosure, needsDbTests } from './db-test-inputs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const script = fileURLToPath(new URL('./db-test-inputs.ts', import.meta.url))
const needs = (...paths: string[]) => needsDbTests(root, paths)

// "supabase db tests" runs only when a change can affect it (.github/actions/changes, T88).
describe('db-test-inputs', () => {
  it('runs for the database, the DB tests and the CI that runs them', () => {
    expect(needs('supabase/migrations/0900_x.sql')).toBe(true)
    expect(needs('supabase/schema.sql')).toBe(true)
    expect(needs('supabase/config.toml')).toBe(true)
    expect(needs('src/core/billing/x.sql')).toBe(true)
    expect(needs('tests/db/credits.test.ts')).toBe(true)
    expect(needs('pnpm-lock.yaml')).toBe(true)
    expect(needs('.github/workflows/ci.yml')).toBe(true)
    expect(needs('.github/actions/supabase-start/action.yml')).toBe(true)
    expect(needs('scripts/db-schema.ts')).toBe(true)
  })

  it('runs for code the DB tests import, directly or through other files', () => {
    const closure = dbTestClosure(root)
    expect(closure.has('tests/db/helpers.ts')).toBe(true)
    expect(closure.has('src/core/billing/index.ts')).toBe(true)
    expect(closure.has('src/site/site.config.ts')).toBe(true)
    expect(closure.has('tests/fakes/memory-store.ts')).toBe(true)
    expect(needs('src/site/site.config.ts')).toBe(true)
  })

  it('skips pages, components, messages and unit tests', () => {
    expect(needs('src/app/[locale]/(marketing)/page.tsx', 'src/site/messages/en.json')).toBe(false)
    expect(needs('src/app/globals.css', 'public/og.png', 'README.md')).toBe(false)
    expect(needs('scripts/qa/reset.ts', 'scripts/seo-check.ts')).toBe(false)
    expect(needs('.github/workflows/lighthouse.yml')).toBe(false)
    expect(dbTestClosure(root).has('src/app/layout.tsx')).toBe(false)
  })

  it('runs when the list is empty, and works as a CLI on plain Node', () => {
    expect(needs()).toBe(true)
    expect(needs('', ' ')).toBe(true)
    const run = (input: string) =>
      execFileSync('node', ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', script], { input }).toString().trim()
    expect(run('src/app/globals.css\n')).toBe('false')
    expect(run('supabase/migrations/0900_x.sql\n')).toBe('true')
  })
})
