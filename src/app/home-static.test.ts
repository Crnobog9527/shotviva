import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const code = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

// Public pages prerender fully static (2026-11-28): a request-time read on one makes the whole page
// wait for a function in sfo1 before it can hydrate, about 1 s behind its HTML from mainland China.
// What a signed-in visitor adds comes from the browser, once it finds a session cookie.
describe('public pages read nothing at request time', () => {
  const pages = ['src/app/[locale]/nav-account-slot.tsx', 'src/app/[locale]/(marketing)/home-generator-slot.tsx', 'src/app/[locale]/(marketing)/pricing/page.tsx']

  it('the top bar, the home generator and /pricing have no session read, connection() or Suspense hole', () => {
    for (const page of pages) {
      const source = code(page)
      expect(source, page).not.toMatch(/getSessionUser|connection\(\)|cookies\(\)|headers\(\)|<Suspense|StandingSlot/)
    }
  })

  it('the home generator waits unsettled, then settles as a guest or is replaced by the member one', () => {
    const gate = code('src/app/[locale]/(marketing)/home-viewer-gate.tsx')
    expect(gate).toMatch(/if \(!signedIn\) return/)
    expect(gate).toMatch(/fetch\(`\/api\/home\/viewer\?locale=\$\{locale\}`/)
    expect(gate).toMatch(/settled=\{hydrated && !waiting\}/)
  })

  // Review of #1004: a signed-in visitor's first screen must not go empty, and what they do on the
  // signed-out generator must not be lost or start the signed-out flow.
  it('the member generator replaces the first one only with its code and data both in, and the first one is inert meanwhile', () => {
    const gate = code('src/app/[locale]/(marketing)/home-viewer-gate.tsx')
    expect(gate).toMatch(/await Promise\.all\(\[\s*fetch\([\s\S]*?import\('\.\/home-member-generator'\),\s*\]\)/)
    expect(gate).not.toMatch(/next\/dynamic/)
    expect(gate).toMatch(/const waiting = signedIn && ready === null/)
    expect(gate).toMatch(/inert=\{waiting\}/)
  })

  it('the routes they ask are for the signed-in caller only', () => {
    for (const route of ['src/app/api/home/viewer/route.ts', 'src/app/api/account/standing/route.ts']) {
      const source = code(route)
      expect(source, route).toMatch(/const user = await requireApiUser\(\)/)
      expect(source, route).toMatch(/\(user\.id\)/)
    }
  })

  it('client code takes the answer shape from the types-only file', () => {
    for (const file of ['src/app/[locale]/(marketing)/home-viewer-gate.tsx', 'src/app/[locale]/(marketing)/home-member-generator.tsx']) {
      expect(code(file), file).not.toMatch(/home-viewer'/)
    }
    expect(code('src/app/home-member.ts')).not.toMatch(/^import (?!type)/m)
  })
})
