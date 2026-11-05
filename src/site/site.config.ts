import { defineSite } from '@/core/config'

export const site = defineSite({
  brand: { name: 'Shotviva', domain: 'shotviva.com', tagline: '' },
  modules: { image: false, video: false },
  locales: { default: 'en', enabled: ['en'] },
  billing: { freeCredits: 3 },
})
