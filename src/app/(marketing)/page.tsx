import { useTranslations } from 'next-intl'

import { site } from '@/site/site.config'

export default function HomePage() {
  const t = useTranslations('home')
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-2 p-8">
      <h1 className="text-3xl font-semibold">{site.brand.name}</h1>
      <p>{t('placeholder')}</p>
    </section>
  )
}
