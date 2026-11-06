'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/core/ui/cn'
import { Reveal } from '@/core/ui/reveal-item'

import { CreateDialog, type CreateContext } from '../workspace/create-dialog'
import { categoriesOf, hasStills, isArtStyle, isMotion, type CatalogueTemplate } from './catalogue-template'
import { ALL, CategoryChips } from './category-chips'
import { FeatureCard } from './feature-card'
import { TemplateCard } from './template-card'

type Props = { templates: CatalogueTemplate[]; create: CreateContext }

// Create's catalogue (B comp create.html): the featured card, a sticky chip bar, the grid of
// side-by-side pair cards (one column on phones, two from md, three from lg; the Art Styles
// compare is the tall card), and the creation dialog every card opens (DESIGN §6.9 item 2). The
// feature and each card fade up once as they enter (core/ui/reveal, DESKTOP-NOTES item 6).
export function TemplateCatalogue({ templates, create }: Props) {
  const t = useTranslations('app.create')
  const [category, setCategory] = useState(ALL)
  const [openId, setOpenId] = useState<string | null>(null)
  const featured = templates.find((t) => isMotion(t) && t.cover.type === 'video')
  const shown = category === ALL ? templates : templates.filter((t) => t.category === category)
  const { sentinel, stuck } = useStuck()

  if (templates.length === 0) {
    return <p className="px-(--gutter) pt-6 text-body text-muted-foreground">{t('empty')}</p>
  }
  return (
    <>
      {featured ? (
        <Reveal className="px-(--gutter)">
          <FeatureCard template={featured} onOpen={setOpenId} />
        </Reveal>
      ) : null}
      <div ref={sentinel} aria-hidden="true" className="mt-4 h-px md:mt-6" />
      <div data-stuck={stuck || undefined} className="nav-material sticky top-0 z-40 py-2 data-[stuck]:pt-[calc(var(--sat)+8px)] md:top-14 md:data-[stuck]:pt-2">
        <CategoryChips categories={categoriesOf(templates)} value={category} onChange={setCategory} />
      </div>
      <h2 className="sr-only">{t('templates')}</h2>
      <ul className="mt-2 grid grid-flow-row-dense grid-cols-1 gap-x-3 gap-y-6 px-(--gutter) md:mt-3 md:grid-cols-2 md:gap-x-4 lg:grid-cols-3">
        {shown.map((template, index) => (
          <Reveal as="li" key={template.id} className={cn(isArtStyle(template) && hasStills(template) && 'md:row-span-2')}>
            <TemplateCard template={template} onOpen={setOpenId} eager={index < 3} />
          </Reveal>
        ))}
      </ul>
      <p className="px-(--gutter) pt-4 pb-2 text-caption leading-[1.4] text-muted-foreground">{t('illustrative')}</p>
      <CreateDialog template={templates.find((item) => item.id === openId) ?? null} onClose={() => setOpenId(null)} {...create} />
    </>
  )
}

// True once the chip bar has stuck to the top: only then does it pad for the top safe area, so a
// notched phone shows no empty band above the chips at rest.
function useStuck() {
  const sentinel = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    const element = sentinel.current
    if (!element) return
    const observer = new IntersectionObserver(([entry]) => setStuck(entry ? !entry.isIntersecting && entry.boundingClientRect.top < 0 : false))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return { sentinel, stuck }
}
