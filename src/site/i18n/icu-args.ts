// Argument names and rich-text tags of an ICU message, for checking that a translation keeps
// them all. Plural / select branch bodies are walked for nested arguments, never read as
// arguments themselves, so `{count, plural, one {credit} other {credits}}` yields only `count`.

type Cursor = { text: string; at: number; found: Set<string> }

function readUntil(c: Cursor, stops: string): string {
  const start = c.at
  while (c.at < c.text.length && !stops.includes(c.text[c.at] as string)) c.at++
  return c.text.slice(start, c.at).trim()
}

// Text up to the closing brace of the current level (or the end), collecting arguments.
function readText(c: Cursor): void {
  while (c.at < c.text.length && c.text[c.at] !== '}') {
    if (c.text[c.at] === '{') readArgument(c)
    else c.at++
  }
}

function readBranches(c: Cursor): void {
  while (c.at < c.text.length && c.text[c.at] !== '}') {
    readUntil(c, '{}')
    if (c.text[c.at] !== '{') break
    c.at++
    readText(c)
    c.at++
  }
}

function readArgument(c: Cursor): void {
  c.at++
  c.found.add(`{${readUntil(c, ',}')}}`)
  if (c.text[c.at] === ',') {
    c.at++
    const type = readUntil(c, ',}')
    if (c.text[c.at] === ',') {
      c.at++
      if (['plural', 'select', 'selectordinal'].includes(type)) readBranches(c)
      else readUntil(c, '}')
    }
  }
  c.at++
}

export function messageArguments(message: string): string[] {
  const c: Cursor = { text: message, at: 0, found: new Set() }
  while (c.at < c.text.length) {
    readText(c)
    c.at++
  }
  for (const match of message.matchAll(/<\/?([a-z]+)>/g)) c.found.add(`<${match[1]}>`)
  return [...c.found].sort()
}
