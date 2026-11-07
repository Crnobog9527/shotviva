import type { IncomingMessage } from 'node:http'

import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match'
import { matchHas } from 'next/dist/shared/lib/router/utils/prepare-destination'
import { describe, expect, it } from 'vitest'

import { legacyUserRedirects } from './legacy-redirects'

// Where Next.js sends a request with these rules, as next.config `redirects()` does: the first
// rule whose source and `has` match wins; their params fill the destination. null = no rule.
function redirectFor(pathname: string, query: Record<string, string> = {}): string | null {
  const req = { headers: {} } as IncomingMessage
  for (const rule of legacyUserRedirects()) {
    const params = getPathMatch(rule.source, { strict: true, removeUnnamedParams: true })(pathname)
    const has = params ? matchHas(req, query, rule.has) : false
    if (params && has) return rule.destination.replace(/:(\w+)/g, (_, key: string) => String({ ...params, ...has }[key]))
  }
  return null
}

const ID = '3f2b8c1e-9a4d-4e7b-8c21-5d6f7a8b9c0d'
const JOB = '0b6f3f0e-5d1c-4c47-9a49-6a3f6f8d2e11'

describe.each([
  ['en', ''],
  ['zh', '/zh'],
] as const)('old user detail addresses in %s (T77)', (_locale, prefix) => {
  it('/admin/users/<id> → the dialog on the list', () => {
    expect(redirectFor(`${prefix}/admin/users/${ID}`)).toBe(`${prefix}/admin/users?user=${ID}`)
  })

  it('carries a lookup’s job over as the dialog’s highlighted job', () => {
    expect(redirectFor(`${prefix}/admin/users/${ID}`, { job: JOB })).toBe(`${prefix}/admin/users?user=${ID}&userJob=${JOB}`)
    expect(redirectFor(`${prefix}/admin/users/${ID}`, { job: 'nope' })).toBe(`${prefix}/admin/users?user=${ID}`)
  })

  it('leaves the list and 可疑注册 alone', () => {
    expect(redirectFor(`${prefix}/admin/users`)).toBeNull()
    expect(redirectFor(`${prefix}/admin/users/suspicious`)).toBeNull()
  })
})
