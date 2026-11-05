import { z } from 'zod'

// Client-safe variables only. Next.js inlines NEXT_PUBLIC_* at build time solely
// when referenced as literal `process.env.NEXT_PUBLIC_X`, so each key is spelled out.
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url().default('http://localhost:3000'),
  // Local `supabase start` defaults, so builds and tests work without a .env.local.
  NEXT_PUBLIC_SUPABASE_URL: z.url().default('http://127.0.0.1:54321'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().default(''),
  // Empty means captcha is off (local dev); Supabase Auth enforces it when configured there.
  NEXT_PUBLIC_HCAPTCHA_SITEKEY: z.string().default(''),
})

export type PublicEnv = z.infer<typeof publicEnvSchema>

export const publicEnv: PublicEnv = publicEnvSchema.parse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_HCAPTCHA_SITEKEY: process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY,
})
