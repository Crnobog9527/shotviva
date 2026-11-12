import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { APP_ONLY_APP_KEYS, APP_ONLY_NAMESPACES, clientMessages, publicClientMessages } from '@/core/i18n'
import { loadMessages } from '@/site/i18n/messages'

// The root layout hands public pages fewer messages than the app gets (core/i18n/client-messages.ts).
// A client component on a public page that reads a left-out key would show the raw key, so this
// walks the imports from every public route (and the root layout, error and not-found pages) and
// fails if code that ends up in the browser there uses one.
const SRC = resolve(__dirname, '..')
const PUBLIC_ENTRIES = ['app/[locale]/layout.tsx', 'app/[locale]/error.tsx', 'app/[locale]/not-found.tsx', 'app/global-not-found.tsx', 'app/[locale]/(marketing)', 'app/[locale]/(auth)']
const SUFFIXES = ['', '.tsx', '.ts', '/index.tsx', '/index.ts']

function filesIn(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === '(app)' ? [] : filesIn(path)
    return /\.tsx?$/.test(name) && !name.includes('.test.') ? [path] : []
  })
}

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null
  if (!base) return null
  const found = SUFFIXES.map((suffix) => base + suffix).find((path) => existsSync(path) && statSync(path).isFile())
  return found && !found.includes('.test.') ? found : null
}

// Files that run in the browser: 'use client' ones and everything they import (barrels included,
// which over-counts and so only makes the check stricter).
function publicClientFiles(): Map<string, string> {
  const start = PUBLIC_ENTRIES.map((entry) => join(SRC, entry)).flatMap((path) => (statSync(path).isDirectory() ? filesIn(path) : [path]))
  const client = new Map<string, string>()
  const visited = new Map<string, boolean>()
  const queue: Array<[string, boolean]> = start.map((file) => [file, false])
  while (queue.length > 0) {
    const [file, parentClient] = queue.shift() as [string, boolean]
    const text = readFileSync(file, 'utf8')
    const isClient = parentClient || /^['"]use client['"]/m.test(text.slice(0, 200))
    if (visited.get(file) === true || (visited.has(file) && !isClient)) continue
    visited.set(file, isClient)
    if (isClient) client.set(relative(SRC, file), text)
    for (const match of text.matchAll(/(?:from\s+|import\(\s*|import\s+)['"]([^'"]+)['"]/g)) {
      const next = resolveImport(file, match[1])
      if (next) queue.push([next, isClient])
    }
  }
  return client
}

describe('messages on public pages', () => {
  const files = publicClientFiles()

  it('reaches the public client code (sanity: the generator, the sign-in forms, the paywall)', () => {
    const names = [...files.keys()].join('\n')
    expect(names).toContain('core/auth/ui/login-form.tsx')
    expect(names).toContain('modules/image/home/home-generator.tsx')
    expect(names).toContain('core/billing/paywall/pricing-plans.tsx')
  })

  it('no public client code reads a namespace or app subtree the root layout leaves out', () => {
    const offenders: string[] = []
    for (const [file, text] of files) {
      for (const ns of APP_ONLY_NAMESPACES) if (new RegExp(`useTranslations\\(\\s*['"]${ns}[.'"]`).test(text)) offenders.push(`${file}: ${ns}`)
      for (const key of APP_ONLY_APP_KEYS) {
        // A key path inside the subtree ('result.title', `photos.${x}`), from any t, or a namespace into it.
        if (new RegExp(`['"\`]${key}\\.[A-Za-z$]|useTranslations\\(\\s*['"]app\\.${key}[.'"]`).test(text)) offenders.push(`${file}: app.${key}`)
      }
      if (/\buseMessages\(/.test(text)) offenders.push(`${file}: useMessages`)
    }
    expect(offenders).toEqual([])
  })
})

describe('publicClientMessages', () => {
  it('is clientMessages without the app-only namespaces and app subtrees, in both languages', async () => {
    for (const locale of ['en', 'zh'] as const) {
      const all = await loadMessages(locale)
      const client = clientMessages(all)
      const pub = publicClientMessages(all) as Record<string, Record<string, unknown>>
      for (const ns of APP_ONLY_NAMESPACES) expect(pub).not.toHaveProperty(ns)
      for (const key of APP_ONLY_APP_KEYS) {
        expect(all.app).toHaveProperty(key) // a renamed subtree must be renamed here too
        expect(pub.app).not.toHaveProperty(key)
      }
      expect(Object.keys(pub)).toEqual(Object.keys(client).filter((ns) => !(APP_ONLY_NAMESPACES as readonly string[]).includes(ns)))
      expect(pub.app.workspace).toEqual((client.app as Record<string, unknown>).workspace)
      expect(JSON.stringify(pub).length).toBeLessThan(JSON.stringify(client).length * 0.7)
    }
  })
})
