import { beforeEach, describe, expect, it, vi } from 'vitest'

// The old Help & feedback pages (T27) only redirect now, in the request's language, to the
// account page with the dialog open where they used to be (T68).
const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT ${url}`)
})
let locale: 'en' | 'zh' = 'en'

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: (url: string) => redirect(url),
}))
vi.mock('@/core/i18n/server', async () => {
  const { localizePath } = await import('@/core/i18n/paths')
  return { localized: async (path: string) => localizePath(path, locale) }
})

const { default: HelpPage } = await import('./[locale]/(app)/account/help/page')
const { default: NewTicketPage } = await import('./[locale]/(app)/account/help/new/page')
const { default: TicketPage } = await import('./[locale]/(app)/account/help/[id]/page')

const ID = '3f2b8c1e-9a4d-4e7b-8c21-5d6f7a8b9c0d'
type TicketProps = Parameters<typeof TicketPage>[0]
const ticket = (id: string) => ({ params: Promise.resolve({ locale, id }), searchParams: Promise.resolve({}) }) as unknown as TicketProps

beforeEach(() => {
  redirect.mockClear()
})

describe.each([
  ['en', ''],
  ['zh', '/zh'],
] as const)('old help routes in %s', (lang, prefix) => {
  beforeEach(() => {
    locale = lang
  })

  it('/account/help → My tickets', async () => {
    await expect(HelpPage()).rejects.toThrow(`REDIRECT ${prefix}/account?help=list`)
  })

  it('/account/help/new → New ticket', async () => {
    await expect(NewTicketPage()).rejects.toThrow(`REDIRECT ${prefix}/account?help=new`)
  })

  it('/account/help/<id> → that ticket', async () => {
    await expect(TicketPage(ticket(ID))).rejects.toThrow(`REDIRECT ${prefix}/account?help=${ID}`)
  })

  it('/account/help/<junk> → My tickets', async () => {
    await expect(TicketPage(ticket('junk'))).rejects.toThrow(`REDIRECT ${prefix}/account?help=list`)
  })
})
