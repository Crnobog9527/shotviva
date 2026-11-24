import { useTranslations } from 'next-intl'

import { AppPage, TabRootHeader } from '@/core/app-shell'
import { BalanceChipSlot } from '@/core/app-shell/balance-chip-slot'
import { GatedFeaturesPending, GeneratingPill, TEMPLATES_ANCHOR } from '@/modules/image/create-page'

import { ShellCatalogue, ShellResume } from './shell-client'

// PROBE (ARCHITECTURE §18.3, plan 2): Create's app shell. The same frame as /generate with every
// personal part left at its placeholder: no readPersonal, no cookies, no connection(). The service
// worker fetches it without credentials and answers /generate with it; once hydrated it moves to
// the real address (ShellResume), where the server checks the session as always.
export default function CreateShell() {
  const t = useTranslations('app.create')
  return (
    <AppPage wide>
      {/* The address the visitor opened, read before React hydrates (the probe checks it is kept). */}
      <script dangerouslySetInnerHTML={{ __html: 'window.__svShell={href:location.href,at:performance.now()}' }} />
      <TabRootHeader title={t('title')} lede={t('lede')} aside={<><GeneratingPill /><BalanceChipSlot /></>} />
      <div className="px-(--gutter) pb-2 md:max-w-[880px]">
        <GatedFeaturesPending />
      </div>
      <div id={TEMPLATES_ANCHOR} className="scroll-mt-[calc(var(--sat)+8px)] md:scroll-mt-16">
        <ShellCatalogue />
      </div>
      <ShellResume />
    </AppPage>
  )
}
