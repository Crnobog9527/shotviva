import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'

import { AppPage, TabRootHeader } from '@/core/app-shell'
import { BalanceChipSlot } from '@/core/app-shell/balance-chip-slot'
import { GatedFeaturesPending, GeneratingPill } from '@/modules/image/create-page'

import { ShellCatalogue, ShellFrame } from './shell-client'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('app.create'))('metaTitle'), robots: { index: false, follow: false } }
}

// Create's app shell (ARCHITECTURE §18.3, mobile speed plan 2): the same frame as /generate with
// every personal part at its placeholder. No readPersonal, no cookies, no connection(): the proxy
// forwards this request without its Cookie header, so even the layout's session holes render
// signed out. The service worker keeps it (fetched without credentials) and answers /generate with
// it; ShellFrame then asks the server for the real page and drops the shell once it is shown. The
// template area carries no id here: the real page's anchor must stay the only one.
export default function CreateShell() {
  const t = useTranslations('app.create')
  return (
    <AppPage wide>
      {/* The address the visitor opened, read before React hydrates (ShellFrame refreshes it). */}
      <script dangerouslySetInnerHTML={{ __html: 'window.__svShell={href:location.href}' }} />
      <ShellFrame>
        <TabRootHeader title={t('title')} lede={t('lede')} aside={<><GeneratingPill /><BalanceChipSlot /></>} />
        <div className="px-(--gutter) pb-2 md:max-w-[880px]">
          <GatedFeaturesPending />
        </div>
        <ShellCatalogue />
      </ShellFrame>
    </AppPage>
  )
}
