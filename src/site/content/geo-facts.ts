// GEO (SEO launch handbook 03-S3): every indexable page carries at least five facts an AI
// answer can quote on their own. A quotable fact is one sentence with a number in it, whose
// subject is Shotviva or a named thing, so it reads correctly out of context: it never opens
// with "It", "This", "Yes" or "No" (or 它 / 这 / 是的 / 不 in Chinese). The numbers themselves
// come from site.config and the live catalogue (G1); this only checks the sentences.

export const MIN_QUOTABLE_FACTS = 5

// Keys whose strings are not page prose: image alt text, file names, links, ids.
// Headings and questions are not facts either; the business form's hints are not page prose.
const SKIP_KEYS = new Set([
  'alt', 'src', 'href', 'file', 'image', 'slug', 'path', 'keyword', 'id', 'title', 'label',
  'heading', 'headings', 'h1', 'lead', 'emphasis', 'question', 'caption', 'business',
])

function prose(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const item of value) prose(item, out)
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) if (!SKIP_KEYS.has(key)) prose(item, out)
  }
  return out
}

const VAGUE_OPENER = /^(?:It|It's|Its|This|That|These|Those|They|Yes|No)\b|^(?:它|这|那|是的|不[，。、])/

const isChinese = (text: string) => /[一-鿿]/.test(text)

// Splits on sentence ends; a decimal point ("$19.90") is not one.
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z“"(])|(?<=[。！？])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

export function isQuotableFact(sentence: string): boolean {
  if (!/\d/.test(sentence) || sentence.includes('⟦')) return false
  if (VAGUE_OPENER.test(sentence)) return false
  return isChinese(sentence) ? sentence.length >= 12 : sentence.split(/\s+/).length >= 7
}

export function quotableFacts(page: unknown): string[] {
  const found = new Set<string>()
  for (const text of prose(page)) for (const sentence of sentences(text)) if (isQuotableFact(sentence)) found.add(sentence)
  return [...found]
}
