// /pricing's heading block (comps-v3-b pricing.html): the serif H1 with its one italic tail,
// the lede, and the free-images line with a gift mark. No visible breadcrumbs (DESIGN §8.7);
// the BreadcrumbList stays in the JSON-LD (建站规格 R7).
export type PricingHeroText = { h1: string; h1Em: string; intro: string; currencyNote?: string; gift: string }

export function PricingHero({ text }: { text: PricingHeroText }) {
  const em = text.h1Em && text.h1.endsWith(text.h1Em) ? text.h1Em : ''
  return (
    <header className="pt-4 md:max-w-[560px] md:pt-10 lg:pt-12">
      <h1 className="font-display text-h1 leading-none tracking-[-0.02em] text-balance md:text-title">
        {em ? text.h1.slice(0, -em.length) : text.h1}
        {em ? <em>{em}</em> : null}
      </h1>
      <p className="mt-3 text-body text-pretty text-bone-dim">
        {text.intro}{text.currencyNote && <span className="inline-block">{text.currencyNote}</span>}
      </p>
      <p className="mt-3 flex items-start gap-2 text-caption leading-[1.4] text-bone-dim">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="mt-0.5 size-4 flex-none text-primary" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7S10.5 3 8 3.8C6 4.4 7 7 12 7zm0 0s1.5-4 4-3.2C18 4.4 17 7 12 7z" />
        </svg>
        {text.gift}
      </p>
    </header>
  )
}
