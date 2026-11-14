import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// The proxy's matcher is a regex in a string (Next reads it statically, so it cannot be imported
// without the proxy's server modules). Covers on /assets/* never touch the session (T51).
const source = readFileSync(join(process.cwd(), 'src', 'proxy.ts'), 'utf8')
const pattern = /matcher: \['(.+)'\]/.exec(source)?.[1]?.replace(/\\\\/g, '\\') ?? ''
const runsOn = (path: string) => new RegExp(`^${pattern}$`).test(path)

describe('proxy matcher', () => {
  it('skips the cover rewrite, static files and analytics', () => {
    expect(runsOn('/assets/covers/pure-white/0a1b2c.webp')).toBe(false)
    expect(runsOn('/assets/covers/x')).toBe(false)
    expect(runsOn('/ingest/e/')).toBe(false)
    expect(runsOn('/fonts/misans/misans-abc.css')).toBe(false)
    expect(runsOn('/fonts/instrument-serif/instrument-serif-0a1b2c.woff2')).toBe(false)
  })

  // T58: the locale router would otherwise rewrite these into the [locale] tree.
  it('skips the app icons and the web app manifest', () => {
    expect(runsOn('/favicon.ico')).toBe(false)
    expect(runsOn('/icon.svg')).toBe(false)
    expect(runsOn('/apple-icon.png')).toBe(false)
    expect(runsOn('/icons/icon-192.png')).toBe(false)
    expect(runsOn('/manifest.webmanifest')).toBe(false)
  })

  // T90: the version check never touches the session.
  it('skips /api/version but not the other API routes', () => {
    expect(runsOn('/api/version')).toBe(false)
    expect(runsOn('/api/versions')).toBe(true)
    expect(runsOn('/api/generate')).toBe(true)
  })

  it('still runs on pages', () => {
    expect(runsOn('/pricing')).toBe(true)
    expect(runsOn('/zh/pricing')).toBe(true)
    expect(runsOn('/generate')).toBe(true)
  })
})
