// Image module entry. The provider is server-only; the workspace pieces are client code
// and are only bundled for the browser when a client component imports them.
export { createOpenAIImageProvider, IMAGE_ADAPTERS, imageProvider, outputSize, OUTPUT_SIZES } from './provider'
export { CREDITS_FLOOR } from './credits-floor'
// Photo editing (T30), server only like the provider.
export { editBodySchema, editScopeClassifier, identityJudge, runEdit, toEditRequest, type ClassifierAnswer, type EditDeps, type ScopeClassifier } from './edit'
export { GENERATION_COST_USD } from './generation-cost'
export { useUpload, type UploadState } from './workspace/use-upload'
export { checkPickedFile, uploadPhoto, UploadError, type UploadDeps, type UploadErrorCode } from '@/core/storage/upload'
export { targetSize } from '@/core/storage/upload'
// TEMPORARY T4 harness, kept while the T16 validation handoff still points Codex at it.
export { UploadTestPanel, type TestTemplate } from './workspace/dev/upload-test-panel'

// App shell pieces (T8).
export { TemplateCatalogue } from './catalogue/template-catalogue'
// Saved templates (T83): the provider every page with hearts wraps its catalogue in.
export { FavoritesProvider } from './favorites'
export { toCatalogueTemplate, type CatalogueTemplate } from './catalogue/catalogue-template'
export { ImageWorkspace, type WorkspaceProps } from './workspace/image-workspace'
// Make again (T40): server only; reads the work and copies its kept photos back.
export { loadAgain } from './again/load-again'
export { WorkspaceHead } from './workspace/workspace-head'
export { GenerationRunner } from './generation/generation-runner'
export { GeneratingPill } from './generation/generating-pill'
export { HideWhileGenerating } from './generation/hide-while-generating'
export { PhotosTabBadge } from './generation/photos-tab-badge'
// The shell's wishlist hint shows once a photo came out in this tab (Owner 2026-11-10).
export { AfterSuccess } from './generation/after-success'
export { RunningList } from './photos/running-list'
export { DoneGrid } from './photos/done-grid'
export { PhotosCount } from './photos/photos-count'
export { toPhotoItem, type PhotoItem, type TemplateLookup } from './photos/photo-item'
export { editDisplay, editOriginal } from './photos/edit-display'
export { ResultView } from './result/result-view'
// Deleting a work (T41): the photo page's last action, and Photos' toast after it.
export { DeleteWork, type DeleteWorkAction } from './result/delete-work'
export { DeletedToast } from './photos/deleted-toast'
export { toPhotoDetail, type PhotoDetail } from './detail/photo-detail'
export { EditFlow, EditTrigger, opensEdit, type EditSource } from './edit-ui'
// Wishlist post form (T12): one upload field, same zone and stages as the workspace.
export { PhotoTile, type PhotoTileProps } from './workspace/photo-tile'
// Marketing and sign-in render the home generator through the narrow marketing.ts entry.
export { UPLOAD_FORMAT_NAMES, UPLOAD_MAX_MB } from './workspace/upload-formats'
// Admin template test runs (ARCHITECTURE §10.b, T85), server only: the /api/admin/test-* routes.
export {
  cleanupOnOpen,
  confirmTestPhoto,
  createTestPhotoUpload,
  loadTestBudget,
  loadTestPanel,
  runTestEdit,
  runTestGenerate,
  runTestTranslate,
  saveTestBudget,
  setTestRunCover,
  signRun,
  signTestRunDownload,
  testBudgetBodySchema,
  testCoverBodySchema,
  testEditBodySchema,
  testGenerateBodySchema,
  testPhotoConfirmSchema,
  testTranslateBodySchema,
} from './test-run'
