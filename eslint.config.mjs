import { existsSync, readdirSync } from 'node:fs'

import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

// Layer rules (AGENTS §3, ARCHITECTURE §1):
//   app -> site | modules | core;  modules -> core;  core -> nothing above it;
//   modules never import each other; outsiders use a module's index.ts only.
// `no-restricted-imports` catches alias specifiers; `import/no-restricted-paths`
// resolves files, so relative escapes like '../../modules/x' are caught too.

const moduleIds = existsSync('src/modules')
  ? readdirSync('src/modules', { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  : []

const crossModuleZones = moduleIds.map((id) => ({
  target: `./src/modules/${id}`,
  from: './src/modules',
  except: [`./${id}`],
  message: 'Modules must not import each other.',
}))

const layerZones = [
  {
    target: './src/core',
    from: ['./src/modules', './src/site', './src/app'],
    message: 'core must not import modules, site or app; use the module registry.',
  },
  {
    target: './src/modules',
    from: ['./src/site', './src/app'],
    message: 'modules may only import core.',
  },
  {
    target: './src/site',
    from: ['./src/modules', './src/app'],
    message: 'site may only import core.',
  },
]

// ARCHITECTURE §16: pages and routes call track()/captureError(); only core/analytics
// talks to the SDKs (re-allowed for that folder below).
const analyticsSdkImport = {
  group: ['posthog-js', 'posthog-js/**', 'posthog-node', '@sentry/*', '@sentry/*/**'],
  message: "Use '@/core/analytics' (server) or '@/core/analytics/browser'; SDKs stay inside core/analytics.",
}

const coreUpwardImport = {
  group: ['@/modules', '@/modules/**', '@/site', '@/site/**', '@/app', '@/app/**'],
  message: 'core must not import modules, site or app; use the module registry.',
}

const deepModuleImport = {
  group: ['@/modules/*/**'],
  message: "Import a module through its index.ts ('@/modules/<id>'), not its internals.",
}

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'next-env.d.ts',
    // Static design comps (T6): reference HTML/JS, not app code.
    'design/**',
    // Generated files are exempt from size rules (AGENTS §3.1).
    'src/**/*.generated.ts',
    'src/**/database.types.ts',
  ]),
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
      complexity: ['error', 10],
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message: 'Read environment variables through core/env.ts or core/public-env.ts.',
        },
      ],
      'no-restricted-imports': ['error', { patterns: [deepModuleImport, analyticsSdkImport] }],
      'import/no-restricted-paths': ['error', { zones: [...layerZones, ...crossModuleZones] }],
    },
  },
  {
    // React components get more room for JSX (AGENTS §3.1).
    files: ['src/**/*.tsx'],
    rules: {
      'max-lines-per-function': ['error', { max: 120, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['src/core/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns: [coreUpwardImport, analyticsSdkImport] }] },
  },
  {
    files: ['src/core/analytics/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns: [coreUpwardImport] }] },
  },
  {
    files: ['src/modules/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // Inside a module use relative imports; any alias into modules/ is another module.
              group: ['@/modules', '@/modules/**', '@/site', '@/site/**', '@/app', '@/app/**'],
              message: 'modules may only import core, never other modules, site or app.',
            },
            analyticsSdkImport,
          ],
        },
      ],
    },
  },
  {
    files: ['src/site/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/modules', '@/modules/**', '@/app', '@/app/**'],
              message: 'site may only import core.',
            },
            analyticsSdkImport,
          ],
        },
      ],
    },
  },
  {
    // The two env readers are the only places allowed to touch process.env.
    files: ['src/core/env.ts', 'src/core/public-env.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
])
