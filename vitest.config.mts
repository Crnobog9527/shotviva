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
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['src/**/*.test.ts'], environment: 'node' },
      },
      {
        // Runs against a real local Supabase (`supabase start`), never a mock (AGENTS §7).
        extends: true,
        test: { name: 'db', include: ['tests/db/**/*.test.ts'], environment: 'node' },
      },
    ],
  },
})
