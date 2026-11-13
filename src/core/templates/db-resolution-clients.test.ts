import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// Until the contract migration renames the top tier in the database, a Supabase client without
// withDbTiers sends '4k' where the database expects '3k' (and reads '3k' the site no longer
// knows). Every client the app and its scripts create must take the tier fetch.
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sources(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

describe('Supabase clients and the tier fetch', () => {
  it('passes withDbTiers to every client created in src and scripts', () => {
    const missing = ['src', 'scripts'].flatMap(sources).flatMap((path) => {
      const text = readFileSync(path, 'utf8')
      const calls = [...text.matchAll(/\bcreate(?:Server|Browser)?Client\(/g)]
      // Each call's options must name the fetch within the next few lines.
      return calls.filter((call) => !text.slice(call.index, call.index + 400).includes('withDbTiers')).map(() => path)
    })
    expect(missing).toEqual([])
  })
})
