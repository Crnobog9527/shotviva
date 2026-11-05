// Admin area (ARCHITECTURE §10): the template + prompt editor and the provider settings (T17).
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
export {
  activate as activateProvider,
  runProviderAction,
  saveProvider,
  testProvider,
  type ProviderActionResult,
  type ProviderAdminActions,
  type ProviderCommandDeps,
  type SaveProviderInput,
} from './providers'
export { PROVIDERS_COPY, ProvidersEditor } from './providers-editor'
