import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Link } from '@/core/i18n/ui'
import { cn } from '@/core/ui/cn'

export type EnterpriseSection = 'affiliate' | 'workspace' | 'works' | 'purchasing'

// The sections of an org owner's enterprise area, in the Owner's order (2026-11-22):
// 企业联盟 first (the landing page whenever the org's affiliate is on), then the workspace, then
// the purchasing details. Hrefs are logical; Link adds /zh.
// 企业作品 (Owner 2026-11-22) sits next to the workspace: the works the org's credits paid for.
const SECTIONS: readonly { id: EnterpriseSection; href: string; label: 'affiliate' | 'console' | 'works' | 'purchasing' }[] = [
  { id: 'affiliate', href: '/partners/enterprise', label: 'affiliate' },
  { id: 'workspace', href: '/account/enterprise', label: 'console' },
  { id: 'works', href: '/account/enterprise/works', label: 'works' },
  { id: 'purchasing', href: '/account/enterprise/purchasing', label: 'purchasing' },
]

// A member's sections: their customers (the same address as the owner's workspace; only with the
// affiliate program, Owner 2026-11-28) and 企业作品, which every active member sees.
const MEMBER_SECTIONS: readonly { id: EnterpriseSection; href: string; label: 'mine' | 'works' }[] = [
  { id: 'workspace', href: '/account/enterprise', label: 'mine' },
  { id: 'works', href: '/account/enterprise/works', label: 'works' },
]

export type EnterpriseRole = 'owner' | 'member'

export function enterpriseSections(affiliate: boolean, role: EnterpriseRole = 'owner') {
  if (role === 'member') return MEMBER_SECTIONS.filter((section) => affiliate || section.id !== 'workspace')
  return SECTIONS.filter((section) => affiliate || section.id !== 'affiliate')
}

// Where the enterprise area opens: the affiliate dashboard when the org has one, else the workspace.
export function enterpriseHome(affiliate: boolean): string {
  return enterpriseSections(affiliate)[0].href
}

type FrameProps = {
  orgName: string
  current: EnterpriseSection
  affiliate: boolean
  // Whose sections the navigation shows; the owner's unless said otherwise.
  role?: EnterpriseRole
  intro: string
  // The affiliate dashboard's own views (overview, commissions, …), shown under its section.
  subnav?: ReactNode
  children?: ReactNode
}

// One header and one navigation for all three sections, so switching never leaves the area. On a
// phone: a compact title, then a sticky segmented control across the top and the section's own
// views as a chip rail. From lg up: the #825 layout, the navigation in a sticky side column.
export function EnterpriseFrame({ orgName, current, affiliate, role = 'owner', intro, subnav, children }: FrameProps) {
  return (
    <div className="mx-(--gutter) mt-4 grid gap-4 lg:mt-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-x-10 lg:gap-y-8">
      <EnterpriseHeader orgName={orgName} intro={intro} className="lg:col-span-2" />
      <aside className="max-lg:contents lg:sticky lg:top-[80px] lg:self-start">
        {/* One section is no navigation: a member without the affiliate program has 企业作品 only. */}
        {enterpriseSections(affiliate, role).length > 1 ? <SectionNav current={current} affiliate={affiliate} role={role} subnav={subnav} /> : subnav}
      </aside>
      <div className="min-w-0 space-y-4">{children}</div>
    </div>
  )
}

// Back to /account, the org's name and one line on the page. A member's own org page has this
// header alone: the sections below it are the owner's.
export function EnterpriseHeader({ orgName, intro, className }: { orgName: string; intro: string; className?: string }) {
  const t = useTranslations('app.org')
  return (
    <header className={cn('min-w-0', className)}>
      <Link href="/account" className="-ml-1 inline-flex min-h-11 items-center gap-0.5 text-label text-muted-foreground hover:text-foreground">
        <ChevronLeft aria-hidden strokeWidth={1.75} className="size-[18px] text-primary" />{t('back')}
      </Link>
      <h1 className="mt-1 font-display text-[clamp(1.75rem,6vw,2.75rem)] leading-[1.05] tracking-[-0.02em] text-balance">{orgName}</h1>
      <p className="mt-2 max-w-[62ch] text-label text-bone-dim">{intro}</p>
    </header>
  )
}

const GRID_COLS: Record<number, string> = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' }

function SectionNav({ current, affiliate, role, subnav }: { current: EnterpriseSection; affiliate: boolean; role: EnterpriseRole; subnav?: ReactNode }) {
  const t = useTranslations('app.org.tabs')
  const sections = enterpriseSections(affiliate, role)
  return (
    <>
      <nav
        aria-label={t('label')}
        className="sticky top-0 z-30 -mx-(--gutter) bar-material px-(--gutter) py-2 shadow-[inset_0_-1px_0_var(--border)] md:top-14 lg:static lg:mx-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none"
      >
        <ul className={cn('grid rounded-control bg-wash p-1 shadow-[inset_0_0_0_1px_var(--border)] lg:grid-cols-1 lg:gap-0.5 lg:bg-transparent lg:p-0 lg:shadow-none', GRID_COLS[sections.length] ?? 'grid-cols-3')}>
          {sections.map((section) => {
            const here = section.id === current
            return (
              <li key={section.id} className="min-w-0">
                <Link
                  href={section.href}
                  aria-current={here ? 'page' : undefined}
                  className={cn(
                    'flex min-h-11 items-center justify-center rounded-inner px-1 text-center text-label font-semibold transition-[color,background-color,scale] active:scale-[0.975]',
                    'lg:justify-start lg:gap-2.5 lg:px-3.5 lg:text-left lg:text-body lg:font-medium',
                    here ? 'bg-foreground text-background lg:bg-wash lg:text-foreground lg:shadow-[inset_0_0_0_1px_var(--border)]' : 'text-bone-dim hover:text-foreground lg:hover:bg-wash',
                  )}
                >
                  <span aria-hidden className={cn('hidden size-1.5 shrink-0 rounded-full', here && 'lg:block lg:bg-primary')} />
                  <span className="truncate max-lg:hidden">{t(section.label)}</span>
                  <span className="truncate lg:hidden">{t(`short.${section.label}`)}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      {subnav ? <div className="min-w-0 lg:mt-4 lg:border-t lg:border-hairline lg:pt-4">{subnav}</div> : null}
    </>
  )
}
