import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const script = fileURLToPath(new URL('./has-code-changes.sh', import.meta.url))
const classify = (...paths: string[]) => execFileSync('bash', [script], { input: paths.join('\n') }).toString().trim()

// CI skips build, tests and Supabase only for docs/spec-only pull requests (.github/actions/changes).
describe('has-code-changes.sh', () => {
  it('calls docs and spec paths docs-only', () => {
    expect(classify('规范/AGENTS.md', 'seo资料/Shotviva建站规格v2.md', 'docs/x.png', 'design/comps/a.html', 'README.md', 'src/app/fonts/README.md')).toBe('false')
  })

  it('calls anything else code', () => {
    expect(classify('规范/TASKS.md', 'src/proxy.ts')).toBe('true')
    expect(classify('.github/workflows/ci.yml')).toBe('true')
    expect(classify('supabase/migrations/0200_x.sql')).toBe('true')
    expect(classify('package.json')).toBe('true')
    expect(classify('src/site/messages/en.json')).toBe('true')
  })

  it('runs everything when the list is empty', () => {
    expect(classify()).toBe('true')
    expect(classify('', '')).toBe('true')
  })
})
