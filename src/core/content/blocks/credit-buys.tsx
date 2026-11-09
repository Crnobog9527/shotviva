// "What a credit buys" on /pricing (comps-v3-b pricing.html): the credits one photo costs at
// each resolution, as a definition list on one flat plate. The page fills the numbers from the
// published templates (T91); the content's own config numbers stand in when there are none.
export type CreditBuysBlock = {
  heading: string
  tiers: readonly { name: string; credits: number }[]
  unit: string
  // The unit after 1 ("1 credit"); languages without a singular leave it out.
  unitOne?: string
  note: string
}

export function CreditBuys({ block }: { block: CreditBuysBlock }) {
  return (
    <section aria-labelledby="credit-buys-h" className="rounded-[20px] bg-card p-4 shadow-[inset_0_0_0_1px_var(--border)]">
      <h2 id="credit-buys-h" className="text-headline leading-[1.3] font-semibold tracking-[-0.015em]">
        {block.heading}
      </h2>
      <dl className="mt-3 grid grid-cols-3 border-y border-hairline">
        {block.tiers.map((tier, i) => (
          <div key={tier.name} className={i > 0 ? 'border-l border-hairline py-3 pl-4' : 'py-3'}>
            <dt className="text-caption text-muted-foreground">{tier.name}</dt>
            <dd className="mt-1 font-display text-[24px] leading-none">
              {tier.credits}
              <small className="ml-1 font-mono text-caption font-medium text-bone-dim">{tier.credits === 1 ? (block.unitOne ?? block.unit) : block.unit}</small>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-caption text-muted-foreground">{block.note}</p>
    </section>
  )
}
