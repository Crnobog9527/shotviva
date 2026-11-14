import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match'
import { describe, expect, it } from 'vitest'

import { legacyHelpRedirects } from './legacy-redirects'

// Where Next.js sends a path with these rules: the first matching source wins, its params fill
// the destination (as next.config `redirects()` does). null = no rule matches.
function redirectFor(pathname: string): string | null {
  for (const rule of legacyHelpRedirects()) {
    const params = getPathMatch(rule.source, { strict: true, removeUnnamedParams: true })(pathname)
    if (params) return rule.destination.replace(/:(\w+)/g, (_, key: string) => String(params[key]))
  }
  return null
}

const ID = '3f2b8c1e-9a4d-4e7b-8c21-5d6f7a8b9c0d'

describe.each([
  ['en', ''],
  ['zh', '/zh'],
] as const)('old Help & feedback addresses in %s (T68)', (_locale, prefix) => {
  it('/account/help → My tickets', () => {
    expect(redirectFor(`${prefix}/account/help`)).toBe(`${prefix}/account?help=list`)
  })

  it('/account/help/new → New ticket', () => {
    expect(redirectFor(`${prefix}/account/help/new`)).toBe(`${prefix}/account?help=new`)
  })

  it('/account/help/<id> → that ticket, whatever the case', () => {
    expect(redirectFor(`${prefix}/account/help/${ID}`)).toBe(`${prefix}/account?help=${ID}`)
    expect(redirectFor(`${prefix}/account/help/${ID.toUpperCase()}`)).toBe(`${prefix}/account?help=${ID.toUpperCase()}`)
  })

  it.each(['not-an-id', `${ID}x`, `${ID}/more`, 'new/more', '123'])('/account/help/%s → My tickets', (rest) => {
    expect(redirectFor(`${prefix}/account/help/${rest}`)).toBe(`${prefix}/account?help=list`)
  })

  it('leaves the account page and its neighbours alone', () => {
    expect(redirectFor(`${prefix}/account`)).toBeNull()
    expect(redirectFor(`${prefix}/account/helpful`)).toBeNull()
    expect(redirectFor(`${prefix}/help`)).toBeNull()
  })
})

it('is temporary (307), so the dialog URL can change later without stuck browser caches', () => {
  expect(legacyHelpRedirects().every((rule) => rule.permanent === false)).toBe(true)
})
