import { SiteImage as Image } from '@/core/ui/site-image'
import { useTranslations } from 'next-intl'

import { Link } from '../../i18n/ui'
import type { HeroBlock, ImageRef } from '../page-content'

// The pair is the LCP element: preloaded, never lazy (建站规格 R9).
function HeroImage({ image, label }: { image: ImageRef; label: string }) {
  return (
    <figure>
      <Image
        src={image.src}
        alt={image.alt}
        width={image.width}
        height={image.height}
        preload
        unoptimized={image.src.endsWith('.svg')}
      />
      <figcaption>{label}</figcaption>
    </figure>
  )
}

export function HeroSection({ hero, showCta }: { hero: HeroBlock; showCta: boolean }) {
  const t = useTranslations('marketing.hero')
  return (
    <section aria-label={t('label')}>
      <div className="grid grid-cols-2 gap-4">
        <HeroImage image={hero.before} label={t('before')} />
        <HeroImage image={hero.after} label={t('after')} />
      </div>
      <p>{hero.caption}</p>
      {showCta && <Link href={hero.cta.href}>{hero.cta.label}</Link>}
    </section>
  )
}
