import type { MetadataRoute } from 'next'

import { robotsRules } from '@/core/seo'
import { site } from '@/site/site.config'

export default function robots(): MetadataRoute.Robots {
  return robotsRules(site)
}
