import type { MetadataRoute } from 'next'

import { site } from '@/site/site.config'

// Minimal web app manifest for the "S." icons (T58). display stays `browser`: a standalone
// window would strand OAuth and hosted checkout redirects outside the user's browser.
// Colors are the darkroom `--background` (DESIGN §3.1), the same as the viewport's themeColor.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.brand.name,
    short_name: site.brand.name,
    description: site.brand.tagline,
    start_url: '/',
    display: 'browser',
    background_color: '#0B0A09',
    theme_color: '#0B0A09',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
