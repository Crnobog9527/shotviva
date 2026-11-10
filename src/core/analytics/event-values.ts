// Plain helpers of the event dictionary (events.ts) that browser code calls while rendering.
// Kept apart from the zod schemas so importing them does not put zod in a page's first-load
// JavaScript: the schemas only load when an event is checked (browser/client.ts).

export const UPLOAD_SIZE_BUCKETS = ['<1MB', '1-5MB', '>5MB'] as const

// templates.category holds the admin's display name since T53 ("Products & Resale", "Food &
// Drink"), but the dictionary takes a slug (§16.2), so every `generate` event was refused and
// dropped ("category: invalid_format" in production logs). Lowercased, with each run of other
// characters turned into one hyphen; a name with no Latin letters or digits left becomes
// 'uncategorized' rather than losing the event. From T75 the column holds the category's stable
// key (already this shape, e.g. 'food-drink'), which passes through unchanged, so events before
// and after T75 carry the same value. Used by `generate` (server), `template_view` and `template_favorite` (browser).
export function categorySlug(category: string): string {
  const slug = category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '')
  return slug || 'uncategorized'
}

const MB = 1024 * 1024

export function uploadSizeBucket(bytes: number): (typeof UPLOAD_SIZE_BUCKETS)[number] {
  if (bytes < MB) return '<1MB'
  return bytes <= 5 * MB ? '1-5MB' : '>5MB'
}
