'use client'

import { PaywallProvider } from '@/core/billing/paywall/provider'
import { StandingFeed } from '@/core/billing/paywall/standing-context'
import { HomeGenerator, type HomeGeneratorProps } from '@/modules/image/marketing'

import type { HomeMember } from '../../home-member'

type Props = Omit<HomeGeneratorProps, 'viewer' | 'settled'> & { member: HomeMember }

// The home generator for a signed-in visitor, inside the paywall it can open ("Get credits · N
// needed", DESIGN §6.9 item 9), with what the member holds so the paywall locks lower plans (T66).
// Its own chunk: a signed-out visitor never loads the paywall.
export function HomeMemberGenerator({ member, ...props }: Props) {
  const { viewer, standing, paywall } = member
  return (
    <PaywallProvider products={paywall.products} perkFacts={paywall.perkFacts} channel={paywall.channel} wechatPay={paywall.wechatPay}>
      <HomeGenerator {...props} viewer={viewer} />
      {standing ? <StandingFeed standing={standing} /> : null}
    </PaywallProvider>
  )
}
