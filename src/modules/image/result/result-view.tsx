import Link from 'next/link'

import { ActionBar } from '@/core/app-shell'
import { buttonVariants } from '@/core/ui/button'

import type { PhotoItem } from '../photos/photo-item'
import { ResultPhoto } from './result-photo'
import { ShareButton } from './share-button'

// A finished photo opened from Photos (DESIGN §4.4 success): full width at its own ratio, Share
// as the one primary, and the way back into the same template.
export function ResultView({ item, shareText }: { item: PhotoItem; shareText: string }) {
  const fileUrl = item.fileUrl as string
  return (
    <section aria-label={`${item.templateName} photo`} className="px-4 pt-2">
      <ResultPhoto src={fileUrl} alt={`Your photo restyled with ${item.templateName}`} pool={item.creditPool} visibility={item.visibility} />
      <div className="mt-4 flex">
        <Link href={`/generate/${item.templateId}`} className={buttonVariants({ variant: 'glass', size: 'touch', className: 'flex-1' })}>
          Make another with {item.templateName}
        </Link>
      </div>
      <ActionBar>
        <ShareButton fileUrl={fileUrl} name={`shotviva-${item.templateId}`} shareText={shareText} />
      </ActionBar>
    </section>
  )
}
