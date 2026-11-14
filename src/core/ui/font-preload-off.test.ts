import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// No page preloads a font (geist-fonts.tsx says why: Chrome holds the first paint for it). Every
// face has a metric-matched fallback, so a font arriving after the first paint moves nothing.
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : []
  })
}

describe('font preloads', () => {
  it('appear in no component', () => {
    const offenders = sources(join(process.cwd(), 'src')).filter((file) => /as=["{']*font\b|as:\s*['"]font['"]/.test(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })
})
