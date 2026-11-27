import { useTranslations } from 'next-intl'
import { UsersRound } from 'lucide-react'

import { InviteLinkBox } from './invite-link-box'
import { LinkCallout } from './link-callout'

// On /account, under the owner's 「企业」 row (Owner 2026-11-22): the enterprise affiliate's
// customer link with one-tap copy, labelled as the link for customers so it is never confused with
// the staff-only link in the workspace. Shown only when the org's affiliate is on. It wears the
// same highlighted surface as a member's promotion link (Owner 2026-11-23: the dark card was easy
// to miss).
export function CustomerLinkRow({ url }: { url: string }) {
  const t = useTranslations('app.org.entry')
  return (
    <div className="mt-2">
      <LinkCallout icon={UsersRound} title={t('customerTitle')} hint={t('customerHint')}>
        <InviteLinkBox url={url} />
      </LinkCallout>
    </div>
  )
}
