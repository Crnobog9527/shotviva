import { describe, expect, it } from 'vitest'

import { publicEntries, reachableSources } from './public-css-sources-lib'

const root = process.cwd()

describe('public pages stylesheet sources', () => {
  it('starts from the marketing and sign-in routes and the root files', () => {
    const entries = publicEntries(root).map((file) => file.slice(root.length + 1))
    expect(entries).toContain('src/app/[locale]/(marketing)/page.tsx')
    expect(entries).toContain('src/app/[locale]/(auth)/login/page.tsx')
    expect(entries).toContain('src/app/[locale]/layout.tsx')
    expect(entries).toContain('src/app/global-not-found.tsx')
  })

  it('follows dynamic imports and never reaches the signed-in app or the admin screens', () => {
    const files = reachableSources(root)
    // The home generator loads its template picker with import().
    expect(files).toContain('src/modules/image/home/template-picker.tsx')
    expect(files.filter((file) => file.startsWith('src/app/[locale]/(app)/'))).toEqual([])
    // Helpers under core/admin may be shared (plain .ts); its components may not.
    expect(files.filter((file) => file.startsWith('src/core/admin/') && file.endsWith('.tsx'))).toEqual([])
  })

  it('stops at the template panel, which brings the app sheet with it', () => {
    const files = reachableSources(root)
    expect(files.filter((file) => file.startsWith('src/modules/image/home/panel/'))).not.toContain('src/modules/image/home/panel/template-panel.tsx')
    // Create's dialog parts reach the public pages only through the panel.
    expect(files).not.toContain('src/modules/image/workspace/set-create-dialog.tsx')
    expect(files).not.toContain('src/modules/image/workspace/create-sheet.tsx')
  })
})
