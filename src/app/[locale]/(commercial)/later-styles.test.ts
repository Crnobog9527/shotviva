import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('the commercial page stylesheet', () => {
  it('uses the content hash in its immutable URL', () => {
    const loader = readFileSync(join(process.cwd(), 'src/app/[locale]/(commercial)/later-styles.tsx'), 'utf8')
    const name = loader.match(/content-([a-f0-9]{16})\.css/)?.[0]
    expect(name).toBeTruthy()
    const bytes = readFileSync(join(process.cwd(), 'public/marketing-styles', name!))
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16)
    expect(name).toBe(`content-${hash}.css`)
  })

  it('keeps the pilot styles in sync with the original marketing sheet', () => {
    const folder = join(process.cwd(), 'src/app/[locale]')
    const original = readFileSync(join(folder, '(marketing)/marketing.css'), 'utf8')
    const begin = original.indexOf('  /* FAQ: <details>')
    const end = original.indexOf('  @media (hover: hover) {', begin)
    expect(begin).toBeGreaterThan(0)
    expect(end).toBeGreaterThan(begin)
    const pilot = (original.slice(0, begin) + original.slice(end))
      .replace('    .mk-faq summary:hover .mk-pm, .mk-links a:hover .mk-go { background: var(--wash-strong); }\n', '')
      .replace('    .mk-links a:hover { box-shadow: inset 0 0 0 1px var(--input); }\n', '')
      .replace('    .mk-links { grid-template-columns: 1fr 1fr; }\n', '')
      .replace('.mk-steps, .mk-facts, .mk-free, .mk-faq, .mk-links { margin-top: 0; }', '.mk-steps, .mk-facts, .mk-free { margin-top: 0; }')
    expect(readFileSync(join(folder, '(commercial)/pilot-marketing.css'), 'utf8')).toBe(pilot)
    const late = readFileSync(join(process.cwd(), 'public/marketing-styles/content-ab17d6d99047e548.css'), 'utf8')
    expect(late).toContain(original.slice(begin, end))
  })
})
