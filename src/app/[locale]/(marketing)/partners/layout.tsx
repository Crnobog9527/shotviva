import type { ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'
import { appShellMetadata } from '@/core/seo'
import './partners.css'

export async function generateMetadata() {
  return { ...appShellMetadata(), title: (await getTranslations('affiliate'))('title') }
}
export default function PartnersLayout({ children }: { children: ReactNode }) {
  return <article className="af-shell">{children}</article>
}
