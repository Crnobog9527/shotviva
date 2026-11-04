import { z } from 'zod'

// Client-safe variables only. Next.js inlines NEXT_PUBLIC_* at build time solely
// when referenced as literal `process.env.NEXT_PUBLIC_X`, so each key is spelled out.
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url().default('http://localhost:3000'),
})

export type PublicEnv = z.infer<typeof publicEnvSchema>

export const publicEnv: PublicEnv = publicEnvSchema.parse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
})
