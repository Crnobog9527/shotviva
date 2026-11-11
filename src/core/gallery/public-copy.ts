// What text of a work may be shown publicly (ARCHITECTURE §9 第 3 条): the template's copy fields
// the user filled in (a dish name, a price), keyed as entered. Never the note, the edit
// instruction or anything else in inputs; an edited work shows no text at all. The automatic
// screen checks exactly this text, so what is screened is what is shown.

export type PublicCopy = { key: string; value: string }

const MAX_FIELDS = 10
const MAX_LENGTH = 4000

export function publicCopy(work: { parentJobId: string | null; inputs: Record<string, unknown> }): PublicCopy[] {
  if (work.parentJobId) return []
  const copy = work.inputs.copy
  if (!copy || typeof copy !== 'object' || Array.isArray(copy)) return []
  const out: PublicCopy[] = []
  for (const [key, raw] of Object.entries(copy)) {
    if (typeof raw !== 'string') continue
    const value = raw.trim().slice(0, MAX_LENGTH)
    if (value) out.push({ key, value })
    if (out.length === MAX_FIELDS) break
  }
  return out
}

// The same text as one string for the screen; null when there is none.
export function publicCopyText(work: Parameters<typeof publicCopy>[0]): string | null {
  const text = publicCopy(work).map((field) => field.value).join('\n')
  return text || null
}
