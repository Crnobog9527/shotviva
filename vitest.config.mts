import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': fromRoot('./src'),
      // `server-only` throws outside a React Server environment; tests run in plain Node.
      'server-only': fromRoot('./tests/stubs/server-only.ts'),
    },
  },
  test: {
    // next-intl's ESM build imports 'next/navigation' without an extension; inlining lets Vite
    // resolve it the way Next does.
    server: { deps: { inline: ['next-intl'] } },
    projects: [
      {
        extends: true,
        test: { name: 'pricing-release', include: ['tests/release/*.test.ts'], environment: 'node' },
      },
      {
        extends: true,
        test: { name: 'unit', env: { NEXT_PUBLIC_PRICING_CATALOG_VERSION: 'v2' }, include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'], environment: 'node' },
      },
      {
        // Runs against a real local Supabase (`supabase start`), never a mock (AGENTS §7).
        extends: true,
        test: { name: 'db', include: ['tests/db/**/*.test.ts'], environment: 'node' },
      },
    ],
  },
})
