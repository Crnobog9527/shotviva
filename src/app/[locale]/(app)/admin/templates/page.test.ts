import { notFound } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireAdmin = vi.fn()
const listAdminTemplates = vi.fn()
const listAdminCategories = vi.fn()
const listImageProviderOptions = vi.fn()

vi.mock('@/core/auth', () => ({ requireAdmin: () => requireAdmin(), createAdminSupabase: () => ({}) }))
vi.mock('@/core/admin', () => ({
  listAdminTemplates: (client: unknown) => listAdminTemplates(client),
  listAdminCategories: (client: unknown) => listAdminCategories(client),
  listImageProviderOptions: (client: unknown) => listImageProviderOptions(client),
  TemplatesEditor: () => null,
  CategoriesPanel: () => null,
}))
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
vi.mock('@/modules/image', () => ({ CREDITS_FLOOR: {} }))

const { default: AdminTemplatesPage } = await import('./page')

describe('admin templates page', () => {
  beforeEach(() => {
    requireAdmin.mockReset()
    listAdminTemplates.mockReset().mockResolvedValue([])
    listImageProviderOptions.mockReset().mockResolvedValue([])
    listAdminCategories.mockReset().mockResolvedValue([])
  })

  it('404s non-admins before loading any template or prompt', async () => {
    requireAdmin.mockImplementation(() => notFound())
    await expect(AdminTemplatesPage()).rejects.toMatchObject({ digest: expect.stringMatching(/404/) })
    expect(listAdminTemplates).not.toHaveBeenCalled()
    expect(listImageProviderOptions).not.toHaveBeenCalled()
    expect(listAdminCategories).not.toHaveBeenCalled()
  })

  it('loads templates for admins', async () => {
    requireAdmin.mockResolvedValue({ id: 'admin', email: null })
    await AdminTemplatesPage()
    expect(listAdminTemplates).toHaveBeenCalledOnce()
    expect(listAdminCategories).toHaveBeenCalledOnce()
    expect(listImageProviderOptions).toHaveBeenCalledOnce()
  })
})
