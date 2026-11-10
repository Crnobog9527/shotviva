// The paywall's light entry: the provider and the button that opens the drawer, without the
// pricing page's plans and cards that index.ts also exports. A page that imports the index
// (even from a server component) gets every client component it re-exports in its first-load
// JavaScript; the home page and the marketing landings only need these two (mobile
// Lighthouse, 2026-11-11). The drawer itself still loads on first open (paywall-context.tsx).
export { PaywallButton } from './paywall-button'
export { PaywallProvider, usePaywall, type PaywallTrigger } from './paywall-context'
