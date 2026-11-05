// Shape of a legal page (terms, privacy, refunds, acceptable use). Unlike SEO pages
// (page-content.ts) these carry no keyword blocks: they are plain readable text, kept out
// of search by the indexing switch because they are not in the keyword map (AGENTS §9).

// An internal path, a mailto: address or an external https URL.
export type LegalLink = { href: string; label: string }

// A run of text with optional inline links, e.g. ['See our ', refundLink, '.'].
export type LegalText = string | readonly (string | LegalLink)[]

export type LegalBlock =
  | LegalText
  | { list: readonly LegalText[] }
  // A postal address or similar, one line per entry.
  | { lines: readonly string[] }

export type LegalSection = {
  // Anchor for the table of contents; unique within the page.
  id: string
  heading: string
  blocks: readonly [LegalBlock, ...LegalBlock[]]
}

export type LegalPage = {
  path: `/${string}`
  title: string
  description: string
  h1: string
  // Footer link text.
  label: string
  // ISO date (YYYY-MM-DD) of the last change to the text.
  lastUpdated: string
  intro: readonly LegalBlock[]
  sections: readonly [LegalSection, ...LegalSection[]]
}

export function defineLegalPage<const T extends LegalPage>(page: T): T {
  return page
}

// "November 5, 2026". Pinned to UTC so the build machine's time zone never shifts the day.
export function formatLegalDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
