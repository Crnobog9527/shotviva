// The dictionary's event properties as PVUV wants them: one small flat object of strings,
// numbers and booleans (https://api.pvuv.ai/docs/server-events.md). Arrays become comma lists,
// a record (the toggles) becomes `key:value` pairs, null and undefined are left out. The values
// were validated against the dictionary's schemas first (events.ts, pii.ts): no free text here.
export type PvuvProps = Record<string, string | number | boolean>

const MAX_STRING = 200

function flatValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'string') return value.slice(0, MAX_STRING)
  if (Array.isArray(value)) return value.map(String).join(',').slice(0, MAX_STRING)
  if (typeof value === 'object') {
    return Object.entries(value).map(([key, v]) => `${key}:${String(v)}`).join(',').slice(0, MAX_STRING)
  }
  return null
}

export function pvuvProps(props: Record<string, unknown>, extra: PvuvProps = {}): PvuvProps {
  const out: PvuvProps = {}
  for (const [key, value] of Object.entries(props)) {
    const flat = flatValue(value)
    if (flat !== null && flat !== '') out[key] = flat
  }
  return { ...out, ...extra }
}
