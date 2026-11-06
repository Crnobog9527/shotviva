import { requireModule } from '@/core/config'
import { site } from '@/site/site.config'

// Photos lists image generations: with modules.image = false it 404s like /generate.
export default function PhotosLayout({ children }: LayoutProps<'/[locale]'>) {
  requireModule(site, 'image')
  return children
}
