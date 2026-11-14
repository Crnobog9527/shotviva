import type { Metadata } from 'next'

import { HomeContent, homeMetadata } from './home-page'

// The pictures of the home how-to blocks (card-visual.tsx); only this page draws them.
import './explainer.css'

export function generateMetadata(): Promise<Metadata> {
  return homeMetadata()
}

// The home page in the request's language (ARCHITECTURE §17); JSON-LD in the same language.
// An A/B hero option is served from x/hero/[option] at this same address (ARCHITECTURE §16.5).
export default function HomePage() {
  return <HomeContent />
}
