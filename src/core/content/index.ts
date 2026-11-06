export {
  defineContentPage,
  defineHomePage,
  pageGate,
  pagePath,
  type Bill,
  type BillLine,
  type BillTotal,
  type ContentPage,
  type CostBills,
  type CostRow,
  type CostTable,
  type Fact,
  type FaqItem,
  type FaqTable,
  type FaqTableRow,
  type HeadedText,
  type HeroBlock,
  type HomeFaq,
  type HomePage,
  type ImageRef,
  type PageBasics,
  type RelatedLink,
  type SectionHeadings,
  type ShootDemo,
  type ShootResult,
  type TemplateCard,
  type TemplateCategory,
} from './page-content'
export { LIMITS, countWords, validateContentPage } from './validate-page'
export { ContentPageView } from './content-page-view'
export { HomePageView } from './home-page-view'
export type { TemplateLookup, TemplateMedia } from './blocks/template-grid'
export { CostTableView } from './blocks/cost-table-section'
export { Breadcrumbs } from './blocks/breadcrumbs'
export { FactsSection } from './blocks/facts-section'
export { FaqSection } from './blocks/faq-section'
export { SiteFooter, type FooterLink } from './blocks/site-footer'
export {
  defineLegalPage,
  formatLegalDate,
  type LegalBlock,
  type LegalLink,
  type LegalPage,
  type LegalSection,
  type LegalText,
} from './legal/legal-page'
export { LegalPageView } from './legal/legal-page-view'
export { NotFoundView } from './blocks/not-found-view'
