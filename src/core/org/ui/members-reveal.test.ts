import { describe, expect, it, vi } from 'vitest'

vi.mock('@/core/ui/button', () => ({ Button: () => null }))
vi.mock('@/core/ui/checkbox', () => ({ Checkbox: () => null }))

const { revealInList } = await import('./members-panel')

const list = (scrollTop: number, clientHeight = 300) => ({ scrollTop, clientHeight })
const row = (offsetTop: number, offsetHeight: number, parent: object) => ({ offsetTop, offsetHeight, parentElement: parent }) as unknown as HTMLElement

describe('revealInList (scrolls the list container only)', () => {
  it('scrolls down just enough to show a row below the visible part', () => {
    const l = list(0)
    revealInList(row(400, 100, l))
    expect(l.scrollTop).toBe(200)
  })
  it('scrolls up to a row above the visible part', () => {
    const l = list(500)
    revealInList(row(120, 80, l))
    expect(l.scrollTop).toBe(120)
  })
  it('does nothing for a row already visible, or for no row', () => {
    const l = list(100)
    revealInList(row(150, 80, l))
    revealInList(null)
    expect(l.scrollTop).toBe(100)
  })
})
