import { useTranslations } from 'next-intl'

import { Link } from '../../i18n/ui'
import type { HomePage, ImageRef, TemplateCard, TemplateCategory } from '../page-content'
import { CompareSlider } from './compare-slider'
import { PhotoPair } from './photo-pair'

// Where each template's pair comes from: its live cover when the admin has set one, else the
// bundled illustrative sample. `live` marks templates the home generator can pick.
export type TemplateMedia = { before: string; after: string; live: boolean }
export type TemplateLookup = Readonly<Record<string, TemplateMedia>>

type Props = { grid: HomePage['templateGrid']; media: TemplateLookup; isLinkEnabled: (href: string) => boolean }

const CARD_SIZES = '(min-width: 1024px) 552px, (min-width: 768px) 50vw, 100vw'

function images(card: TemplateCard, media: TemplateMedia, t: ReturnType<typeof useTranslations>): { before: ImageRef; after: ImageRef } {
  const size = { width: 900, height: 1125 }
  return {
    before: { src: media.before, alt: t('beforeAlt', { name: card.name }), ...size },
    after: { src: media.after, alt: t('afterAlt', { name: card.name, use: card.use }), ...size },
  }
}

function Meta({ card, price }: { card: TemplateCard; price: string }) {
  return (
    <span className="mk-tpl-meta">
      <b>{card.name}</b>
      <span className="mk-use">{card.use}</span>
      <span className="mk-cost">{price}</span>
    </span>
  )
}

// One card: the pair, then name, use and price, all in the HTML (建站规格 R5). A live template
// is a button that picks it into the generator (DESIGN §6.9 item 2: no confirm step).
function PairCard({ card, media, price }: { card: TemplateCard; media: TemplateMedia; price: string }) {
  const t = useTranslations('marketing.home')
  const pair = <PhotoPair {...images(card, media, t)} sizes={CARD_SIZES} />
  if (!media.live) {
    return (
      <div className="mk-tpl">
        {pair}
        <Meta card={card} price={price} />
      </div>
    )
  }
  return (
    <button type="button" className="mk-tpl" data-pick-template={card.id} aria-label={t('pickAria', { name: card.name, use: card.use })}>
      {pair}
      <Meta card={card} price={price} />
    </button>
  )
}

// A category with one template: the sample on the left, the words beside it. Art Styles keeps
// the draggable compare; the others are a pair.
function Solo({ card, media, price, art }: { card: TemplateCard; media: TemplateMedia; price: string; art: boolean }) {
  const t = useTranslations('marketing.home')
  return (
    <div className={art ? 'mk-solo mk-solo-art' : 'mk-solo'}>
      {art ? (
        <CompareSlider {...images(card, media, t)} label={t('compareLabel', { name: card.name })} sizes="(min-width: 1024px) 420px, 100vw" />
      ) : (
        <PairCard card={card} media={media} price={price} />
      )}
      <div className="mk-solo-meta">
        <b>{card.name}</b>
        <span className="mk-use">{art ? t('withDragHint', { use: card.use }) : card.use}</span>
        <span className="mk-cost">{price}</span>
        {media.live ? (
          <button type="button" className="mk-ghost-pill" data-preview-template={card.id}>
            {t('preview')}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function Category({ category, index, ...rest }: { category: TemplateCategory; index: number; media: TemplateLookup; price: string; isLinkEnabled: (href: string) => boolean }) {
  const links = (category.links ?? []).filter((link) => rest.isLinkEnabled(link.href))
  const [first] = category.templates
  const mediaOf = (card: TemplateCard): TemplateMedia => rest.media[card.id] ?? { before: '', after: '', live: false }
  return (
    <div className="mk-cat mk-reveal">
      <div className="mk-cat-head">
        <h3>{category.name}</h3>
        <p>
          {category.intro}
          {links.map((link) => (
            <span key={link.href}>
              {' '}
              <Link href={link.href}>{link.anchor}</Link>
            </span>
          ))}
        </p>
      </div>
      {category.templates.length === 1 ? (
        <Solo card={first} media={mediaOf(first)} price={rest.price} art={index === 0} />
      ) : (
        <ul className="mk-tgrid" data-count={category.templates.length}>
          {category.templates.map((card) => (
            <li key={card.id}>
              <PairCard card={card} media={mediaOf(card)} price={rest.price} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// H2-2: one H3 per category, Art Styles first; every template name and use is in the HTML
// source (建站规格 R5, §4 H2-2).
export function TemplateGrid({ grid, media, isLinkEnabled }: Props) {
  return (
    <section className="mk-tpl-wrap" id="templates" aria-labelledby="tpl-h">
      <div className="mk-hd mk-reveal">
        <h2 className="mk-h2" id="tpl-h">
          {grid.heading}
        </h2>
        <p className="mk-intro">{grid.intro}</p>
      </div>
      {grid.categories.map((category, index) => (
        <Category key={category.name} category={category} index={index} media={media} price={grid.price} isLinkEnabled={isLinkEnabled} />
      ))}
      <p className="mk-note">{grid.note}</p>
    </section>
  )
}
