import type { PromptInput, TemplateInput } from '@/core/templates'

// Maps validated input onto the snake_case JSON the admin_upsert_template SQL function reads.
// Optional fields are omitted (not nulled) so an edit keeps the stored position, status and
// covers (the editor never sends covers; the cover upload writes them).
// `category` is a template_categories key from the admin form, sent as `category_key` so an
// unknown one fails on the foreign key (T75). With `categoryByName` (the prompt import) it is
// sent as `category` instead: a key or an English / Chinese category name, resolved in the
// database (0581 trigger), and a value no category has gets a category of its own.
export function toUpsertArgs(template: TemplateInput, prompt: PromptInput, options: { categoryByName?: boolean } = {}) {
  return {
    p_template: {
      id: template.id,
      module: template.module,
      name: template.name,
      ...(options.categoryByName ? { category: template.category } : { category_key: template.category }),
      fields: template.fields,
      quality: template.quality,
      credits_cost: template.creditsCost,
      visible_in: template.visibleIn,
      ...(template.translations === undefined ? {} : { translations: template.translations }),
      ...(template.description === undefined ? {} : { description: template.description }),
      ...(template.coverBeforeUrl === undefined ? {} : { cover_before_url: template.coverBeforeUrl }),
      ...(template.coverAfterUrl === undefined ? {} : { cover_after_url: template.coverAfterUrl }),
      ...(template.sortOrder === undefined ? {} : { sort_order: template.sortOrder }),
      ...(template.isActive === undefined ? {} : { is_active: template.isActive }),
    },
    p_prompt: {
      body: prompt.body,
      model_params: prompt.modelParams,
      ...(prompt.providerId === undefined ? {} : { provider_id: prompt.providerId }),
    },
  }
}
