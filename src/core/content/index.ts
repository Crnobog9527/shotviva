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
  type Fact,
  type FaqItem,
  type FaqTable,
  type FaqTableRow,
  type HeadedText,
  type HeroBlock,
  type HomeFaq,
  type HomePage,
  type ImageRef,
  type LandingParts,
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
export type { FeaturedSections, TemplateLookup, TemplateMedia } from './blocks/template-grid'
export { FactsSection } from './blocks/facts-section'
export { FaqSection } from './blocks/faq-section'
export { BusinessSection, type BusinessBlock } from './blocks/business-section'
export { businessMailto } from './blocks/business-mailto'
export { CreditBuys, type CreditBuysBlock } from './blocks/credit-buys'
export { PricingHero, type PricingHeroText } from './blocks/pricing-hero'
export { SiteFooter, type FooterLink } from './blocks/site-footer'
export {
  defineLegalPage,
  formatLegalDate,
  type LegalBlock,
  type LegalLink,
  type LegalNavItem,
  type LegalPage,
  type LegalSection,
  type LegalText,
} from './legal/legal-page'
export { LegalPageView } from './legal/legal-page-view'
export { NavAccount } from './blocks/nav-account'
export { NotFoundView } from './blocks/not-found-view'
export { PROBLEM_GHOST, PROBLEM_PRIMARY, ProblemView } from './blocks/problem-view'
export { TryTemplates, type TryTemplate } from './blocks/try-templates'
