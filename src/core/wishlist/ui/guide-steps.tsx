'use client'

import Image from 'next/image'
import { useFormatter, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { cn } from '../../ui/cn'
import { ChevronIcon, HeartIcon } from './icons'
import { useStepRail } from './use-step-rail'

// The vote count on the example pill: an illustration, not a real request.
const EXAMPLE_VOTES = 46
const STEPS = ['say', 'vote', 'ship'] as const

// The teaching sheet's three steps (Owner 2026-11-10), one per swipe: what to send, how the
// votes decide, where the finished template lands. Each step shows the real wall's own piece
// (the handwritten note, the vote pill, the shipped line), so the wall looks familiar after.
export function GuideSteps() {
  const t = useTranslations('app.wishlist.guide')
  const { rail, index, onScroll, goTo } = useStepRail(STEPS.length)
  return (
    <div className="mt-4">
      <div ref={rail} onScroll={onScroll} className="wl-guide-rail" aria-roledescription="carousel" aria-label={t('stepsLabel')}>
        {STEPS.map((step, i) => (
          <section key={step} className="wl-guide-step" aria-roledescription="slide" aria-label={t('stepLabel', { n: i + 1, total: STEPS.length })}>
            <Picture step={step} />
            <h3 className="mt-4 text-headline font-semibold tracking-[-0.015em]">{t(`steps.${step}.title`)}</h3>
            <p className="mt-1 text-body leading-normal text-pretty text-bone-dim">{t(`steps.${step}.text`)}</p>
          </section>
        ))}
      </div>
      <div className="mt-3 flex justify-center gap-1">
        {STEPS.map((step, i) => (
          <button
            key={step}
            type="button"
            onClick={() => goTo(i)}
            aria-label={t('stepLabel', { n: i + 1, total: STEPS.length })}
            aria-current={i === index ? 'step' : undefined}
            className="grid size-11 place-items-center"
          >
            <span aria-hidden="true" className={cn('h-1.5 rounded-full transition-all duration-300 ease-house', i === index ? 'w-5 bg-foreground' : 'w-1.5 bg-wash-strong')} />
          </button>
        ))}
      </div>
    </div>
  )
}

function Plate({ children }: { children: ReactNode }) {
  return <div className="wl-guide-plate">{children}</div>
}

function Picture({ step }: { step: (typeof STEPS)[number] }) {
  const t = useTranslations('app.wishlist')
  const format = useFormatter()
  if (step === 'say') {
    return (
      <Plate>
        <Image src="/home/example-dish-before.webp" alt="" width={56} height={70} sizes="56px" className="wl-guide-ref" />
        <p className="wl-text min-w-0 flex-1">{t('guide.example')}</p>
      </Plate>
    )
  }
  if (step === 'vote') {
    return (
      <Plate>
        <span className="wl-vote wl-vote-on" role="img" aria-label={t('votesAria', { count: EXAMPLE_VOTES })}>
          <HeartIcon />
          <span className="wl-w">{t('wantThis')}</span>
          <span className="wl-c">{format.number(EXAMPLE_VOTES)}</span>
        </span>
      </Plate>
    )
  }
  return (
    <Plate>
      <span className="flex min-w-0 items-center gap-2 text-label font-medium text-success">
        <span className="min-w-0">{t.rich('nowTemplate', { name: t('guide.exampleTemplate'), b: (chunks) => <b className="font-semibold">{chunks}</b> })}</span>
        <ChevronIcon />
      </span>
    </Plate>
  )
}
