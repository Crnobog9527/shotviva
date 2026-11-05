import 'server-only'
import { z } from 'zod'

// Server-side variables. Later task cards add their keys here; nothing else
// in the codebase may read process.env directly (enforced by ESLint).
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Optional at parse time so `next build` runs without secrets; createAdminSupabase() requires it.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
})

export type ServerEnv = z.infer<typeof serverEnvSchema>

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source)
  if (!result.success) {
    // Report key names only; values may be secrets.
    const keys = result.error.issues.map((issue) => issue.path.join('.')).join(', ')
    throw new Error(`Invalid server environment: ${keys}`)
  }
  return result.data
}

let cached: ServerEnv | undefined

export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env)
  return cached
}
