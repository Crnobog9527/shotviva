// The 「锁定比例」 checkbox edits fields.lockAspectRatios inside the 字段定义 JSON (1554), so the
// flag saves, copies and syncs with the rest of fields. Null while the JSON does not parse.
type Fields = Record<string, unknown>

function parse(json: string): Fields | null {
  try {
    const value: unknown = JSON.parse(json)
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Fields) : null
  } catch {
    return null
  }
}

export function ratiosLocked(json: string): boolean | null {
  const fields = parse(json)
  return fields ? fields.lockAspectRatios === true : null
}

// Off removes the key, so an unlocked template's fields stay as they were.
export function withRatiosLocked(json: string, on: boolean): string {
  const fields = parse(json)
  if (!fields) return json
  const next = { ...fields }
  delete next.lockAspectRatios
  return JSON.stringify(on ? { ...next, lockAspectRatios: true } : next, null, 2)
}
