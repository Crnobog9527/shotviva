import type { EventProps } from '../../analytics/events'
import { buttonVariants } from '../../ui/button'
import { businessMailto } from './business-mailto'
import { ContactSalesLink } from './contact-sales-link'

// The pricing page's "For business" plate (DESIGN §6.9 item 8, comps-v3-b pricing.html): who it
// is for, what we can set up on request, and one ghost "Contact us". No price, no fourth tier,
// no SLA, SSO or seats: none of this is built yet, so every line reads as something we arrange.
export type BusinessBlock = {
  heading: string
  who: string
  items: readonly { title: string; detail: string }[]
  cta: string
  // The line beside the button, before and after the address (the address is the config's).
  aside: readonly [string, string]
  // The mail body: one prompt a line, for the sender to fill in.
  prompts: readonly string[]
}

// `subject` is the same English line on every language so the Owner can filter on it.
type Props = { block: BusinessBlock; email: string; subject: string; page: EventProps<'contact_sales_click'>['page'] }

export function BusinessSection({ block, email, subject, page }: Props) {
  return (
    <section
      aria-labelledby="business-h"
      className="mt-8 rounded-panel bg-[linear-gradient(180deg,color-mix(in_srgb,var(--foreground)_4%,var(--card)),var(--card)_160px)] px-4 pt-5 pb-4 shadow-[inset_0_0_0_1px_var(--border)] md:px-8 md:pt-7 md:pb-6 lg:px-10 lg:pt-8 lg:pb-7"
    >
      <h2 id="business-h" className="font-display text-[32px] leading-none tracking-[-0.02em]">
        {block.heading}
      </h2>
      <p className="mt-2 max-w-[60ch] text-body leading-normal text-pretty text-bone-dim">{block.who}</p>
      <ul className="mt-4 border-t border-hairline md:grid md:grid-cols-2 md:gap-x-8 lg:grid-cols-3 lg:gap-x-10">
        {block.items.map((item) => (
          <li key={item.title} className="grid gap-0.5 border-b border-hairline py-3 md:py-3.5">
            <b className="text-body leading-[1.3] font-semibold tracking-[-0.01em]">{item.title}</b>
            <span className="text-caption leading-[1.4] text-muted-foreground">{item.detail}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 md:mt-5">
        <ContactSalesLink
          href={businessMailto(email, subject, block.prompts)}
          page={page}
          className={buttonVariants({ variant: 'glass', size: 'touch', className: 'min-h-12 w-full gap-1.5 rounded-control text-label md:w-auto md:min-w-[180px]' })}
        >
          <MailIcon />
          {block.cta}
        </ContactSalesLink>
        <small className="text-caption text-muted-foreground">
          {block.aside[0]}
          {email}
          {block.aside[1]}
        </small>
      </div>
    </section>
  )
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px] text-primary" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5.5" width="17" height="13" rx="3" />
      <path d="M4 7l8 6 8-6" />
    </svg>
  )
}
