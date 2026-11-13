import { posterStrings } from './content'

// Pasted text in, structured content out: every string the model returned must be found in what
// the user pasted (ARCHITECTURE §5.3 逐字校验). Compared after NFKC (full / half width alike) with
// all whitespace removed, so a reflowed line still matches but a changed character does not.
// The paths that fail are shown in yellow until the user confirms them.

// Column bars a reader may put between table cells are ignored like spaces.
export const normalizeForMatch = (text: string): string => text.normalize('NFKC').replace(/[\s|｜]+/g, '').toLowerCase()

export function unverifiedPaths(content: unknown, source: string): string[] {
  const haystack = normalizeForMatch(source)
  return posterStrings(content)
    .filter(({ text }) => !haystack.includes(normalizeForMatch(text)))
    .map(({ path }) => path)
}
