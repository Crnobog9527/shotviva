import { site } from '@/site/site.config'

// "It comes from Shotviva <mail@shotviva.com>" on the check-your-email views: the From address of
// the auth emails (ARCHITECTURE §7), not the contact address.
export const sender = `${site.brand.name} <${site.brand.authEmail}>`
