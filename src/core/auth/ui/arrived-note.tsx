'use client'

import { useTranslations } from 'next-intl'

type Props = {
  // What the visitor was doing: developing a photo on the home page, or connecting Graylum.
  kind: 'home' | 'graylum'
  page: 'login' | 'signup'
  // The kept photo (an object URL) or Graylum's mark.
  image: string
}

// The line under a login or sign-up title (design/comps-v3-b/auth.html `?next=photo|graylum`).
export function ArrivedNote({ kind, page, image }: Props) {
  const t = useTranslations('auth.arrived')
  return (
    <div className="au-kept">
      {/* eslint-disable-next-line @next/next/no-img-element -- a 36px object URL or a static mark */}
      <img src={image} alt="" width={36} height={36} />
      <div>
        <b>{t(`${kind}.title`)}</b>
        {t(`${kind}.${page}`)}
      </div>
    </div>
  )
}
