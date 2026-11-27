// The enterprise number printed in bank-transfer references (orgs.ref_code, migration 1801):
// 'SV-' and six characters from an alphabet without 0, 1, I, L, O. The database generates it
// and never changes it; this only recognises the shape (for the admin search and for tests).

export const REF_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const REF_CODE_PATTERN = /^SV-[2-9A-HJKMNP-Z]{6}$/

// A search box entry that is an enterprise number, in canonical (upper case) form; null for any
// other text. Matching is case-insensitive and ignores surrounding spaces.
export function parseRefCode(input: string): string | null {
  const code = input.trim().toUpperCase()
  return REF_CODE_PATTERN.test(code) ? code : null
}
