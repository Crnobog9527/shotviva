'use client'

import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState, type Ref } from 'react'

import { Link } from '../../i18n/ui'
import { Button } from '../../ui/button'
import { cn } from '../../ui/cn'
import { chooseConsent, closeConsentSettings } from '../consent/store'
import type { ConsentChoice } from '../consent/decision'
import { useConsent } from './use-consent'

type Mode = 'ask' | 'settings'

// Where the bar sits (DESIGN §8.2, §8.4): a floating material card 12px off the bottom; on a
// phone tab root it rides above the tab bar; on a phone flow page with a fixed action bar it
// moves to the top, where toasts come from, so the one primary stays reachable. Under drawers
// and dialogs (z-100), over the tab and action bars (z-60).
const PLACE = cn(
  'fixed inset-x-3 bottom-[calc(var(--sab)+12px)] z-90 mx-auto max-w-[880px]',
  'max-md:[html:has(nav[data-tabbar])_&]:bottom-[calc(var(--sab)+72px)]',
  'max-md:[html:has([data-action-bar])_&]:top-[calc(var(--sat)+12px)] max-md:[html:has([data-action-bar])_&]:bottom-auto',
)

function returnFocus(mode: Mode) {
  if (mode === 'settings') document.querySelector<HTMLElement>('[data-cookie-settings]')?.focus()
}

// The bar itself (T70), loaded on demand by ConsentSlot. Two equal choices: neither is the
// page's primary (DESIGN §8.7: one primary per page), and "Necessary only" is as easy as "Accept".
export default function ConsentBar({ mode }: { mode: Mode }) {
  const t = useTranslations('consent')
  const { consent } = useConsent()
  const first = useRef<HTMLButtonElement>(null)
  const choose = (choice: ConsentChoice) => {
    chooseConsent(choice)
    returnFocus(mode)
  }
  const close = () => {
    closeConsentSettings()
    returnFocus(mode)
  }
  useEffect(() => {
    if (mode !== 'settings') return
    first.current?.focus()
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close only reads the mode
  }, [mode])
  const current = mode === 'settings' ? consent.choice : null
  const { bar, height } = useBarHeight()
  return (
    <>
      {/* In-flow room at the end of the page: the footer and the last section scroll clear of the bar. */}
      <div aria-hidden="true" style={{ height }} />
      <section ref={bar} aria-label={t('label')} data-consent-bar="" className={cn(PLACE, 'consent-in rounded-tile bg-background/94 backdrop-blur-[24px] backdrop-saturate-[1.4] shadow-[inset_0_0_0_1px_var(--border),inset_0_1px_0_var(--edge-highlight),var(--shadow-sheet)] p-4 md:flex md:items-center md:gap-6 md:py-3 md:pr-3 md:pl-5')}>
        {mode === 'settings' ? (
          <button type="button" onClick={close} aria-label={t('close')} className="press absolute top-1.5 right-1.5 grid size-11 place-items-center rounded-full md:hidden">
            <span className="grid size-[30px] place-items-center rounded-full bg-wash-strong">
              <X className="size-4" aria-hidden />
            </span>
          </button>
        ) : null}
        <p className={cn('text-caption leading-normal text-pretty text-bone-dim md:flex-1', mode === 'settings' && 'max-md:pr-10')}>
          {mode === 'settings' ? <b className="block font-semibold text-foreground">{t('settingsTitle')}</b> : null}
          {t.rich('body', {
            lead: (chunks) => <span className="text-foreground">{chunks}</span>,
            link: (chunks) => (
              <Link href="/privacy#analytics" className="whitespace-nowrap text-foreground underline decoration-hairline underline-offset-4 hover:decoration-current">
                {chunks}
              </Link>
            ),
          })}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 md:mt-0 md:flex md:flex-none">
          <ChoiceButton ref={first} chosen={current === 'necessary'} onClick={() => choose('necessary')}>
            {t('necessary')}
          </ChoiceButton>
          <ChoiceButton chosen={current === 'accepted'} onClick={() => choose('accepted')}>
            {t('accept')}
          </ChoiceButton>
          {mode === 'settings' ? (
            <button type="button" onClick={close} aria-label={t('close')} className="press hidden size-11 place-items-center rounded-full text-muted-foreground hover:text-foreground md:grid">
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </section>
    </>
  )
}

function useBarHeight() {
  const bar = useRef<HTMLElement>(null)
  const [height, setHeight] = useState(0)
  useEffect(() => {
    const element = bar.current
    if (!element) return
    const observer = new ResizeObserver(() => setHeight(element.offsetHeight + 24))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return { bar, height }
}

type ChoiceProps = { chosen: boolean; onClick(): void; children: string; ref?: Ref<HTMLButtonElement> }

// The answer in force, when reopened from Cookie settings: the house "chosen" rim (safelight
// over a faint wash), forced over the glass button's own hairline.
function ChoiceButton({ chosen, onClick, children, ref }: ChoiceProps) {
  return (
    <Button ref={ref} type="button" variant="glass" size="touch" aria-pressed={chosen} onClick={onClick} className={cn('md:min-w-36', chosen && 'chosen !shadow-[inset_0_0_0_1.5px_var(--primary)]')}>
      {children}
    </Button>
  )
}
