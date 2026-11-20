import type { Hit, Inline } from './types'
import { safeImage, safeLink } from './url'

// Inline syntax: `code`, **strong**, *em*, [text](url), ![alt](url), \ escapes. Anything that
// does not close is plain text.

// The index of the bracket that closes the one at `start`, nested pairs and escapes skipped.
function closing(s: string, start: number, open: string, close: string): number {
  let depth = 0
  for (let i = start; i < s.length; i++) {
    if (s[i] === '\\') i++
    else if (s[i] === open) depth++
    else if (s[i] === close && --depth === 0) return i
  }
  return -1
}

const escape = (s: string, i: number): Hit<Inline> =>
  s[i] === '\\' && i + 1 < s.length && /[\\`*_[\]()!#<>|~-]/.test(s[i + 1]) ? { node: { t: 'text', v: s[i + 1] }, end: i + 2 } : null

function code(s: string, i: number): Hit<Inline> {
  if (s[i] !== '`') return null
  const end = s.indexOf('`', i + 1)
  return end > i + 1 ? { node: { t: 'code', v: s.slice(i + 1, end) }, end: end + 1 } : null
}

// "(url)" or '(url "title")' right after `at`: the address and where it ends.
function target(s: string, at: number): { url: string; end: number } | null {
  if (s[at] !== '(') return null
  const end = closing(s, at, '(', ')')
  if (end < 0) return null
  const url = s.slice(at + 1, end).trim().replace(/\s+"[^"]*"$/, '')
  return { url, end: end + 1 }
}

function image(s: string, i: number): Hit<Inline> {
  if (s[i] !== '!' || s[i + 1] !== '[') return null
  const labelEnd = closing(s, i + 1, '[', ']')
  const to = labelEnd < 0 ? null : target(s, labelEnd + 1)
  const src = to ? safeImage(to.url) : null
  if (!to || !src) return null
  return { node: { t: 'image', src, alt: s.slice(i + 2, labelEnd) }, end: to.end }
}

function link(s: string, i: number): Hit<Inline> {
  if (s[i] !== '[') return null
  const labelEnd = closing(s, i, '[', ']')
  const to = labelEnd < 0 ? null : target(s, labelEnd + 1)
  if (!to) return null
  const label = parseInline(s.slice(i + 1, labelEnd))
  const href = safeLink(to.url)
  // An unsafe address keeps the words and loses the link.
  return { node: href ? { t: 'link', href, c: label } : { t: 'text', v: s.slice(i + 1, labelEnd) }, end: to.end }
}

const wordChar = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch)

function pair(s: string, i: number, mark: string, t: 'strong' | 'em'): Hit<Inline> {
  if (!s.startsWith(mark, i) || /\s/.test(s[i + mark.length] ?? ' ')) return null
  // _ inside a word (snake_case) is not emphasis.
  if (mark.startsWith('_') && wordChar(s[i - 1])) return null
  const end = s.indexOf(mark, i + mark.length + 1)
  if (end < 0 || /\s/.test(s[end - 1])) return null
  if (mark.startsWith('_') && wordChar(s[end + mark.length])) return null
  return { node: { t, c: parseInline(s.slice(i + mark.length, end)) }, end: end + mark.length }
}

const strong = (s: string, i: number) => pair(s, i, '**', 'strong') ?? pair(s, i, '__', 'strong')
const em = (s: string, i: number) => pair(s, i, '*', 'em') ?? pair(s, i, '_', 'em')

const RULES = [escape, code, image, link, strong, em]
const SPECIAL = /[\\`![*_]/

export function parseInline(s: string): Inline[] {
  const out: Inline[] = []
  let text = ''
  let i = 0
  const flush = () => {
    if (text) out.push({ t: 'text', v: text })
    text = ''
  }
  while (i < s.length) {
    const hit = SPECIAL.test(s[i]) ? RULES.reduce<Hit<Inline>>((found, rule) => found ?? rule(s, i), null) : null
    if (hit) {
      flush()
      out.push(hit.node)
      i = hit.end
    } else text += s[i++]
  }
  flush()
  return out
}

export function plainText(inlines: readonly Inline[]): string {
  return inlines
    .map((node) => {
      if (node.t === 'text' || node.t === 'code') return node.v
      if (node.t === 'image') return node.alt
      return plainText(node.c)
    })
    .join('')
}
