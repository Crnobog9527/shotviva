// App-only: kept out of balance-chip.tsx and the core/app-shell barrel, which public pages reach,
// so its classes stay out of the public stylesheet (scripts/public-css-check.ts).
// The chip's place while the balance is on its way (Create streams it): the same pill, coin and
// height, with a short neutral bar where the number goes, so the header does not move when it lands.
export function BalanceChipSlot() {
  return (
    <span aria-hidden="true" className="hairline inline-flex h-9 items-center gap-2 rounded-full bg-wash pr-3 pl-2">
      <span className="size-5 rounded-full bg-primary/40" />
      <span className="h-3 w-14 rounded-full bg-muted-foreground/20" />
    </span>
  )
}
