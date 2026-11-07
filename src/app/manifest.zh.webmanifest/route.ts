import { manifestResponse, webManifest } from '@/core/seo'
import zh from '@/site/messages/zh.json'
import { site } from '@/site/site.config'

// Public by nature: the Chinese web app manifest (T65), linked from /zh pages; it starts at /zh,
// so a Chinese page added to the home screen opens in Chinese.
export function GET() {
  return manifestResponse(webManifest(site, 'zh', zh.marketing.nav.tagline))
}
