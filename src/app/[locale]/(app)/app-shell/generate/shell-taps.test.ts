import { describe, expect, it, vi } from 'vitest'

import { shellTapKey, tapTarget } from './shell-taps'

// A minimal element: enough of closest/getAttribute/matches/querySelector for the tap queue.
type Fake = { attrs: Record<string, string>; tag: string; parent: Fake | null; inShell: boolean; click: () => void; children: Fake[] }
function el(tag: string, attrs: Record<string, string>, parent: Fake | null = null, inShell = false): Fake {
  const node: Fake = { tag, attrs, parent, inShell, click: vi.fn(), children: [] }
  parent?.children.push(node)
  return node
}
const matches = (node: Fake, selector: string) => selector.split(',').some((one) => {
  const s = one.trim()
  const m = /^(\w+)?(?:\[([\w-]+)(?:="(.*)")?\])?$/.exec(s)
  if (!m) return s === '[data-app-shell]' ? node.inShell : false
  const [, tag, attr, value] = m
  if (tag && node.tag !== tag) return false
  if (attr === 'data-app-shell') return node.inShell
  if (attr && !(attr in node.attrs)) return false
  return value === undefined || node.attrs[attr!] === value.replace(/\\(.)/g, '$1')
})
function asElement(node: Fake): Element {
  return {
    getAttribute: (name: string) => node.attrs[name] ?? null,
    matches: (selector: string) => matches(node, selector),
    closest: (selector: string) => { for (let n: Fake | null = node; n; n = n.parent) if (matches(n, selector)) return asElement(n); return null },
    querySelector: (selector: string) => { const found = node.children.find((child) => matches(child, selector)); return found ? asElement(found) : null },
    click: node.click,
  } as unknown as Element
}
const root = (nodes: Fake[]) => ({ querySelectorAll: (selector: string) => nodes.filter((n) => matches(n, selector)).map(asElement) }) as unknown as ParentNode

describe('taps on the app shell', () => {
  it('keys a tap by the card it landed in, else a link or a named button', () => {
    const card = el('button', { 'data-card': 'series:art', 'aria-label': 'Art' })
    const inside = el('span', {}, card)
    expect(shellTapKey(asElement(inside))).toBe('card:series:art')
    expect(shellTapKey(asElement(el('a', { href: '/photos' })))).toBe('href:/photos')
    expect(shellTapKey(asElement(el('div', {})))).toBeNull()
    expect(shellTapKey(null)).toBeNull()
  })

  it('replays on the real page’s element, never on one still inside the shell', () => {
    const inShell = el('button', { 'data-card': 'tpl-1' }, null, true)
    const real = el('button', { 'data-card': 'tpl-1' })
    expect((tapTarget(root([inShell, real]), 'card:tpl-1') as unknown as { click: unknown }).click).toBe(real.click)
    expect(tapTarget(root([inShell]), 'card:tpl-1')).toBeNull()
    expect(tapTarget(root([real]), 'card:other')).toBeNull()
  })

  it('a card that is not a button (the Art Styles compare) replays on its dialog button', () => {
    const card = el('div', { 'data-card': 'tpl-art' })
    const dialog = el('button', { 'aria-haspopup': 'dialog' }, card)
    expect((tapTarget(root([card]), 'card:tpl-art') as unknown as { click: unknown }).click).toBe(dialog.click)
  })
})
