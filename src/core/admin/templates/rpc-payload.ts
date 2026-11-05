import type { PromptInput, TemplateInput } from '@/core/templates'

// Maps validated input onto the snake_case JSON the admin_upsert_template SQL function reads.
// Optional fields are omitted (not nulled) so an edit keeps the stored position and status.
export function toUpsertArgs(template: TemplateInput, prompt: PromptInput) {
  return {
    p_template: {
      id: template.id,
      module: template.module,
      name: template.name,
      category: template.category,
      cover_before_url: template.coverBeforeUrl ?? '',
      cover_after_url: template.coverAfterUrl ?? '',
      fields: template.fields,
      credits_cost: template.creditsCost,
      visible_in: template.visibleIn,
      ...(template.sortOrder === undefined ? {} : { sort_order: template.sortOrder }),
      ...(template.isActive === undefined ? {} : { is_active: template.isActive }),
    },
    p_prompt: { body: prompt.body, model_params: prompt.modelParams },
  }
}
