import type { ReactNode } from 'react'

import { Badge } from '@/core/ui/badge'

import { formatBeijing } from '../shell/format'
import type { UserReferrer } from '../users/list-types'
import { USERS_COPY } from './copy'

const COPY = USERS_COPY.referral

// The partner's own page in the affiliate admin (its member dossier), by user id alone.
export const partnerHref = (partnerId: string) => `/admin/affiliates?tab=affiliates&id=${encodeURIComponent(partnerId)}`

const sourceLabel = (source: string | null) => (source ? (COPY.sources[source] ?? source) : COPY.unknownSource)

// The list's compact tag under the account: 「推荐人：name」 linking to that partner. Nothing
// at all for an account nobody brought in.
export function ReferrerTag({ referrer }: { referrer: UserReferrer | null }) {
  if (!referrer) return null
  return (
    <a
      href={partnerHref(referrer.partnerId)}
      title={`${USERS_COPY.identity.referrerTitle(referrer.name)} · ${sourceLabel(referrer.source)}`}
      className="inline-flex max-w-full items-center gap-1 text-xs text-primary hover:underline"
    >
      <Badge variant="outline" className="shrink-0">{USERS_COPY.identity.referrer}</Badge>
      <span className="truncate">{referrer.name}</span>
    </a>
  )
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-1.5">
      <dt className="shrink-0">{term}</dt>
      <dd className="min-w-0 font-mono break-all text-foreground select-all">{children}</dd>
    </div>
  )
}

// The detail's facts: who, the code, the kind (personal or enterprise, and the level for an
// enterprise customer), how and when it was bound, and the colleague or customer behind it.
// `undefined` (not yet loaded) and null (nobody) both show nothing.
export function ReferrerFacts({ referrer }: { referrer: UserReferrer | null | undefined }) {
  if (!referrer) return null
  const state = COPY.gone(referrer.status)
  return (
    <>
      <Fact term={USERS_COPY.dialog.referrer}>
        <a href={partnerHref(referrer.partnerId)} className="text-primary hover:underline">{referrer.name}</a>
        {referrer.partnerContact && referrer.partnerContact !== referrer.name ? ` · ${referrer.partnerContact}` : ''}
        {state ? ` · ${state}` : ''}
      </Fact>
      <Fact term={COPY.code}>{referrer.slug}</Fact>
      <Fact term={COPY.kind}>{referrer.enterprise ? COPY.enterprise : COPY.personal} · {sourceLabel(referrer.source)}</Fact>
      {referrer.at ? <Fact term={COPY.boundAt}>{formatBeijing(referrer.at) ?? referrer.at}</Fact> : null}
      {referrer.memberContact ? <Fact term={COPY.member}>{referrer.memberContact}</Fact> : null}
      {referrer.viaContact ? <Fact term={COPY.via}>{referrer.viaContact}</Fact> : null}
    </>
  )
}
