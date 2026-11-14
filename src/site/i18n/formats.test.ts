import { describe, expect, it } from 'vitest'

import en from '../messages/en.json'
import zh from '../messages/zh.json'
import { MESSAGE_FORMATS } from './formats'

// Every message string, at any depth.
function strings(node: unknown): string[] {
  if (typeof node === 'string') return [node]
  if (node && typeof node === 'object') return Object.values(node).flatMap(strings)
  return []
}

// `{arg, date|time|number, style}` with a named style (a `::skeleton` compiles to its own options).
const NAMED_STYLE = /\{\s*\w+\s*,\s*(date|time|number)\s*,\s*([A-Za-z][\w-]*)\s*\}/g

describe('MESSAGE_FORMATS', () => {
  it('defines every named date, time or number style a message uses (the precompiled formatter knows no others)', () => {
    const used = new Set<string>()
    for (const text of [...strings(en), ...strings(zh)]) for (const [, kind, style] of text.matchAll(NAMED_STYLE)) used.add(`${kind === 'number' ? 'number' : 'dateTime'}.${style}`)
    expect(used.size).toBeGreaterThan(0)
    const formats = MESSAGE_FORMATS as Record<string, Record<string, unknown> | undefined>
    for (const key of used) {
      const [group, style] = key.split('.') as [string, string]
      expect(formats[group]?.[style], key).toBeDefined()
    }
  })

  it('keeps medium as the ICU formatter defines it', () => {
    expect(new Intl.DateTimeFormat('zh-Hans', MESSAGE_FORMATS.dateTime.medium).format(new Date(Date.UTC(2026, 10, 14, 12)))).toBe('2026年11月14日')
    expect(new Intl.DateTimeFormat('en', MESSAGE_FORMATS.dateTime.medium).format(new Date(Date.UTC(2026, 10, 14, 12)))).toBe('Nov 14, 2026')
  })
})
