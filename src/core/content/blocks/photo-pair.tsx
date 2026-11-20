import { SiteImage as Image } from '@/core/ui/site-image'
import { useTranslations } from 'next-intl'

import { cn } from '../../ui/cn'
import { WhiteGroundImage } from '../../ui/white-ground-image'
import type { ImageRef } from '../page-content'

type Props = {
  before: ImageRef
  after: ImageRef
  // 'lg': the hero and single-template rows (20px corners, labels on top); default: a card.
  size?: 'lg' | 'card'
  // The hero pair is above the fold: never lazy (建站规格 R9). Only the phone photo is
  // preloaded, so on a phone one right-sized image, not two, competes with the CSS for the
  // first paint.
  preload?: boolean
  // Rendered width of ONE plate (half the pair), for the image srcset. The pair's own width
  // here made every plate download at twice the pixels it shows.
  sizes: string
  className?: string
  decorative?: boolean
  showcase?: boolean
}

// The side-by-side pair (DESIGN §6.9 item 1): the phone photo on the left, the AI result on the
// right, one frame with a hairline between. On the right plate the phone photo sits under the
// result so the hover wipe (marketing.css) can develop one into the other; nothing depends on it.
// The result has white behind it: a transparent cut-out cover reads as white, not as that photo.
// React preloads every non-lazy <img> it renders on the server; `fetchPriority="low"` is what
// keeps the hero's right plate out of the <head> while it still loads at once (Chrome raises
// an in-viewport image's priority after layout).
const afterLoading = (preload: boolean) => (preload ? ({ loading: 'eager', fetchPriority: 'low' } as const) : ({ loading: 'lazy' } as const))

// The phone-photo half on its own, also used by the hero's rotating scenes (hero-scenes.tsx).
// In the hero (`preload`) a picture with a first frame draws that small copy from the document
// itself, under the full picture: the plate is filled at the first paint instead of one request
// later, and the full picture covers it as soon as it has loaded (same crop, same filter). A
// plain <img> with `decoding="sync"`, so the frame is decoded for the very first paint; as a CSS
// background it was decoded off-thread and appeared a few frames late, behind hydration.
export function BeforePane({ image, preload, sizes, showcase = false }: { image: ImageRef; preload: boolean; sizes: string; showcase?: boolean }) {
  return (
    <span className="mk-pane">
      {showcase ? <Image className="mk-fill" src={image.src} alt="" aria-hidden width={image.width} height={image.height} sizes={sizes} loading="lazy" /> : null}
      {/* eslint-disable-next-line @next/next/no-img-element -- a data: URI, nothing for next/image to resize */}
      {preload && image.firstFrame ? <img className="mk-ff" src={image.firstFrame} width={image.width} height={image.height} alt="" aria-hidden decoding="sync" /> : null}
      <Image className="mk-b" src={image.src} alt={image.alt} width={image.width} height={image.height} sizes={sizes} preload={preload} loading={preload ? undefined : 'lazy'} />
    </span>
  )
}

type AfterProps = { after: ImageRef; sizes: string; preload: boolean; showcase: boolean; alt: string }

// The AI result. In a showcase the plate is fitted to its frame over a blurred fill of itself.
function AfterImage({ after, sizes, preload, showcase, alt }: AfterProps) {
  const plate = <WhiteGroundImage className="mk-a" src={after.src} alt={alt} width={after.width} height={after.height} sizes={sizes} fitPlate={showcase || undefined} {...afterLoading(preload)} />
  if (!showcase) return plate
  return (
    <span className="mk-result">
      <Image className="mk-fill" src={after.src} alt="" aria-hidden width={after.width} height={after.height} sizes={sizes} loading="lazy" />
      {plate}
    </span>
  )
}

export function PhotoPair({ before, after, size = 'card', preload = false, sizes, className, decorative, showcase = false }: Props) {
  const t = useTranslations('marketing.home')
  return (
    <span className={cn('mk-pair', size === 'lg' && 'mk-pair-lg', className)} aria-hidden={decorative || undefined}>
      <BeforePane image={decorative ? { ...before, alt: '' } : before} preload={preload} sizes={sizes} showcase={showcase} />
      <span className="mk-pane">
        {showcase ? <Image className="mk-fill" src={before.src} alt="" aria-hidden width={before.width} height={before.height} sizes={sizes} loading="lazy" /> : null}
        <Image className="mk-ph" src={before.src} alt="" aria-hidden width={before.width} height={before.height} sizes={sizes} loading="lazy" />
        <AfterImage after={after} sizes={sizes} preload={preload} showcase={showcase} alt={decorative ? '' : after.alt} />
        <span className="mk-ws" aria-hidden />
      </span>
      <span className="mk-hl" aria-hidden />
      <span className="mk-tag mk-tag-l" aria-hidden>
        {t('phone')}
      </span>
      <span className="mk-tag mk-tag-r" aria-hidden>
        {t('ai')}
      </span>
    </span>
  )
}
