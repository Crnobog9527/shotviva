import type { Balance } from '../billing/pools'

// Balance wording (DESIGN §4.3, "The Credits Unit Rule"): always credits, paid and free shown
// apart. Inside the app the gift is "6 free credits", never "3 free Standard images".

const credits = (n: number) => `${n} ${n === 1 ? 'credit' : 'credits'}`

// Short form for the chip in the top bar: "6 free", "30 credits", "30 + 6 free".
export function balanceChipLabel({ paid, free }: Balance): string {
  if (paid > 0 && free > 0) return `${paid} + ${free} free`
  if (free > 0) return `${free} free`
  return credits(paid)
}

// Full sentence: "You have 6 free credits." / "You have 30 credits and 6 free credits."
export function balanceSentence({ paid, free }: Balance): string {
  if (paid === 0 && free === 0) return 'You have 0 credits left.'
  if (paid > 0 && free > 0) return `You have ${credits(paid)} and ${free} free ${free === 1 ? 'credit' : 'credits'}.`
  if (free > 0) return `You have ${free} free ${free === 1 ? 'credit' : 'credits'}.`
  return `You have ${credits(paid)}.`
}
