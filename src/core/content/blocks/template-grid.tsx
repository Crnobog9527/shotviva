import { useTranslations } from 'next-intl'

import { Link } from '../../i18n/ui'
import type { HomePage, ImageRef, TemplateCard, TemplateCategory } from '../page-content'
import { CompareSlider } from './compare-slider'
import { PhotoPair } from './photo-pair'

// Each featured template's covers as the admin set them (T53: no bundled samples); a template
// without both shows an empty pair frame. `live` marks templates the home generator can pick.
export type TemplateMedia = { before: string | null; after: string | null; live: boolean }
export type TemplateLookup = Readonly<Record<string, TemplateMedia>>
// The featured templates grouped for the page, and their covers (site/content/home-templates).
export type FeaturedSections = { categories: readonly TemplateCategory[]; media: TemplateLookup }

// Heading and intro from the page's copy; the categories with their featured templates from the
// database (T53), each card at its own Standard price (建站规格 G4). The landing pages show a
// subset with their own heading; no `note`.
type Grid = Pick<HomePage['templateGrid'], 'heading' | 'intro' | 'note'>
type Props = { grid: Pick<Grid, 'heading' | 'intro'> & Partial<Pick<Grid, 'note'>>; sections: FeaturedSections; isLinkEnabled: (href: string) => boolean }

// One plate of a card's pair: 172 px on a 375 px phone, 174 px at 800, 274 px at 1280.
const CARD_SIZES = '(min-width: 1024px) 276px, (min-width: 768px) 25vw, 50vw'

// "from 1 credit": the template's own Standard price.
function Cost({ card }: { card: TemplateCard }) {
  const t = useTranslations('app.template')
  return <span className="mk-cost">{t('fromCredits', { count: card.credits })}</span>
}

function images(card: TemplateCard, media: TemplateMedia, t: ReturnType<typeof useTranslations>): { before: ImageRef; after: ImageRef } | null {
  if (!media.before || !media.after) return null
  const size = { width: 900, height: 1125 }
  return {
    before: { src: media.before, alt: t('beforeAlt', { name: card.name }), ...size },
    after: { src: media.after, alt: t('afterAlt', { name: card.name, use: card.use }), ...size },
  }
}

// A template whose covers are not uploaded yet: the pair's frame, empty.
const blankPair = (
  <span className="mk-pair mk-pair-blank" aria-hidden>
    <span className="mk-pane" />
    <span className="mk-pane" />
    <span className="mk-hl" />
  </span>
)

function Meta({ card }: { card: TemplateCard }) {
  return (
    <span className="mk-tpl-meta">
      <b>{card.name}</b>
      <span className="mk-use">{card.use}</span>
      <Cost card={card} />
    </span>
  )
}

// One card: the pair, then name, use and price, all in the HTML (建站规格 R5). A live template
// is a button that picks it into the generator (DESIGN §6.9 item 2: no confirm step). `size`:
// 'lg' in a single-template row (home.html solo(): 20px corners, labels on top).
function PairCard({ card, media, size = 'card' }: { card: TemplateCard; media: TemplateMedia; size?: 'lg' | 'card' }) {
  const t = useTranslations('marketing.home')
  const pictures = images(card, media, t)
  const pair = pictures ? <PhotoPair {...pictures} size={size} sizes={CARD_SIZES} /> : blankPair
  if (!media.live) {
    return (
      <div className="mk-tpl">
        {pair}
        <Meta card={card} />
      </div>
    )
  }
  return (
    <button type="button" className="mk-tpl" data-pick-template={card.id} aria-label={t('pickAria', { name: card.name, use: card.use })}>
      {pair}
      <Meta card={card} />
    </button>
  )
}

// A category with one template: the sample on the left, the words beside it. Art Styles keeps
// the draggable compare; the others are a pair.
function Solo({ card, media, art }: { card: TemplateCard; media: TemplateMedia; art: boolean }) {
  const t = useTranslations('marketing.home')
  const pictures = images(card, media, t)
  return (
    <div className={art ? 'mk-solo mk-solo-art' : 'mk-solo'}>
      {art && pictures ? (
        <CompareSlider {...pictures} label={t('compareLabel', { name: card.name })} sizes="(min-width: 1024px) 420px, 100vw" />
      ) : (
        <PairCard card={card} media={media} size="lg" />
      )}
      <div className="mk-solo-meta">
        <b>{card.name}</b>
        <span className="mk-use">{art && pictures ? t('withDragHint', { use: card.use }) : card.use}</span>
        <Cost card={card} />
        {media.live ? (
          <button type="button" className="mk-ghost-pill" data-preview-template={card.id}>
            {t('preview')}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function Category({ category, ...rest }: { category: TemplateCategory; media: TemplateLookup; isLinkEnabled: (href: string) => boolean }) {
  const links = (category.links ?? []).filter((link) => rest.isLinkEnabled(link.href))
  const [first] = category.templates
  const mediaOf = (card: TemplateCard): TemplateMedia => rest.media[card.id] ?? { before: null, after: null, live: false }
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
        <Solo card={first} media={mediaOf(first)} art={category.drag === true} />
      ) : (
        <ul className="mk-tgrid" data-count={category.templates.length}>
          {category.templates.map((card) => (
            <li key={card.id}>
              <PairCard card={card} media={mediaOf(card)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// H2-2: one H3 per category, Art Styles first; every template name and use is in the HTML
// source (建站规格 R5, §4 H2-2). Nothing published yet: no section.
export function TemplateGrid({ grid, sections, isLinkEnabled }: Props) {
  const { categories, media } = sections
  if (categories.length === 0) return null
  return (
    <section className="mk-tpl-wrap" id="templates" aria-labelledby="tpl-h">
      <div className="mk-hd mk-reveal">
        <h2 className="mk-h2" id="tpl-h">
          {grid.heading}
        </h2>
        <p className="mk-intro">{grid.intro}</p>
      </div>
      {categories.map((category) => (
        <Category key={category.name} category={category} media={media} isLinkEnabled={isLinkEnabled} />
      ))}
      {grid.note ? <p className="mk-note">{grid.note}</p> : null}
    </section>
  )
}
