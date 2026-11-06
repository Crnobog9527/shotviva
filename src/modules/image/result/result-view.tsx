import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { ActionBar } from '@/core/app-shell'
import { buttonVariants } from '@/core/ui/button'

import { EDIT_TEMPLATE_ID } from '@/core/templates/edit-params'

import type { PhotoItem } from '../photos/photo-item'
import { EditedFrom } from './edited-from'
import { ResultPhoto } from './result-photo'
import { ShareButton } from './share-button'

// A finished photo opened from Photos (DESIGN §4.4 success): full width at its own ratio, Share
// as the one primary, and the way back into the same template.
// `parent` is the work an edit was made from (ARCHITECTURE §5.2), when it still exists.
export function ResultView({ item, shareText, parent }: { item: PhotoItem; shareText: string; parent?: { id: string; fileUrl: string } | null }) {
  const t = useTranslations('app')
  const fileUrl = item.fileUrl as string
  return (
    <section aria-label={t('photos.photoAlt', { name: item.templateName })} className="px-4 pt-2">
      <ResultPhoto src={fileUrl} alt={t('workspace.resultAlt', { name: item.templateName })} pool={item.creditPool} visibility={item.visibility} />
      {parent ? <EditedFrom parent={parent} /> : null}
      {/* An edit has no template page to go back to. */}
      {item.templateId === EDIT_TEMPLATE_ID ? null : (
        <div className="mt-4 flex">
          <Link href={`/generate/${item.templateId}`} className={buttonVariants({ variant: 'glass', size: 'touch', className: 'flex-1' })}>
            {t('result.makeAnotherWith', { name: item.templateName })}
          </Link>
        </div>
      )}
      <ActionBar>
        <ShareButton fileUrl={fileUrl} name={`shotviva-${item.templateId}`} shareText={shareText} />
      </ActionBar>
    </section>
  )
}
