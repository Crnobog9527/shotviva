import { beforeEach, describe, expect, it, vi } from 'vitest'

// /s/t/<id> (ARCHITECTURE §5.1g): open to anyone with the link, always noindex, no share image;
// an unknown or revoked link is the "not available" page; the page hands the client only what
// a public catalogue card shows.

const mocks = vi.hoisted(() => ({ collection: null as unknown, page: vi.fn((props: unknown) => props) }))
const cover = { type: 'image', before: 'https://a/b.webp', after: 'https://a/a.webp', motion: null, poster: null }
const shown = (id: string) => ({ id, name: id, description: null, category: 'food', categoryName: 'Food', compare: false, cover })
const collection = {
  id: 'abc123def456', title: 'Spring menu', note: 'Pick one',
  entries: [{ type: 'template', template: shown('solo') }, { type: 'series', series: { id: 's1', name: 'Dark', description: null, cover: null, categoryName: 'Food', members: [shown('m1'), shown('m2')] } }],
}

vi.mock('server-only', () => ({}))
vi.mock('next/server', () => ({ connection: async () => undefined }))
vi.mock('@/app/auth/actions', () => ({ googleAction: async () => undefined }))
vi.mock('@/core/i18n/server', () => ({ currentLocale: async () => 'en' }))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string, values?: object) => (values ? `${key}:${JSON.stringify(values)}` : key) }))
vi.mock('../../../t/[templateId]/share-cta-slot', () => ({ giftOf: async () => 'gift', signedIn: async () => false }))
vi.mock('@/modules/image/share-page', () => ({ SharedTemplateMissing: (props: unknown) => ({ missing: props }) }))
vi.mock('@/modules/image/template-collection-page', () => ({
  loadTemplateCollection: async () => mocks.collection,
  TemplateCollectionPage: mocks.page,
  CollectionViewer: ({ children }: { children: unknown }) => children,
  CollectionViewerStatus: () => null,
}))

const { default: Page, generateMetadata, instant } = await import('./page')
const props = { params: Promise.resolve({ shareId: 'abc123def456' }) } as never

describe('/s/t/[shareId]', () => {
  beforeEach(() => {
    mocks.collection = collection
    mocks.page.mockClear()
  })

  it('is noindex for a live link and a missing one alike, canonical to itself', async () => {
    for (const value of [collection, null]) {
      mocks.collection = value
      const meta = await generateMetadata(props)
      expect(meta.robots).toMatchObject({ index: false })
      expect(String(meta.alternates?.canonical)).toBe('https://shotviva.com/s/t/abc123def456')
    }
  })

  it('previews with the first pick’s public cover', async () => {
    const meta = await generateMetadata(props)
    expect(JSON.stringify(meta.openGraph)).toContain('https://a/a.webp')
  })

  it('renders per request, so a revoke shows at once', () => {
    expect(instant).toBe(false)
  })

  it('shows the not-available page for an unknown or revoked link', async () => {
    mocks.collection = null
    const element = (await Page(props)) as { props: object }
    expect(JSON.stringify(element)).toContain('missingTitle')
    expect(mocks.page).not.toHaveBeenCalled()
  })

  it('hands the page the picks in order with counts, and nothing private', async () => {
    const element = (await Page(props)) as { props: { children: { props: { collection: unknown; text: { kicker: string; seriesCount: object } } } } }
    const page = element.props.children.props
    expect(page.collection).toBe(collection)
    expect(page.text.kicker).toBe('kicker:{"count":3}')
    expect(page.text.seriesCount).toEqual({ s1: 'seriesCount:{"count":2}' })
    expect(JSON.stringify(page)).not.toMatch(/creditsCost|copyFields|toggles|prompt|user_?id/)
  })
})
