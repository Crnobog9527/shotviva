import type { ModuleId } from '../config'

// Fixed shape of every SEO page (ARCHITECTURE §12, 建站规格 R10). The five blocks are
// required fields with minimum tuple lengths, so leaving one out fails `tsc`.

export type ImageRef = {
  src: string
  // "scene + subject + light", never "image1" (建站规格 R9).
  alt: string
  width: number
  height: number
}

// Block ①: one before/after pair, a visible caption and a try-it entry.
export type HeroBlock = {
  before: ImageRef
  after: ImageRef
  caption: string
  cta: { label: string; href: string }
}

// Block ②: verifiable facts, at least three (建站规格 G4).
export type Fact = { label: string; value: string }

// Block ③: photographer vs this site, as a real HTML table (建站规格 G5).
export type CostRow = { item: string; photographer: string; site: string }
export type CostTable = {
  caption: string
  headers: { item: string; photographer: string; site: string }
  rows: readonly [CostRow, ...CostRow[]]
}

// Block ④: 3–5 questions in the user's own words.
export type FaqItem = { question: string; answer: string }

// Block ⑤: 2–3 related pages.
export type RelatedLink = { href: `/${string}`; anchor: string }

type AtLeast3<T> = readonly [T, T, T, ...T[]]
type Between3And5<T> = readonly [T, T, T] | readonly [T, T, T, T] | readonly [T, T, T, T, T]
type Between2And3<T> = readonly [T, T] | readonly [T, T, T]

export type ContentPage = {
  // URL segment; the home page uses '' and lives at '/'.
  slug: string
  keyword: string
  title: string
  description: string
  h1: string
  // Direct answer under the H1: 40–60 words, starts with the keyword (建站规格 G1).
  answerBlock: string
  // Breadcrumb / nav label.
  label: string
  hero: HeroBlock
  facts: AtLeast3<Fact>
  costTable: CostTable
  faq: Between3And5<FaqItem>
  related: Between2And3<RelatedLink>
  // Pages that only make sense with a module on disappear with it.
  module?: ModuleId
}

export type TemplateCard = { name: string; use: string }

// The home page is the same structure plus the featured-template grid (ARCHITECTURE §13).
export type HomePage = ContentPage & {
  slug: ''
  templateGrid: { heading: string; templates: readonly [TemplateCard, ...TemplateCard[]] }
}

export function defineContentPage<const T extends ContentPage>(page: T): T {
  return page
}

export function defineHomePage<const T extends HomePage>(page: T): T {
  return page
}

export function pagePath(page: Pick<ContentPage, 'slug'>): `/${string}` {
  return `/${page.slug}`
}

export function pageGate(page: ContentPage): { path: `/${string}`; module?: ModuleId } {
  return page.module ? { path: pagePath(page), module: page.module } : { path: pagePath(page) }
}
