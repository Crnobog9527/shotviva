import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { Link } from '../../i18n/ui'

type Props = { brandName: string; email: string | null; footer: ReactNode; children: ReactNode }

// The trimmed shell of /connect/graylum (B comp connect.html, same as the auth pages): the
// wordmark and who is signed in, one plate on a safelight glow (a card from md up), the footer.
export function ConnectShell({ brandName, email, footer, children }: Props) {
  const t = useTranslations('marketing.nav')
  return (
    <>
      <header className="sticky top-0 z-50 bg-[linear-gradient(color-mix(in_srgb,var(--background)_92%,transparent),color-mix(in_srgb,var(--background)_72%,transparent))] px-(--gutter) pt-[var(--sat)] backdrop-blur-xl">
        <div className="content-column flex h-14 items-center justify-between gap-3 md:h-16">
          <Link href="/" className="flex min-h-11 items-center gap-2" aria-label={`${brandName}, ${t('tagline')}`}>
            <span className="font-display text-[24px] leading-none tracking-[-0.02em]">
              {brandName}
              <i className="text-primary not-italic">.</i>
            </span>
            <span className="border-l border-border pl-2 text-caption leading-tight whitespace-nowrap text-muted-foreground">{t('tagline')}</span>
          </Link>
          {email && <span className="truncate text-caption text-muted-foreground">{email}</span>}
        </div>
      </header>
      <div className="relative overflow-x-clip px-(--gutter) pt-6 before:pointer-events-none before:absolute before:top-[40%] before:left-1/2 before:z-0 before:h-[520px] before:w-[min(900px,140vw)] before:-translate-x-1/2 before:-translate-y-1/2 before:bg-[radial-gradient(closest-side,var(--safelight-tint),transparent_70%)] before:content-[''] md:grid md:min-h-[calc(100dvh-244px)] md:place-items-center md:py-10 md:before:top-1/2 md:before:h-[640px] md:before:w-[1100px]">
        <div className="relative z-1 motion-safe:animate-[connect-rise_0.5s_var(--ease)_both] md:w-[480px] md:rounded-panel md:bg-card md:p-8 md:shadow-[inset_0_0_0_1px_var(--border),inset_0_1px_0_var(--edge-highlight),0_40px_80px_-40px_var(--photo-fade)]">
          {children}
        </div>
      </div>
      {footer}
    </>
  )
}
