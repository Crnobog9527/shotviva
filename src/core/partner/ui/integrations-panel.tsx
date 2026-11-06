import { useTranslations } from 'next-intl'

import type { LinkStatus } from '../link-code'
import { GraylumConnection } from './graylum-connection'
import { IntegrationRow } from './integration-row'

type Props = { graylum: LinkStatus; disconnect: () => Promise<void> }

// Account page "Integrations" (ARCHITECTURE §13): one row per external product, Graylum first.
// Status comes from the link the page already read, so a disconnect (which refreshes the page)
// flips the badge without another query.
export function IntegrationsPanel({ graylum, disconnect }: Props) {
  const t = useTranslations('partner.integrations')
  const graylumT = useTranslations('partner.account')
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-headline leading-[1.25] font-semibold">{t('title')}</h2>
      <ul className="flex flex-col gap-3">
        <li>
          <IntegrationRow name={graylumT('title')} description={graylumT('description')} enabled={graylum.connected}>
            <GraylumConnection linkedAt={graylum.linkedAt} disconnect={disconnect} />
          </IntegrationRow>
        </li>
      </ul>
    </div>
  )
}
