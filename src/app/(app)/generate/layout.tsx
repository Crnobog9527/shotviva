import { requireModule } from '@/core/config'
import { site } from '@/site/site.config'

// Module switch: with modules.image = false every /generate route 404s (ARCHITECTURE §1.1).
// The workspace page itself is T8.
export default function GenerateLayout({ children }: LayoutProps<'/'>) {
  requireModule(site, 'image')
  return children
}
