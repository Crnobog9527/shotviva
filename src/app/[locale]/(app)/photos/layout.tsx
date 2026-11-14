import { requireModule } from '@/core/config/navigation'
import { ViewerHost } from '@/modules/image'
import { site } from '@/site/site.config'

import { deleteWorkAction, prepareAgainAction } from './actions'

// Photos lists image generations: with modules.image = false it 404s like /generate.
// A work opens in the viewer over the grid (2026-11-12); the viewer lives here, around both
// /photos and /photos/[jobId], so it survives the page under it refreshing.
export default function PhotosLayout({ children }: LayoutProps<'/[locale]'>) {
  requireModule(site, 'image')
  return <ViewerHost actions={{ deleteWork: deleteWorkAction, prepareAgain: prepareAgainAction }}>{children}</ViewerHost>
}
