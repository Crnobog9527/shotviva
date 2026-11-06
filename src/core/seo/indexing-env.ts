import { z } from 'zod'

// The pre-launch indexing switch (ARCHITECTURE §12.0). Plain module (no `server-only`, no path
// aliases) because next.config.ts reads it at build time for the X-Robots-Tag rules; core/env.ts
// merges the schema so the server env names the key too.
const blankAsUnset = (value: unknown) => (value === '' ? undefined : value)

export const indexingEnvSchema = z.object({
  SITE_INDEXING: z.preprocess(blankAsUnset, z.enum(['on', 'off']).default('off')),
})

const switchSchema = indexingEnvSchema.extend({
  VERCEL_ENV: z.preprocess(blankAsUnset, z.enum(['production', 'preview', 'development']).optional()),
})

export type IndexingEnv = z.infer<typeof switchSchema>

export function parseIndexingEnv(source: Record<string, string | undefined>): IndexingEnv {
  const result = switchSchema.safeParse(source)
  if (!result.success) {
    const keys = result.error.issues.map((issue) => issue.path.join('.')).join(', ')
    throw new Error(`Invalid indexing environment: ${keys}`)
  }
  return result.data
}

// Open only when explicitly switched on in Vercel Production; previews and local runs are
// always closed, whatever SITE_INDEXING says.
export function indexingOpen(env: IndexingEnv): boolean {
  return env.SITE_INDEXING === 'on' && env.VERCEL_ENV === 'production'
}

export const NOINDEX_HEADER = { key: 'X-Robots-Tag', value: 'noindex, nofollow' } as const

// Hosts other than the canonical domain (*.vercel.app, previews) are never indexed, even
// after launch (ARCHITECTURE §12.0).
export function noindexForHost(open: boolean, host: string | null, canonicalHost: string): boolean {
  return !open || host !== canonicalHost
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// next.config.ts headers(): every response while closed; once open, every host but the
// canonical one. The proxy repeats this on the responses it creates itself (redirects, 404s).
export function xRobotsTagRules(open: boolean, canonicalHost: string) {
  const headers = [{ ...NOINDEX_HEADER }]
  if (!open) return [{ source: '/:path*', headers }]
  return [{ source: '/:path*', missing: [{ type: 'host' as const, value: escapeRegex(canonicalHost) }], headers }]
}
