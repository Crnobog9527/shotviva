// Admin area (ARCHITECTURE §10): v1 is the template + prompt editor only.
export {
  listAdminTemplates,
  reorderTemplates,
  runAdminAction,
  runAdminQuery,
  saveTemplate,
  setTemplateActive,
} from './templates'
export type {
  ActionResult,
  ActionValue,
  AdminTemplate,
  ApplyCoverRequest,
  CoverTicket,
  CoverUploadRequest,
  SaveTemplatePayload,
  TemplateAdminActions,
} from './templates'
export { applyCover, createCoverUpload, type ApplyCoverInput, type CoverDeps, type CoverUploadTicket } from './covers'
export { TemplatesEditor } from './templates-editor'
