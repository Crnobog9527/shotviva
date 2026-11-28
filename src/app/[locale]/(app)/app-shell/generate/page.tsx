import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'

import { AppPage, TabRootHeader } from '@/core/app-shell'
import { shellBootScript } from '@/core/offline/shell-fallback'
import { BalanceChipSlot } from '@/core/app-shell/balance-chip-slot'
import { BOOT_HOLD_SCRIPT } from '@/core/i18n/ui'
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
// Plain script, run while the shell's HTML is parsed (core/offline/shell-fallback.ts). The worker
// ignores the message for anything but /generate and /zh/generate, so the shell opened at its own
// address asks for nothing.
const SHELL_BOOT = shellBootScript()

export default function CreateShell() {
  const t = useTranslations('app.create')
  return (
    <AppPage wide>
      {/* The address the visitor opened, read before React hydrates (ShellFrame refreshes it). In the
          foreground, the worker starts that refresh's request now (shell-worker.ts). Answered with the
          shell again before the last one was replaced, the tab leaves for the network page. */}
      <script dangerouslySetInnerHTML={{ __html: SHELL_BOOT }} />
      {/* No link prefetches beside the refresh that replaces the shell (core/i18n/ui/prefetch-hold.tsx). */}
      <script dangerouslySetInnerHTML={{ __html: BOOT_HOLD_SCRIPT }} />
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
