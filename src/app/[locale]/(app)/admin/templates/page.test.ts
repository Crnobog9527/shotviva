import { notFound } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireAdmin = vi.fn()
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
vi.mock('@/modules/image', () => ({ CREDITS_FLOOR: {}, loadPanelSummary: () => Promise.resolve(null) }))

const { default: AdminTemplatesPage } = await import('./page')

describe('admin templates page', () => {
  beforeEach(() => {
    requireAdmin.mockReset()
    listAdminTemplates.mockReset().mockResolvedValue([])
    readPricingOptions.mockReset().mockResolvedValue([])
    listAdminSeriesOptions.mockReset().mockResolvedValue([])
    listAdminCategoryTree.mockReset().mockResolvedValue([])
  })

  it('404s non-admins before loading any template or prompt', async () => {
    requireAdmin.mockImplementation(() => notFound())
    await expect(AdminTemplatesPage()).rejects.toMatchObject({ digest: expect.stringMatching(/404/) })
    expect(listAdminTemplates).not.toHaveBeenCalled()
    expect(readPricingOptions).not.toHaveBeenCalled()
    expect(listAdminSeriesOptions).not.toHaveBeenCalled()
    expect(listAdminCategoryTree).not.toHaveBeenCalled()
  })

  it('loads templates for admins', async () => {
    requireAdmin.mockResolvedValue({ id: 'admin', email: null })
    await AdminTemplatesPage()
    expect(listAdminTemplates).toHaveBeenCalledOnce()
    expect(listAdminSeriesOptions).toHaveBeenCalledOnce()
    expect(listAdminCategoryTree).toHaveBeenCalledOnce()
    expect(readPricingOptions).toHaveBeenCalledOnce()
  })
})
