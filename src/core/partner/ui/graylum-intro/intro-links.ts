// The two links out of the Graylum introduction (account page → 连接的应用), with the tracking
// Graylum reads. Production sends people to Graylum's production site; every other deployment
// (preview, the test site, local dev) to Graylum's staging site, the same split the partner key
// makes (partner-auth.ts: a live key only where VERCEL_ENV is 'production'). Both hosts are in
// site.config partners.graylum.returnToHosts.
export const GRAYLUM_ORIGINS = { production: 'https://www.graylum.com', other: 'https://auth-staging.graylum.com' } as const

export type GraylumLinks = { view: string; connect: string }

const tracking = (content: 'view' | 'connect') =>
  `from=shotviva&utm_source=shotviva&utm_medium=integration&utm_campaign=graylum&utm_content=${content}`

export function graylumIntroLinks(vercelEnv: string | undefined): GraylumLinks {
  const origin = vercelEnv === 'production' ? GRAYLUM_ORIGINS.production : GRAYLUM_ORIGINS.other
  return { view: `${origin}/?${tracking('view')}`, connect: `${origin}/app/integrations?${tracking('connect')}` }
}
