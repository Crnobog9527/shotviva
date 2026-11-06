/* eslint-disable @next/next/no-img-element -- auth-gated download route, not a static asset */
import Link from 'next/link'
import { useTranslations } from 'next-intl'

// "Edited from" on a photo made by editing another (ARCHITECTURE §5.2): the source's thumbnail
// and a link back to it. Placeholder layout until T6's edit comps land.
export function EditedFrom({ parent }: { parent: { id: string; fileUrl: string } }) {
  const t = useTranslations('app.result')
  return (
    <Link href={`/photos/${parent.id}`} className="hairline mt-3 flex min-h-[52px] items-center gap-3 rounded-panel px-3 py-2 text-label">
      <img src={parent.fileUrl} alt="" className="size-10 rounded-md bg-photo-ground object-cover" />
      <span className="flex-1">{t('editedFrom')}</span>
      <span aria-hidden>›</span>
    </Link>
  )
}
