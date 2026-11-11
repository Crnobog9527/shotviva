import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { GENERATED, generatedCss, publicEntries, reachableSources } from './public-css-sources-lib'

const root = process.cwd()

describe('public pages stylesheet sources', () => {
  // A public page that starts importing a new file needs that file's class names in
  // globals-public.css, or the component renders unstyled on marketing and sign-in pages only.
  it('the committed list is what the import graph gives today (run `pnpm css:sources`)', () => {
    expect(readFileSync(join(root, GENERATED), 'utf8')).toBe(generatedCss(root))
  })

  it('starts from the marketing and sign-in routes and the root files', () => {
    const entries = publicEntries(root).map((file) => file.slice(root.length + 1))
    expect(entries).toContain('src/app/[locale]/(marketing)/page.tsx')
    expect(entries).toContain('src/app/[locale]/(auth)/login/page.tsx')
    expect(entries).toContain('src/app/[locale]/layout.tsx')
    expect(entries).toContain('src/app/global-not-found.tsx')
  })

  it('follows dynamic imports and never reaches the signed-in app or the admin screens', () => {
    const files = reachableSources(root)
    // The home generator loads its sign-up sheet with import().
    expect(files).toContain('src/modules/image/home/signup-sheet.tsx')
    expect(files.filter((file) => file.startsWith('src/app/[locale]/(app)/'))).toEqual([])
    // Helpers under core/admin may be shared (plain .ts); its components may not.
    expect(files.filter((file) => file.startsWith('src/core/admin/') && file.endsWith('.tsx'))).toEqual([])
  })
})
