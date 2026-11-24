'use client'

import { SiteImage as Image } from '@/core/ui/site-image'
import { cloneElement, isValidElement, type FocusEvent, type ReactNode } from 'react'

import { cn } from '../../ui/cn'
import type { HeroBlock } from '../page-content'
import { useSceneRotation } from './use-scene-rotation'

type Props = {
  scenes: NonNullable<HeroBlock['scenes']>
  tags: { phone: string; ai: string }
  // Rendered width of one plate, for the srcset (home-hero.tsx).
  sizes: string
  // The phone-photo pane, rendered on the server and passed through untouched.
  phonePane: ReactNode
}

// The first scene loads at once like the old single result (`fetchPriority="low"` keeps it out
// of the <head> preload, which is the phone photo's). The later ones are only rendered once the
// page has loaded and gone idle (use-scene-rotation.ts), which is their deferral; `lazy` on top
// of that left them unloaded at opacity 0 in Chrome, so they load as soon as they exist.
const LOADING = { loading: 'eager', fetchPriority: 'low' } as const

// A picture counts as ready once decoded too, so switching to it paints at once.
function decoded(image: HTMLImageElement, then: () => void) {
  image.decode().then(then, then)
}

type PhoneProps = { items: Props['scenes']['items']; active: number; previous: number; sizes: string; markLoaded: (index: number) => void }

// When every scene is its own dish, its phone photo turns with it: the later photos lie over
// the server-rendered first one (marketing.css .mk-pstack), so going back to scene 1 fades the
// last photo out to reveal it. Only rendered once armed, like the later AI scenes.
function PhoneScenes({ items, active, previous, sizes, markLoaded }: PhoneProps) {
  return (
    <span className="mk-pstack">
      {items.map(({ before }, index) =>
        index > 0 && before ? (
          <Image
            key={before.src}
            className={cn('mk-b mk-scene', index === active && 'mk-on', index === previous && (active === 0 ? 'mk-out' : 'mk-was'))}
            src={before.src}
            alt={before.alt}
            aria-hidden={index !== active || undefined}
            width={before.width}
            height={before.height}
            sizes={sizes}
            onLoad={(event) => decoded(event.currentTarget, () => markLoaded(index))}
            {...LOADING}
          />
        ) : null,
      )}
    </span>
  )
}

// The home hero's pair with several AI results of the same phone photo taking turns on the AI
// side (Owner 2026-11-11). Same frame, badges and seam as PhotoPair; the only client part of
// the hero. The scene stack crossfades in marketing.css; captions share one grid cell so a
// longer caption never moves the generator below (no layout shift).
export function HeroScenes({ scenes, tags, sizes, phonePane }: Props) {
  const { items } = scenes
  const turnsPhone = items.some((scene) => scene.before)
  const { active, previous, armed, waiting, pick, markLoaded, hold } = useSceneRotation(items.length, turnsPhone ? 2 : 1)
  const onBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) hold(false)
  }
  return (
    <figure className={cn('mk-hero-pair', waiting !== -1 && 'mk-wait')} onPointerEnter={() => hold(true)} onPointerLeave={() => hold(false)} onFocus={() => hold(true)} onBlur={onBlur}>
      <span className="mk-pair mk-pair-lg">
        {/* While a later dish is up, the first phone photo underneath leaves the accessibility tree,
            so only the pair on screen is announced. */}
        {turnsPhone && active !== 0 && isValidElement<{ 'aria-hidden'?: boolean }>(phonePane) ? cloneElement(phonePane, { 'aria-hidden': true }) : phonePane}
        {turnsPhone && armed ? <PhoneScenes items={items} active={active} previous={previous} sizes={sizes} markLoaded={markLoaded} /> : null}
        <span className="mk-pane">
          {items.map(({ image }, index) =>
            index === 0 || armed ? (
              <Image
                key={image.src}
                className={cn('mk-a mk-scene', index === active && 'mk-on', index === previous && 'mk-was')}
                src={image.src}
                alt={image.alt}
                aria-hidden={index !== active || undefined}
                width={image.width}
                height={image.height}
                sizes={sizes}
                onLoad={(event) => decoded(event.currentTarget, () => markLoaded(index))}
                {...LOADING}
              />
            ) : null,
          )}
        </span>
        <span className="mk-hl" aria-hidden />
        <span className="mk-tag mk-tag-l" aria-hidden>
          {tags.phone}
        </span>
        <span className="mk-tag mk-tag-r" aria-hidden>
          {tags.ai}
        </span>
        <span className="mk-dots" role="group" aria-label={scenes.label}>
          {items.map((scene, index) => (
            <button key={scene.image.src} type="button" className="mk-dot" aria-label={scene.caption} aria-pressed={index === active} onClick={() => pick(index)} />
          ))}
        </span>
      </span>
      <figcaption className="mk-cap mk-scene-caps">
        {items.map((scene, index) => (
          <span key={scene.image.src} className={cn(index === active && 'mk-on')}>
            {scene.caption}
          </span>
        ))}
      </figcaption>
    </figure>
  )
}
