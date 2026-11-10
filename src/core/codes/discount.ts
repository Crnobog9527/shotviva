// Imported directly by the paywall, the pack prices and the discount summary: the codes index
// also re-exports the zod invite-reward schema, which must not reach the browser.

// One USD line item, quantity one. Round the discount to cents before subtracting it.
export function discountedPriceCents(priceCents: number, percent: number): number {
  const subtotal = BigInt(priceCents)
  const discount = (subtotal * BigInt(percent) + BigInt(50)) / BigInt(100)
  return Number(subtotal - discount)
}

// Chinese discount names express the fraction paid. 25% off is 七五折.
export function percentZh(percent: number): string {
  const paid = 100 - percent
  return `${paid % 10 === 0 ? paid / 10 : paid} 折`
}
