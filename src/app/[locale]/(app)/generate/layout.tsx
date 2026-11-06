import { requireModule } from '@/core/config'
import { site } from '@/site/site.config'

// Module switch: with modules.image = false every /generate route 404s (ARCHITECTURE §1.1).
export default function GenerateLayout({ children }: LayoutProps<'/[locale]'>) {
  requireModule(site, 'image')
  return children
}
