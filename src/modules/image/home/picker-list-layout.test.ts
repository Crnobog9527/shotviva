import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

// The picker's list holds rows whose descriptions wrap. As a grid, Chrome sized each row's track at
// one line (56px) and the wrapped text spilled over the rows below it (search results, 2026-11-21).
// A flex column whose rows do not shrink lets every row take the height of its own text.
const css = readFileSync(new URL('../../../app/[locale]/(marketing)/marketing.css', import.meta.url), 'utf8')

function rule(selector: string): string {
  const match = css.match(new RegExp(`^\\s*${selector.replace(/[.[\]]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'm'))
  if (!match) throw new Error(`${selector} rule not found`)
  return match[1]
}

describe('template picker list layout', () => {
  it('the list is a flex column, not a grid', () => {
    const list = rule('.mk-pk-list')
    expect(list).toMatch(/display:\s*flex/)
    expect(list).toMatch(/flex-direction:\s*column/)
    expect(list).not.toMatch(/display:\s*grid/)
  })

  it('a row keeps its own height', () => {
    expect(rule('.mk-pk-row')).toMatch(/flex:\s*none/)
  })
})
