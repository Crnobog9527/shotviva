import { describe, expect, it } from 'vitest'

import { BANNER_ELEMENT_ID, CLOSED_STORAGE_KEY, isClosed, parseClosed, recordClose, versionKey } from './dismissal'
import { HIDE_CLOSED_SCRIPT, HIDE_ENDED_SCRIPT } from './dismissal-scripts'
import { localize } from './rules'
import type { AnnouncementRow } from './types'

const DAY = 86_400_000
const NOW = Date.parse('2026-11-12T08:00:00Z')
const ID = '9327fa91-cb87-4fa3-80fd-5a9f853113df'

const row: AnnouncementRow = {
  id: ID,
  message_en: 'Launch offer: up to 25% off yearly plans.',
  message_zh: '上线优惠：年付最高省 25%。',
  link_url: '/pricing',
  link_label_en: 'See plans',
  link_label_zh: '看方案',
  tone: 'promo',
  starts_at: null,
  ends_at: null,
  dismissible: true,
  reshow_after_days: 7,
}

describe('closed list', () => {
  it('stays closed until the content changes when there is no reshow time', () => {
    const store = parseClosed(recordClose(null, 'a.1', null, NOW))
    expect(isClosed(store, 'a.1', NOW + 400 * DAY)).toBe(true)
    expect(isClosed(store, 'a.2', NOW)).toBe(false)
  })

  it('comes back after the reshow days', () => {
    const store = parseClosed(recordClose(null, 'a.1', 7, NOW))
    expect(isClosed(store, 'a.1', NOW + 7 * DAY - 1)).toBe(true)
    expect(isClosed(store, 'a.1', NOW + 7 * DAY)).toBe(false)
  })

  it('drops expired entries and keeps only the newest 20', () => {
    let raw = recordClose(null, 'old.1', 1, NOW)
    raw = recordClose(raw, 'new.1', null, NOW + 2 * DAY)
    expect(Object.keys(parseClosed(raw))).toEqual(['new.1'])
    for (let i = 0; i < 30; i++) raw = recordClose(raw, `k.${i}`, null, NOW)
    const keys = Object.keys(parseClosed(raw))
    expect(keys).toHaveLength(20)
    expect(keys.at(-1)).toBe('k.29')
  })

  it('ignores garbage and keys that could break the CSS selector', () => {
    expect(parseClosed('not json')).toEqual({})
    expect(parseClosed('[1]')).toEqual({})
    expect(parseClosed(JSON.stringify({ 'a"]{}': 0, 'a.1': 'x', 'b.2': -1, 'c.3': 0 }))).toEqual({ 'c.3': 0 })
  })
})

describe('version key', () => {
  const en = () => localize(row, 'en').closeKey

  it('changes with what the visitor sees, not with the schedule or the close rule', () => {
    const base = en()
    expect(base).toMatch(new RegExp(`^${ID}\\.[0-9a-z]+$`))
    expect(localize({ ...row, starts_at: '2026-11-01T00:00:00Z', ends_at: '2026-12-01T00:00:00Z', reshow_after_days: 1 }, 'en').closeKey).toBe(base)
    expect(localize({ ...row, message_en: 'Launch offer: up to 30% off yearly plans.' }, 'en').closeKey).not.toBe(base)
    expect(localize({ ...row, link_url: '/pricing#yearly' }, 'en').closeKey).not.toBe(base)
    expect(localize({ ...row, link_label_en: 'See pricing' }, 'en').closeKey).not.toBe(base)
    expect(localize({ ...row, tone: 'info' }, 'en').closeKey).not.toBe(base)
  })

  it('is per language: fixing the Chinese text does not bring back the English banner', () => {
    expect(localize({ ...row, message_zh: '上线优惠：年付最高可省 25%。' }, 'en').closeKey).toBe(en())
    expect(localize(row, 'zh').closeKey).not.toBe(en())
  })

  it('is absent when the announcement cannot be closed', () => {
    expect(localize({ ...row, dismissible: false }, 'en').closeKey).toBeNull()
  })

  it('is stable', () => {
    expect(versionKey('x', { message: 'Hi', link: null, tone: 'info' })).toBe(versionKey('x', { message: 'Hi', link: null, tone: 'info' }))
  })
})

// The early scripts run as plain text in the HTML; run them here against a stand-in DOM.
function runScript(script: string, env: { stored: string | null; element?: { endsAt: string | null } }) {
  const styles: string[] = []
  const element = env.element ? { hidden: false, getAttribute: () => env.element?.endsAt ?? null } : null
  const document = {
    getElementById: (id: string) => (id === BANNER_ELEMENT_ID ? element : null),
    createElement: () => ({ textContent: '' }),
    head: { appendChild: (node: { textContent: string }) => styles.push(node.textContent) },
  }
  const localStorage = { getItem: (key: string) => (key === CLOSED_STORAGE_KEY ? env.stored : null) }
  new Function('document', 'localStorage', script)(document, localStorage)
  return { styles, hidden: element?.hidden ?? null }
}

describe('early scripts', () => {
  it('hides every closed, unexpired version with one style, before the banner is parsed', () => {
    const stored = JSON.stringify({ 'a.1': 0, 'b.2': Date.now() + DAY, 'c.3': Date.now() - DAY })
    const { styles } = runScript(HIDE_CLOSED_SCRIPT, { stored })
    expect(styles).toHaveLength(1)
    expect(styles[0]).toBe('.sv-ann[data-ann-key="a.1"]{display:none!important}.sv-ann[data-ann-key="b.2"]{display:none!important}')
  })

  it('adds nothing for a visitor who closed nothing, and survives a broken store', () => {
    expect(runScript(HIDE_CLOSED_SCRIPT, { stored: null }).styles).toEqual([])
    expect(runScript(HIDE_CLOSED_SCRIPT, { stored: '{' }).styles).toEqual([])
    expect(runScript(HIDE_CLOSED_SCRIPT, { stored: JSON.stringify({ 'x"]{}*{display:none': 0 }) }).styles).toEqual([])
  })

  it('agrees with recordClose', () => {
    const stored = recordClose(null, versionKey(ID, { message: 'Hi', link: null, tone: 'info' }), 7, Date.now())
    expect(runScript(HIDE_CLOSED_SCRIPT, { stored }).styles[0]).toContain(ID)
  })

  it('hides a banner whose end passed after the HTML was cached', () => {
    expect(runScript(HIDE_ENDED_SCRIPT, { stored: null, element: { endsAt: new Date(Date.now() - 1000).toISOString() } }).hidden).toBe(true)
    expect(runScript(HIDE_ENDED_SCRIPT, { stored: null, element: { endsAt: new Date(Date.now() + DAY).toISOString() } }).hidden).toBe(false)
    expect(runScript(HIDE_ENDED_SCRIPT, { stored: null, element: { endsAt: null } }).hidden).toBe(false)
  })

  // The 2026-11-12 bug: the id came from a client module and printed as undefined.
  it('names the banner element literally', () => {
    expect(HIDE_ENDED_SCRIPT).toContain(`getElementById("${BANNER_ELEMENT_ID}")`)
    expect(HIDE_ENDED_SCRIPT + HIDE_CLOSED_SCRIPT).not.toContain('undefined')
  })
})
