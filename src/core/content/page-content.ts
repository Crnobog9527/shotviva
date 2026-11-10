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
export type SectionHeadings = { facts?: string; faq?: string; related?: string }

type AtLeast3<T> = readonly [T, T, T, ...T[]]
type Between3And5<T> = readonly [T, T, T] | readonly [T, T, T, T] | readonly [T, T, T, T, T]
type Between2And3<T> = readonly [T, T] | readonly [T, T, T]
// 2–3 inner pages, then optionally /pricing (gap audit B10, landing.html "more").
type RelatedBlock<T> = Between2And3<T> | readonly [T, T, T, T]

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
  related: RelatedBlock<RelatedLink>
  headings?: SectionHeadings
  // Pages that only make sense with a module on disappear with it.
  module?: ModuleId
}

// What an SEO landing page adds to the basics (design/comps-v3-b/landing.html, T44): the
// template section shows the featured templates of the page's categories (`categories`: the
// stored category values, T53), and the generator opens on the first of them; the "full shoot"
// demo is optional; `factsNote` says where the fact numbers come from (G4: verifiable).
export type LandingParts = {
  factsNote: string
  templates?: { heading: string; intro: string; categoryKeys: readonly [string, ...string[]] }
  shoot?: ShootDemo
}

// Block ③ on every page is the two bills (DESIGN §6.9 item 6), so a page without them fails tsc.
export type ContentPage = PageBasics & { faq: Between3And5<FaqItem>; costBills: CostBills; landing: LandingParts }

// The home FAQ is the nine questions of 建站规格 G6, in order A–I; a locale may add questions
// after them (/zh adds two, SEO launch handbook G9).
export type HomeFaq = readonly [FaqItem, FaqItem, FaqItem, FaqItem, FaqItem, FaqItem, FaqItem, FaqItem, FaqItem, ...FaqItem[]]

// One featured template as a card (T53): `id` is its id in the templates table, picked into the
// home generator; name and use (its description) in the page's language (建站规格 R5). No
// price: the cards don't show one (DESIGN, Owner 2026-11-08).
export type TemplateCard = { id: string; name: string; use: string }

// One H3 per category with its featured templates, as rendered (建站规格 §4 H2-2). Name, intro
// and order come from template_categories, managed in admin (T75); `drag`: its card style is
// 'compare' (画风), so a single template keeps the draggable compare; `links`: live inner pages.
export type TemplateCategory = {
  name: string
  drag?: boolean
  intro: string
  templates: readonly [TemplateCard, ...TemplateCard[]]
  links?: readonly RelatedLink[]
}

export type HeadedText = { heading: string; text: string }

// An extra home H2 of three headed cards, after the template grid (SEO launch handbook: /zh's
// white-background guide, G9; the English use cases, G5). `link` closes a card's text as a plain
// in-body link, `after` is the punctuation that follows it.
export type TopicCard = HeadedText & { link?: RelatedLink; after?: string }
export type TopicSection = { id: string; heading: string; cards: readonly [TopicCard, TopicCard, TopicCard] }

// Home: "One phone photo → a full shoot" (ARCHITECTURE §13 item 2, DESIGN §6.9): the phone
// snapshot, the three results from three templates, and a two-line bill under them.
export type ShootBillSide = { who: string; amount: string; note: string }
export type ShootResult = { image: ImageRef; title: string; template: string }
export type ShootDemo = {
  // The heading is `lead` + `emphasis`; the emphasis is drawn in the safelight colour.
  heading: { lead: string; emphasis: string }
  intro: string
  phone: { image: ImageRef; file: string; caption: string }
  arrow: string
  results: readonly [ShootResult, ShootResult, ShootResult]
  bill: { photographer: ShootBillSide; site: ShootBillSide; line: string }
}

// Home block ③: what three product photos cost, as two bills (DESIGN §6.9 item 6, Owner
// 2026-11-06 replaced the table). Every number is read from site.config.
export type BillTotal = { prefix?: string; amount: string; suffix?: string; when: string }
export type BillLine = { label: string; value: string }
export type Bill = { title: string; total: BillTotal; lines: readonly [BillLine, BillLine, ...BillLine[]]; fine: string }
export type CostBills = { heading: string; intro: string; photographer: Bill; site: Bill }

// Home: the three monthly plans as one quiet strip under the two bills (SEO launch handbook
// G10). Tier, monthly price, credits a month and photos generating at a time; never a photo
// count (Owner, #417). Each plan and the line under the strip go to /pricing.
export type PlanCard = { name: string; price: string; per: string; credits: string; concurrency: string }
export type PlanStrip = { label: string; href: `/${string}`; cards: readonly [PlanCard, PlanCard, PlanCard]; more: string }

// Home: "Can't find your template? Make a wish" (Owner 2026-11-10), right under the template
// grid and only while the wishlist is open. Three pains it answers, eight example wish cards
// (one shipped; the note says they are examples, never a badge on the picture) and one CTA
// that depends on whether the visitor is signed in. Exactly eight: the wall is two rows of four
// (four of two on phones) and marketing.css gives each print its own lean.
export type WishExample = { image: ImageRef; text: string; votes: number; shipped: boolean }
export type WishlistPromo = {
  // `lead` + `emphasis` + `tail`; the emphasis is the one italic phrase (English only).
  heading: { lead: string; emphasis: string; tail: string }
  intro: string
  points: readonly [HeadedText, HeadedText, HeadedText]
  examples: readonly [WishExample, WishExample, WishExample, WishExample, WishExample, WishExample, WishExample, WishExample]
  // "Wish cards are illustrative examples" plus who can post (ARCHITECTURE §15.1).
  note: string
  labels: { shipped: string; votes: string }
  cta: { signedOut: string; signedIn: string }
}

// The home page is the same structure plus the 3-step block, the grouped template grid and
// the free-offer section (ARCHITECTURE §13, 建站规格 §4 six-H2 skeleton). Its cost block is
// the two bills instead of a table (the signed-off v3-b comp), so a home without them still
// fails `tsc`.
// Its related block links every live inner page and /pricing (建站规格 §4 H2-6, R8), so it
// may hold more than the inner pages' three.
export type HomePage = Omit<PageBasics, 'related'> & {
  related: readonly [RelatedLink, RelatedLink, ...RelatedLink[]]
  slug: ''
  faq: HomeFaq
  subtitle: string
  shoot: ShootDemo
  costBills: CostBills
  plans?: PlanStrip
  steps: { heading: string; items: readonly [HeadedText, HeadedText, HeadedText] }
  templateGrid: {
    heading: string
    intro: string
    // "All template images are illustrative examples." under the grid.
    note: string
  }
  wishlist: WishlistPromo
  topics?: TopicSection
  // Intro paragraph above the facts table.
  factsIntro: string
  // H2-4: free credits, free vs paid works, then plans.
  // `sample`: one photo shown twice, free with the watermark and paid without.
  freeOffer: { heading: string; points: readonly [HeadedText, HeadedText]; plans: HeadedText; sample?: ImageRef }
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
