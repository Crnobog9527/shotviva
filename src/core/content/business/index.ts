// The pricing page's "For business" plate (DESIGN §6.9 item 8) on its own entry, not in
// '@/core/content': that barrel is imported by client components (app/[locale]/error.tsx), and the
// plate carries the inquiry dialog's button (T86), which only /pricing should ship.
export { BusinessSection, type BusinessBlock } from '../blocks/business-section'
