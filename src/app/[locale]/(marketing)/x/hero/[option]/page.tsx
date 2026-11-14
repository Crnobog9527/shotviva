import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { HERO_DEFAULT_OPTION, HERO_OPTIONS } from '@/site/experiments'

import { HomeContent, homeMetadata } from '../../../home-page'

// The home page with one A/B hero option (ARCHITECTURE §16.5). Prerendered once per option and
// language, like `/`; the proxy rewrites `/` and `/zh` here for the visitors on that option, so the
// browser keeps the home address. A direct request for /x/… is a 404 in the proxy; the metadata is
// the home page's own, canonical `/` included.
import '../../../explainer.css'

const OPTIONS: readonly string[] = HERO_OPTIONS.map((option) => option.id).filter((id) => id !== HERO_DEFAULT_OPTION)

export function generateStaticParams() {
  return OPTIONS.map((option) => ({ option }))
}

export function generateMetadata(): Promise<Metadata> {
  return homeMetadata()
}

export default async function HeroOptionPage({ params }: PageProps<'/[locale]/x/hero/[option]'>) {
  const { option } = await params
  if (!OPTIONS.includes(option)) notFound()
  return <HomeContent heroOption={option} />
}
