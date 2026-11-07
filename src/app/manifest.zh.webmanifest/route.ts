import { manifestResponse, webManifest } from '@/core/seo'
import zh from '@/site/messages/zh.json'
import { site } from '@/site/site.config'

// Public by nature: the Chinese web app manifest (T65), linked from /zh pages; it starts at /zh,
// so a Chinese page added to the home screen opens in Chinese. The description is its own message,
// not the header tagline next to the wordmark, so rewording the header leaves the app name alone.
export function GET() {
  return manifestResponse(webManifest(site, 'zh', zh.marketing.appDescription))
}
