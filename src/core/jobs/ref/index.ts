// A generation's reference number (ARCHITECTURE §10.a 「出图编号」, T78): the first 8 characters
// of its job id, longer only when another job shares them. Users read it off the photo page and
// quote it in a ticket; the admin types any 6+ character prefix to find the job. Client-safe and
// dependency-free: the photo page, the help dialog and the admin all use it.

export const JOB_REF_LENGTH = 8
export const JOB_REF_MIN = 6

const TEMPLATE = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
const LOW = TEMPLATE.replace(/x/g, '0')
const HIGH = TEMPLATE.replace(/x/g, 'f')

// Hex digits back into the uuid's 8-4-4-4-12 shape, so a prefix typed with or without dashes
// ("2fa821c61a2b", "2fa821c6-1a2b") reads the same.
function withDashes(hex: string): string {
  let out = ''
  let next = 0
  for (const slot of TEMPLATE) {
    if (next >= hex.length) break
    if (slot === '-') out += '-'
    else out += hex[next++]
  }
  return out
}

// What the admin or a user typed, as a lowercase uuid prefix; null when it cannot be one
// (fewer than 6 hex digits, other characters, longer than a uuid). A leading '#' is allowed.
export function normalizeJobRef(input: string): string | null {
  const hex = input.trim().replace(/^#/, '').replace(/-/g, '').toLowerCase()
  if (hex.length < JOB_REF_MIN || hex.length > 32 || !/^[0-9a-f]+$/.test(hex)) return null
  return withDashes(hex)
}

// Every uuid that starts with `prefix` lies in [from, to]: Postgres orders uuids byte by byte,
// which is the order of their lowercase hex text, so a prefix search is a primary-key range.
export function jobRefRange(prefix: string): { from: string; to: string } {
  return { from: prefix + LOW.slice(prefix.length), to: prefix + HIGH.slice(prefix.length) }
}

// The shortest prefix of `id`, at least 8 characters, that no other id in `neighbours` shares.
// A prefix never ends on a dash: one more character is shown instead.
export function jobRef(id: string, neighbours: readonly string[] = []): string {
  const own = id.toLowerCase()
  const others = neighbours.map((n) => n.toLowerCase()).filter((n) => n !== own)
  let length = JOB_REF_LENGTH
  while (length < own.length && others.some((other) => other.startsWith(own.slice(0, length)))) length++
  if (own[length - 1] === '-') length++
  return own.slice(0, length)
}
