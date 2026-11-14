import { getTranslations } from 'next-intl/server'

import { Link } from '@/core/i18n/ui'

// Only for notFound() thrown by a group's own layout: pages are caught by the groups'
// not-found.tsx inside their layouts ((marketing), (app)); an address that matches no route is
// app/global-not-found.tsx, and /zh addresses without a Chinese page get the proxy's 404. Here
// only the root layout stands, which carries no stylesheet, and this boundary imports none on
// purpose: with inlineCss every page would carry a copy of it in its HTML. So it is plain text.
export default async function NotFound() {
  const t = await getTranslations('notFound')
  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '64px 16px', fontFamily: 'system-ui, sans-serif', lineHeight: 1.5 }}>
      <h1 style={{ fontSize: 28, margin: '0 0 12px' }}>
        {t('heading')} {t('headingEm')}
      </h1>
      <p>{t('body')}</p>
      <p>
        <Link href="/">{t('home')}</Link>
      </p>
    </main>
  )
}
