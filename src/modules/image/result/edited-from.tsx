/* eslint-disable @next/next/no-img-element -- auth-gated download route, not a static asset */
import { Link } from '@/core/i18n/ui'
import { useTranslations } from 'next-intl'

export type EditParent = { id: string; fileUrl: string; name: string }

// "Edited from" on a photo made by editing another (ARCHITECTURE §5.2, T6 comp ?edited=1): the
// source's 44×55 thumbnail, its name, and a link back to it.
export function EditedFrom({ parent }: { parent: EditParent }) {
  const t = useTranslations('app.edit')
  return (
    <Link href={`/photos/${parent.id}`} className="hairline press mt-3 flex min-h-[71px] items-center gap-3 rounded-panel bg-card px-3 py-2">
      <img src={parent.fileUrl} alt="" className="h-[55px] w-11 flex-none rounded-md bg-photo-ground object-cover" />
      <span className="grid flex-1 gap-0.5">
        <span className="text-caption text-muted-foreground">{t('editedFromLabel')}</span>
        <span className="text-body font-medium">{parent.name}</span>
      </span>
      <span aria-hidden="true" className="text-muted-foreground">
        ›
      </span>
    </Link>
  )
}

// "Your change": the words the edit was asked with, as typed (the user's own, not a prompt). It
// takes the place of "Your note", which an edit never has, in the same card.
export function YourChange({ text }: { text: string }) {
  const t = useTranslations('app.edit')
  return (
    <figure className="hairline mt-3 rounded-panel bg-wash px-3.5 py-3 text-body leading-[1.4]">
      <figcaption className="mb-1 text-caption leading-none font-medium text-muted-foreground">{t('yourChange')}</figcaption>
      <blockquote className="break-words whitespace-pre-line">{text}</blockquote>
    </figure>
  )
}
