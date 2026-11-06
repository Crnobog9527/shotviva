import type { ReactNode } from 'react'

import type { HomePage } from '../page-content'
import { PhotoPair } from './photo-pair'

// "Restyle a Photo, Keep the Subject": the part after the last comma is set in italic (the
// comp's one italic; Chinese pages turn italics off in globals.css).
function Headline({ text }: { text: string }) {
  const at = text.lastIndexOf(', ')
  if (at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at + 2)}
      <em>{text.slice(at + 2)}</em>
    </>
  )
}

type Props = { page: HomePage; generator: ReactNode }

// First screen (ARCHITECTURE §13 item 2, DESIGN §6.9): H1, subtitle and the direct answer in
// the server HTML (建站规格 R5, G1), the phone → AI pair with its caption (R9), then the
// generator. ≥1024 the copy and the pair share a row and the generator bench spans under them.
export function HomeHero({ page, generator }: Props) {
  const { hero } = page
  return (
    <section className="mk-hero">
      <div className="mk-hero-copy">
        <h1>
          <Headline text={page.h1} />
        </h1>
        <p className="mk-lede">{page.subtitle}</p>
        <p className="mk-answer">{page.answerBlock}</p>
      </div>
      <figure className="mk-hero-pair">
        <PhotoPair before={hero.before} after={hero.after} size="lg" preload sizes="(min-width: 1024px) 536px, (min-width: 768px) 640px, 100vw" />
        <figcaption className="mk-cap">{hero.caption}</figcaption>
      </figure>
      {generator}
    </section>
  )
}
