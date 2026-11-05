// Admin area (ARCHITECTURE §10): v1 is the template + prompt editor only.
export {
  listAdminTemplates,
  reorderTemplates,
  runAdminAction,
  saveTemplate,
  setTemplateActive,
} from './templates'
export type { ActionResult, AdminTemplate, SaveTemplatePayload, TemplateAdminActions } from './templates'
export { TemplatesEditor } from './templates-editor'
