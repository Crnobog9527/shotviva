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

// Block ③: photographer vs this site, as a real HTML table (建站规格 G5). The optional
// `diy` column is "shoot it yourself" (建站规格 §4 home H2-4).
export type CostRow = { item: string; photographer: string; diy?: string; site: string }
export type CostTable = {
  caption: string
  headers: { item: string; photographer: string; diy?: string; site: string }
  rows: readonly [CostRow, ...CostRow[]]
}

// Block ④: 3–5 questions in the user's own words (the home page has nine, 建站规格 G6). `link`
// renders after the answer text (e.g. FAQ D on the home page points to
// /image-to-image-generator). `table` renders right after the answer as a real <table> (G5);
// the FAQPage structured data carries only the question and the answer text.
export type FaqTableRow = readonly [label: string, ...cells: string[]]
export type FaqTable = { caption: string; headers: FaqTableRow; rows: readonly [FaqTableRow, ...FaqTableRow[]] }
export type FaqItem = {
  question: string
  answer: string
  link?: { href: `/${string}`; anchor: string }
  table?: FaqTable
}

// Block ⑤: 2–3 related pages. `note` says in one line who the page is for (建站规格 §4 H2-6).
export type RelatedLink = { href: `/${string}`; anchor: string; note?: string }

// Section headings a page may set; blocks fall back to generic ones.
export type SectionHeadings = { facts?: string; costTable?: string; faq?: string; related?: string }

type AtLeast3<T> = readonly [T, T, T, ...T[]]
type Between3And5<T> = readonly [T, T, T] | readonly [T, T, T, T] | readonly [T, T, T, T, T]
type Between2And3<T> = readonly [T, T] | readonly [T, T, T]

// Everything a page has besides its FAQ, which differs in length between the home page and
// the inner pages.
export type PageBasics = {
  // URL segment; the home page uses '' and lives at '/'.
  slug: string
  keyword: string
  title: string
  description: string
  h1: string
  // Plain <p> right under the H1, never an H2 (建站规格 §4).
  subtitle?: string
  // Direct answer under the H1: 40–60 words, starts with the keyword (建站规格 G1).
  answerBlock: string
  // Breadcrumb / nav label.
  label: string
  hero: HeroBlock
  facts: AtLeast3<Fact>
  costTable: CostTable
  related: Between2And3<RelatedLink>
  headings?: SectionHeadings
  // Pages that only make sense with a module on disappear with it.
  module?: ModuleId
}

export type ContentPage = PageBasics & { faq: Between3And5<FaqItem> }

// The home FAQ is exactly the nine questions of 建站规格 G6, in order A–I.
type Nine<T> = readonly [T, T, T, T, T, T, T, T, T]
export type HomeFaq = Nine<FaqItem>

export type TemplateCard = { name: string; use: string }

// One H3 per category, with a short intro and links to its live inner pages (建站规格 §4 H2-2).
export type TemplateCategory = {
  name: string
  intro: string
  templates: readonly [TemplateCard, ...TemplateCard[]]
  links?: readonly RelatedLink[]
}

export type HeadedText = { heading: string; text: string }

// The home page is the same structure plus the 3-step block, the grouped template grid and
// the free-offer section (ARCHITECTURE §13, 建站规格 §4 six-H2 skeleton).
export type HomePage = PageBasics & {
  slug: ''
  faq: HomeFaq
  subtitle: string
  // One line under the hero pair: "one phone photo, a full set" (ARCHITECTURE §13 item 2).
  demoNote: string
  steps: { heading: string; items: readonly [HeadedText, HeadedText, HeadedText] }
  templateGrid: { heading: string; intro: string; categories: readonly [TemplateCategory, ...TemplateCategory[]] }
  // Intro paragraph above the facts table.
  factsIntro: string
  // H2-4: free credits, free vs paid works, then plans + the cost table.
  freeOffer: { heading: string; points: readonly [HeadedText, HeadedText]; plans: HeadedText }
  headings: Required<SectionHeadings>
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

export function pageGate(page: Pick<PageBasics, 'slug' | 'module'>): { path: `/${string}`; module?: ModuleId } {
  return page.module ? { path: pagePath(page), module: page.module } : { path: pagePath(page) }
}
