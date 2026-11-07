'use client'

import { useTranslations } from 'next-intl'
import { useSyncExternalStore } from 'react'

import { Link } from '../../i18n/ui'
import { PhotoPair } from './photo-pair'

// `credits`: the template's own Standard price (建站规格 G4).
export type TryTemplate = { id: string; name: string; use: string; credits: number; before: string; after: string }

const SIZE = { width: 900, height: 1125 }

// One random number per page load in the browser; the server (and hydration) sees 0, so the
// server HTML shows the first three and the shuffle lands right after hydration.
const BROWSER_SEED = typeof window === 'undefined' ? 0 : Math.random()
const noSubscribe = () => () => undefined
const useSeed = () => useSyncExternalStore(noSubscribe, () => BROWSER_SEED, () => 0)

// Three distinct picks from a seed in [0, 1): a seeded Fisher–Yates over a copy.
export function pickThree<T>(items: readonly T[], seed: number): T[] {
  const out = [...items]
  let state = Math.floor(seed * 2 ** 31) || 0
  for (let i = out.length - 1; i > 0; i--) {
    state = (state * 1103515245 + 12345) % 2 ** 31
    const j = state % (i + 1)
    ;[out[i], out[j]] = [out[j] as T, out[i] as T]
  }
  return seed === 0 ? [...items].slice(0, 3) : out.slice(0, 3)
}

// "Three templates to try instead" under the 404 (DESIGN v3-b round 13): three picked at random
// on every load, never Art Styles (its card is the drag compare). The server HTML shows the
// first three so the page is never empty; the pick happens after hydration. Each card opens
// the home page with that template's picker (?open=).
export function TryTemplates({ templates }: { templates: readonly TryTemplate[] }) {
  const t = useTranslations('notFound')
  const cost = useTranslations('app.template')
  const home = useTranslations('marketing.home')
  const picked = pickThree(templates, useSeed())
  // No featured template with covers yet: the 404 keeps just its message and the way home.
  if (picked.length === 0) return null
  return (
    <section className="mt-12" aria-labelledby="try-h">
      <h2 id="try-h" className="text-headline leading-[1.2] font-semibold tracking-[-0.01em]">
        {t('tryTitle')}
      </h2>
      <div className="mt-3 grid gap-3 md:grid-cols-3 md:gap-4">
        {picked.map((card) => (
          <Link key={card.id} href={`/?open=${card.id}`} className="mk-tpl" aria-label={`${card.name}. ${card.use}`}>
            <PhotoPair
              before={{ src: card.before, alt: home('beforeAlt', { name: card.name }), ...SIZE }}
              after={{ src: card.after, alt: home('afterAlt', { name: card.name, use: card.use }), ...SIZE }}
              sizes="(min-width: 768px) 17vw, 50vw"
            />
            <span className="mk-tpl-meta">
              <b>{card.name}</b>
              <span className="mk-use">{card.use}</span>
              <span className="mk-cost">{cost('fromCredits', { count: card.credits })}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
