// Dollar amounts on the cost views. A single image costs fractions of a cent, so per-job and
// per-image figures keep four decimals; totals keep two to three.
export const usdTotal = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 3 })
export const usdFine = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 4, maximumFractionDigits: 4 })
