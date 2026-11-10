'use client'

import { useTranslations } from 'next-intl'

import { cn } from '../../ui/cn'
import { GUIDE_STEPS } from './guide-demo-card'
import { GuideDemo } from './guide-demo'
import type { Tour } from './onboarding-rules'

type Props = { tour: Tour; onJump(step: number): void }

// The teaching sheet's three steps (Owner 2026-11-10, walked in order since 2026-11-11): what to
// send, how the votes decide, where the finished template lands. Each shows the wall's own card
// acting that step out, so the wall looks familiar after. The dots show the progress and go
// back to a step already seen; one not yet shown is greyed and does nothing.
export function GuideSteps({ tour, onJump }: Props) {
  const t = useTranslations('app.wishlist.guide')
  const step = GUIDE_STEPS[tour.step]
  const total = GUIDE_STEPS.length
  return (
    <section className="mt-4" aria-label={t('stepsLabel')}>
      <GuideDemo step={step} visit={tour.visit} />
      <div aria-live="polite">
        <div key={step} className="wl-guide-copy">
          <p className="sr-only">{t('stepLabel', { n: tour.step + 1, total })}</p>
          <h3 className="mt-4 text-headline font-semibold tracking-[-0.015em]">{t(`steps.${step}.title`)}</h3>
          <p className="mt-1 text-body leading-normal text-pretty text-bone-dim">{t(`steps.${step}.text`)}</p>
        </div>
      </div>
      <div className="mt-3 flex justify-center gap-1">
        {GUIDE_STEPS.map((name, i) => (
          <button
            key={name}
            type="button"
            onClick={() => onJump(i)}
            disabled={i > tour.reached}
            aria-label={t('stepLabel', { n: i + 1, total })}
            aria-current={i === tour.step ? 'step' : undefined}
            className="group grid size-11 place-items-center disabled:cursor-default"
          >
            <span
              aria-hidden="true"
              className={cn(
                'h-1.5 rounded-full transition-all duration-300 ease-house',
                i === tour.step ? 'w-5 bg-foreground' : i <= tour.reached ? 'w-1.5 bg-bone-dim group-hover:bg-foreground' : 'w-1.5 bg-wash-strong',
              )}
            />
          </button>
        ))}
      </div>
    </section>
  )
}
