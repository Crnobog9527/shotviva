import { useTranslations } from 'next-intl'
import { useId } from 'react'

import type { LinkStatus } from '../link-code'
import { GraylumCard } from './graylum-intro/graylum-card'
import type { GraylumLinks } from './graylum-intro/intro-links'

type Props = { graylum: LinkStatus; links: GraylumLinks; disconnect: () => Promise<void> }

// Account page 连接的应用 (ARCHITECTURE §13): one card per external product, Graylum only. The
// card opens Graylum's introduction, modelled on the Shotviva introduction inside Graylum
// (its 集成 page). Status comes from the link the page already read, so a disconnect (which
// refreshes the page) flips it without another query.
export function IntegrationsPanel({ graylum, links, disconnect }: Props) {
  const t = useTranslations('partner.integrations')
  const id = useId()
  return (
    <section aria-labelledby={id} className="mx-(--gutter) mt-6 md:max-w-[720px]">
      <h2 id={id} className="mb-2 text-headline leading-[1.2] font-semibold tracking-[-0.01em]">{t('title')}</h2>
      <ul className="hairline-lit divide-y divide-hairline rounded-panel bg-card px-4">
        <li>
          <GraylumCard connected={graylum.connected} links={links} disconnect={disconnect} />
        </li>
      </ul>
    </section>
  )
}
