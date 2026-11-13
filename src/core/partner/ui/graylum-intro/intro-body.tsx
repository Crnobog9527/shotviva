'use client'

import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Dialog as DialogPrimitive } from 'radix-ui'

import { ConnectionCard } from './connection-card'
import type { GraylumLinks } from './intro-links'
import { INTRO_SHOTS } from './intro-shots'
import { ShotThumb, type ViewShot } from './shot-thumb'

type Props = { connected: boolean; links: GraylumLinks; disconnect: () => Promise<void>; onView: ViewShot }

// The scrolling middle of the introduction, top to bottom: the one-line intro (the dialog's
// description), why Graylum exists, the connection, then 能做什么 / 什么时候适合用 told by
// Graylum's own screenshots, and what connecting changes.
export function IntroBody({ connected, links, disconnect, onView }: Props) {
  const t = useTranslations('partner.intro')
  const [hero, ...uses] = INTRO_SHOTS
  return (
    <>
      <DialogPrimitive.Description className="text-[17px] leading-[1.55] font-medium text-pretty text-foreground">{t('tagline')}</DialogPrimitive.Description>
      <p data-intro-idea="" className="mt-3 text-[15px] leading-[1.65] text-pretty text-bone-dim">{t('idea')}</p>
      <ConnectionCard connected={connected} connectUrl={links.connect} disconnect={disconnect} />
      <Section title={t('what')}>
        {hero && (
          <figure>
            <ShotThumb shot={hero} index={0} onView={onView} className="aspect-[1344/840]" />
            <figcaption className="mt-2 text-caption leading-[1.45] text-muted-foreground">{t(`shots.${hero.key}.note`)}</figcaption>
          </figure>
        )}
      </Section>
      <Section title={t('when')}>
        <ul role="list" className="grid grid-cols-1 gap-x-3 gap-y-5 sm:grid-cols-3">
          {uses.map((shot, at) => (
            <li key={shot.key}>
              <figure>
                <ShotThumb shot={shot} index={at + 1} onView={onView} className="aspect-[4/3]" />
                <figcaption className="mt-2 grid gap-0.5">
                  <b className="text-[15px] leading-[1.35] font-semibold">{t(`shots.${shot.key}.label`)}</b>
                  <span className="text-caption leading-[1.45] text-muted-foreground">{t(`shots.${shot.key}.note`)}</span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </Section>
      <Section title={t('after.title')}>
        <ul role="list" className="grid gap-2.5">
          {AFTER.map(key => t(`after.${key}`)).map(line => (
            <li key={line} className="grid grid-cols-[18px_1fr] gap-2.5 text-[15px] leading-[1.55] text-bone-dim">
              <Check aria-hidden strokeWidth={2.4} className="mt-[3px] size-[18px] text-success" />
              {line}
            </li>
          ))}
        </ul>
      </Section>
    </>
  )
}

const AFTER = ['line1', 'line2', 'line3'] as const

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h3 className="mb-3 text-headline leading-[1.25] font-semibold tracking-[-0.015em]">{title}</h3>
      {children}
    </section>
  )
}
