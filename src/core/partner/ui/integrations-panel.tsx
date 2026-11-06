import { useTranslations } from 'next-intl'
import { useId } from 'react'

import type { LinkStatus } from '../link-code'
import { GraylumConnection } from './graylum-connection'
import { IntegrationRow } from './integration-row'

type Props = { graylum: LinkStatus; disconnect: () => Promise<void> }

// Account page "Integrations" (ARCHITECTURE §13, comps-v3-b/account.html ?integ=open): one row
// per external product in one panel, Graylum only (the comp's Shopify row is an illustration).
// Status comes from the link the page already read, so a disconnect (which refreshes the page)
// flips the badge without another query.
export function IntegrationsPanel({ graylum, disconnect }: Props) {
  const t = useTranslations('partner.integrations')
  const graylumT = useTranslations('partner.account')
  const id = useId()
  return (
    <section aria-labelledby={id} className="mx-(--gutter) mt-6 md:max-w-[720px]">
      <h2 id={id} className="mb-2 text-headline leading-[1.2] font-semibold tracking-[-0.01em]">{t('title')}</h2>
      <ul className="hairline-lit divide-y divide-hairline rounded-panel bg-card px-4">
        <li>
          <IntegrationRow name={graylumT('title')} description={graylumT('description')} enabled={graylum.connected}>
            <GraylumConnection linkedAt={graylum.linkedAt} disconnect={disconnect} />
          </IntegrationRow>
        </li>
      </ul>
    </section>
  )
}
