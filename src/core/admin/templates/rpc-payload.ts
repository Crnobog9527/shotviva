import type { PromptInput, TemplateInput } from '@/core/templates'

// Maps validated input onto the snake_case JSON the admin_upsert_template SQL function reads.
// Optional fields are omitted (not nulled) so an edit keeps the stored position, status and
// covers (the editor never sends covers; the cover upload writes them).
export function toUpsertArgs(template: TemplateInput, prompt: PromptInput) {
  return {
    p_template: {
      id: template.id,
      module: template.module,
      name: template.name,
      category: template.category,
      fields: template.fields,
      quality: template.quality,
      credits_cost: template.creditsCost,
      visible_in: template.visibleIn,
      ...(template.translations === undefined ? {} : { translations: template.translations }),
      ...(template.coverBeforeUrl === undefined ? {} : { cover_before_url: template.coverBeforeUrl }),
      ...(template.coverAfterUrl === undefined ? {} : { cover_after_url: template.coverAfterUrl }),
      ...(template.sortOrder === undefined ? {} : { sort_order: template.sortOrder }),
      ...(template.isActive === undefined ? {} : { is_active: template.isActive }),
    },
    p_prompt: { body: prompt.body, model_params: prompt.modelParams },
  }
}
