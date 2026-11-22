'use client'

import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import type { TemplateShareItem } from '@/core/template-shares/rules'
import { cn } from '@/core/ui/cn'

import { useShareSelection } from './share-selection'

type Props = { item: TemplateShareItem; className?: string; children?: ReactNode }


// A card's corner while Create is in share mode: a round check (filled safelight once picked)
// and the picked ring around the card (DESIGN "the selected template ring"), drawn over the card
// and never in the way of its tap. Out of share mode it is `children` (the save heart) or nothing.
export function PickMark({ item, className, children }: Props) {
  const selection = useShareSelection()
  if (!selection?.selecting) return children ?? null
  return <Mark picked={selection.has(item)} className={className} />
}

// Its own component: only Create (in the app's messages) ever draws it.
function Mark({ picked, className }: { picked: boolean; className?: string }) {
  const t = useTranslations('app.templateShare')
  return (
    <span className={cn('pointer-events-none absolute -inset-1.5 z-6 rounded-[22px]', picked && 'shadow-[inset_0_0_0_1.5px_var(--primary)]', className)}>
      <span aria-hidden="true" className={cn(
        'absolute top-3 right-3 grid size-8 place-items-center rounded-full backdrop-blur-md',
        picked ? 'bg-primary text-primary-foreground' : 'bg-black/45 text-foreground shadow-[inset_0_0_0_1.5px_rgba(242,236,227,.7)]',
      )}>
        {picked ? <Check className="size-4.5" strokeWidth={3} /> : null}
      </span>
      <span className="sr-only">{picked ? t('picked') : t('notPicked')}</span>
    </span>
  )
}
