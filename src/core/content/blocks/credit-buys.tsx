export type CreditBuysBlock = { heading: string; note: string }

export function CreditBuys({ block }: { block: CreditBuysBlock }) {
  return (
    <section aria-labelledby="credit-buys-h" className="rounded-[20px] bg-card p-4 shadow-[inset_0_0_0_1px_var(--border)]">
      <h2 id="credit-buys-h" className="text-headline leading-[1.3] font-semibold tracking-[-0.015em]">
        {block.heading}
      </h2>
      <p className="mt-3 text-caption text-muted-foreground">{block.note}</p>
    </section>
  )
}
