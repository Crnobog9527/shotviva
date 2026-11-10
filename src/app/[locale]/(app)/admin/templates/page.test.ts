import { renderToStaticMarkup } from 'react-dom/server'
import { PhotoPreloads } from './photo-preloads'
import { notFound } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireAdmin = vi.fn()
const preparePanelSummary = vi.fn(() => ({ summary: Promise.resolve(null), previews: async () => [] }))
const listAdminTemplates = vi.fn()
const listAdminCategoryTree = vi.fn()
const readPricingOptions = vi.fn()
const listAdminSeriesOptions = vi.fn()

vi.mock('@/core/auth', () => ({ requireAdmin: () => requireAdmin(), createAdminSupabase: () => ({}) }))
vi.mock('@/core/admin', () => ({
  listAdminTemplates: (client: unknown) => listAdminTemplates(client),
  TemplatesEditor: () => null,
  CategoriesPanel: () => null,
}))
vi.mock('@/core/admin/template-categories', () => ({ listAdminCategoryTree: (db: unknown) => listAdminCategoryTree(db) }))
vi.mock('@/core/admin/template-series', () => ({ seriesCopy: { title: "系列管理" }, listAdminSeriesOptions: (db: unknown) => listAdminSeriesOptions(db) }))
vi.mock('./category-actions', () => ({ moveTemplateCategoryAction: vi.fn() }))
vi.mock('@/site/template-pricing', () => ({ readPricingOptions: (client: unknown) => readPricingOptions(client) }))
vi.mock('./actions', () => ({
  saveTemplateAction: vi.fn(),
  setTemplateActiveAction: vi.fn(),
  setTemplatesActiveAction: vi.fn(),
  bulkEditTemplatesAction: vi.fn(),
  setTemplateOrderAction: vi.fn(),
  setFeaturedTemplatesAction: vi.fn(),
  requestCoverUploadAction: vi.fn(),
  applyCoverAction: vi.fn(),
  saveTemplateCategoryAction: vi.fn(),
  reorderTemplateCategoriesAction: vi.fn(),
  deleteTemplateCategoryAction: vi.fn(),
}))
vi.mock('@/core/storage', () => ({ r2Store: () => ({}) }))
vi.mock('@/modules/image', () => ({ CREDITS_FLOOR: {}, preparePanelSummary: () => preparePanelSummary() }))

const { default: AdminTemplatesPage } = await import('./page')

describe('admin templates page', () => {
  beforeEach(() => {
    requireAdmin.mockReset()
    preparePanelSummary.mockClear()
    listAdminTemplates.mockReset().mockResolvedValue([])
    readPricingOptions.mockReset().mockResolvedValue([])
    listAdminSeriesOptions.mockReset().mockResolvedValue([])
    listAdminCategoryTree.mockReset().mockResolvedValue([])
  })

  it('404s non-admins before loading any template or prompt', async () => {
    requireAdmin.mockImplementation(() => notFound())
    await expect(AdminTemplatesPage({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({ digest: expect.stringMatching(/404/) })
    expect(preparePanelSummary).not.toHaveBeenCalled()
    expect(listAdminTemplates).not.toHaveBeenCalled()
    expect(readPricingOptions).not.toHaveBeenCalled()
    expect(listAdminSeriesOptions).not.toHaveBeenCalled()
    expect(listAdminCategoryTree).not.toHaveBeenCalled()
  })

  it('loads templates for admins', async () => {
    requireAdmin.mockResolvedValue({ id: 'admin', email: null })
    await AdminTemplatesPage({ searchParams: Promise.resolve({}) })
    expect(listAdminTemplates).toHaveBeenCalledOnce()
    expect(listAdminSeriesOptions).toHaveBeenCalledOnce()
    expect(listAdminCategoryTree).toHaveBeenCalledOnce()
    expect(readPricingOptions).toHaveBeenCalledOnce()
  })
})

it('emits an SSR image hint for the available private object only', async () => {
  const photo = { id: 'old', lastUsedAt: '', originalUrl: '/old-original', url: '/missing-thumb', thumbnailMissing: true }
  const markup = renderToStaticMarkup(await PhotoPreloads({ previews: Promise.resolve([
    photo, { ...photo, id: 'new', originalUrl: '/new-original', url: '/present-thumb', thumbnailMissing: false },
  ]) }))
  expect(markup).toContain('rel="preload"')
  expect(markup).toContain('/old-original')
  expect(markup).toContain('/present-thumb')
  expect(markup).not.toContain('/missing-thumb')
  expect(markup).not.toContain('/new-original')
})
