// Two balances (ARCHITECTURE §6.1): 'free' (signup / promo gifts, makes free works: public,
// watermarked) and 'paid' (purchases and compensation, makes paid works: private by default,
// clean, commercial use). Each work records the pool it was charged from.
// No server-only import: job views and future UI read these too.
export const CREDIT_POOLS = ['free', 'paid'] as const
export type CreditPool = (typeof CREDIT_POOLS)[number]
