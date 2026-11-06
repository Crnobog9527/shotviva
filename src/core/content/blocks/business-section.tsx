import type { EventProps } from '../../analytics/events'
import { businessMailto } from './business-mailto'
import { BusinessIcon, MailIcon } from './business-icons'
import { ContactSalesLink } from './contact-sales-link'

// The pricing page's "For business" plate (DESIGN §6.9 item 8), drawn as the studio's order slip
// (comps-v3-b pricing.html, T43; materials in business-slip.css): a "Made to order" tag, who it
// is for, what we can set up on request, and one solid "Contact us". No price, no fourth tier, no
// SLA, SSO or seats: none of this is built yet, so every line reads as something we arrange.
export type BusinessBlock = {
  heading: string
  tag: string
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
      className="biz-slip relative isolate mt-10 rounded-panel px-[18px] pt-6 pb-5 md:px-9 md:pt-8 md:pb-7 lg:px-11 lg:pt-9 lg:pb-8"
    >
      <span className="absolute top-[18px] right-[18px] inline-flex h-7 items-center gap-1.5 rounded-full bg-[rgba(11,10,9,.7)] px-2.5 font-mono text-[13px] leading-none font-medium tracking-[.04em] uppercase shadow-[inset_0_0_0_1px_rgba(242,236,227,.3)]">
        <i aria-hidden="true" className="size-1.5 rounded-full bg-primary shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_25%,transparent)]" />
        {block.tag}
      </span>
      <h2 id="business-h" className="pr-[130px] font-display text-[36px] leading-none tracking-[-0.02em] italic md:text-[44px]">
        {block.heading}
      </h2>
      <p className="mt-2.5 max-w-[60ch] text-body leading-normal text-pretty text-bone-dim">{block.who}</p>
      <ul className="mt-5 border-t border-[rgba(242,236,227,.16)] md:grid md:grid-cols-2 md:gap-x-8 lg:grid-cols-3 lg:gap-x-10">
        {block.items.map((item, i) => (
          <li key={item.title} className="grid grid-cols-[28px_1fr] content-start gap-x-2.5 gap-y-0.5 border-b border-[rgba(242,236,227,.1)] py-3 md:py-3.5">
            <BusinessIcon index={i} />
            <b className="text-body leading-[1.3] font-semibold tracking-[-0.01em]">{item.title}</b>
            <span className="text-caption leading-[1.4] text-muted-foreground">{item.detail}</span>
          </li>
        ))}
      </ul>
      <div className="mt-[18px] flex flex-wrap items-center gap-x-4 gap-y-2 md:mt-[22px]">
        <ContactSalesLink
          href={businessMailto(email, subject, block.prompts)}
          page={page}
          className="press inline-flex min-h-12 w-full items-center justify-center gap-1.5 rounded-control bg-foreground px-5 text-label font-semibold text-background shadow-[inset_0_1px_0_rgba(255,255,255,.5),0_12px_24px_-14px_rgba(0,0,0,.9)] md:w-auto md:min-w-[200px]"
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
