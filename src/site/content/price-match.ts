// Is a price or a credit count printed in some text? Shared by the JSON-LD offers (shown-offers.ts)
// and the live weekly check (scripts/seo-weekly-lib.ts), so both read "shown" the same way.
// No imports: scripts load it outside Next.

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// "$19.90", "$99", "$1,050": the way the pages print a price.
export function usdText(amount: number): string {
  return Number.isInteger(amount) ? `$${amount.toLocaleString('en-US')}` : `$${amount.toFixed(2)}`
}

// "$9.90" never matches inside "$19.90" (the "$" is part of the match), and "$99" never "$99.50".
export function showsPrice(text: string, amount: number): boolean {
  return new RegExp(`${escape(usdText(amount))}(?![\\d.,]*\\d)`).test(text)
}

// "1,990 credits", "for 1990 credits", "1,990 积分"; never "990" inside "1,990", or "20" in "20MB".
export function showsCredits(text: string, credits: number): boolean {
  const forms = [credits.toLocaleString('en-US'), String(credits)].map(escape).join('|')
  return new RegExp(`(?<![\\d,.])(?:${forms})\\s*(?:credits|积分)`).test(text)
}
