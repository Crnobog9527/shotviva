import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

// createSessionSupabase() writes the session cookies and may refresh the session. In a Server
// Component the cookie write is silently dropped (setAll cannot write there), which is exactly
// how a rotated refresh token gets lost and the user signed out (ARCHITECTURE §7「会话校验」).
// So only the flows that change the session itself, all Server Actions or route handlers, may use
// it; everything else reads through createServerSupabase(), which never refreshes. A new caller
// belongs on this list only if it runs where cookies can be written.
const ALLOWED = new Set([
  'src/core/auth/supabase-server.ts',
  'src/core/auth/delete-account-route.ts',
  'src/core/auth/flows/account-locale.ts',
  'src/core/auth/flows/phone.ts',
  'src/core/auth/flows/sign-in.ts',
  'src/core/auth/flows/sign-up.ts',
])

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : []
  })
}

describe('createSessionSupabase stays out of Server Components', () => {
  it('is used only by the session flows that run in actions and route handlers', () => {
    const users = sources('src')
      .map((path) => relative(process.cwd(), path))
      .filter((path) => readFileSync(path, 'utf8').includes('createSessionSupabase'))
    expect(users.filter((path) => !ALLOWED.has(path))).toEqual([])
  })

  it('is not re-exported from the auth entry points', () => {
    for (const entry of ['src/core/auth/index.ts', 'src/core/auth/proxy.ts']) {
      expect(readFileSync(entry, 'utf8'), entry).not.toContain('createSessionSupabase')
    }
  })

  it('every allowed caller is a Server Action or route-handler module, never a component', () => {
    for (const path of ALLOWED) {
      expect(path.endsWith('.tsx'), path).toBe(false)
      const text = readFileSync(path, 'utf8')
      expect(text.includes("'use client'"), path).toBe(false)
    }
  })
})
