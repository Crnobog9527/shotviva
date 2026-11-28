import type { PerkFacts } from '@/core/billing/paywall/perk-facts'
import type { MemberStanding } from '@/core/billing/subscription/standing'
import type { PaymentChannel, SiteProduct } from '@/core/config'
import type { HomeViewer } from '@/modules/image/marketing'

// What GET /api/home/viewer answers and the home generator's browser side reads. Types only, apart
// from home-viewer.ts (server-only reads), so client code importing them pulls in nothing else.
export type HomePaywall = { products: readonly SiteProduct[]; perkFacts: PerkFacts; channel: PaymentChannel; wechatPay: boolean }

export type HomeMember = { viewer: HomeViewer; standing: MemberStanding | null; paywall: HomePaywall }
