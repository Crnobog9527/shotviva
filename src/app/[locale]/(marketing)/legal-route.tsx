import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { LegalPageView, type LegalPage } from '@/core/content'
import { wechatPayEnabled } from '@/core/billing/stripe'
import { pageMetadata } from '@/core/seo'
import { acceptableUsePage, privacyPage, refundPolicyPage, termsPage, withWechatPay } from '@/site/content'
import { site } from '@/site/site.config'

// Only the four legal pages draw .mk-legal; every other marketing page went without these rules
// inlined into its HTML (they came with the group's layout before).
import './legal.css'

// The four legal routes (T45, design/comps-v3-b/legal.html). English only (Owner 2026-11-06,
// ARCHITECTURE §17): there is no /zh version, a Chinese page's legal links open these, and the
// language switch here offers the /zh home. None is in the keyword map, so all are noindex.

const PAGES = { terms: termsPage, privacy: privacyPage, refunds: refundPolicyPage, acceptableUse: acceptableUsePage } satisfies Record<string, LegalPage>

export type LegalKey = keyof typeof PAGES

export function legalMetadata(key: LegalKey): Metadata {
  return pageMetadata(site, PAGES[key])
}

export async function LegalRoute({ which }: { which: LegalKey }) {
  const t = await getTranslations('legal.pages')
  const nav = (Object.keys(PAGES) as LegalKey[]).map((key) => ({ href: PAGES[key].path, label: t(key), current: key === which }))
  // STRIPE_WECHAT_PAY (T73): name WeChat Pay beside Alipay only while it is sold.
  const page = wechatPayEnabled() ? withWechatPay(PAGES[which]) : PAGES[which]
  return <LegalPageView page={page} nav={nav} email={site.brand.contactEmail} />
}
