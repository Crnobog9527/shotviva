// Image module entry. The provider is server-only; the workspace pieces are client code
// and are only bundled for the browser when a client component imports them.
export { createOpenAIImageProvider, IMAGE_ADAPTERS, imageProvider, outputSize, OUTPUT_SIZES } from './provider'
export { CREDITS_FLOOR } from './credits-floor'
// Photo editing (T30), server only like the provider.
export { editBodySchema, editScopeClassifier, identityJudge, runEdit, toEditRequest, type ClassifierAnswer, type EditDeps, type ScopeClassifier } from './edit'
export { GENERATION_COST_USD } from './generation-cost'
// The dense-text poster pages and routes import posters.ts, not this barrel: exporting the poster
// editor here put it in every page that imports index.ts (/generate and /photos have a JS budget).
export { useUpload, type UploadState } from './workspace/use-upload'
export { checkPickedFile, uploadPhoto, UploadError, type UploadDeps, type UploadErrorCode } from '@/core/storage/upload'
export { targetSize } from '@/core/storage/upload'
// TEMPORARY T4 harness, kept while the T16 validation handoff still points Codex at it.
export { UploadTestPanel, type TestTemplate } from './workspace/dev/upload-test-panel'

// App shell pieces (T8).
export { TemplateCatalogue } from './catalogue/template-catalogue'
// Create's grid (T102), server only: templates and series cards placed under the category tree.
export { loadCatalogueView } from './catalogue/load-catalogue-view'
export { createReturnPath } from './catalogue/catalogue-filter'
export type { CatalogueSeries, CatalogueView, FilterNode, GridEntry } from './catalogue/catalogue-view'
// Saved templates (T83): the provider every page with hearts wraps its catalogue in.
export { FavoritesProvider } from './favorites'
export { toCatalogueTemplate, type CatalogueTemplate } from './catalogue/catalogue-template'
export { ImageWorkspace, type WorkspaceProps } from './workspace/image-workspace'
export { MatrixWorkspaceLazy as MatrixWorkspace } from './matrix/matrix-lazy'
export type { MatrixWorkspaceProps } from './matrix/matrix-workspace'
export { loadBatchCatalogue } from './matrix/batch-catalogue'
export { GatedFeatures, TEMPLATES_ANCHOR } from './gated/gated-features'
export { GuideButton } from './gated/guide-button'
// Make again (T40): server only; reads the work and copies its kept photos back.
export { loadAgain } from './again/load-again'
export { loadReuse } from './again/load-reuse'
// The Photos viewer (2026-11-12), server only: one work's view, and Make again in place.
export { loadWorkView } from './photos/load-work-view'
export { loadAgainContext } from './again/load-again-context'
export type { AgainContext } from './again/again-context'
export { WorkspaceHead } from './workspace/workspace-head'
export { WorkspacePending } from './workspace/workspace-pending'
export { GenerationOwner, GenerationRunner } from './generation/generation-runner'
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
export type { EditSource } from './edit-ui'
// The Photos viewer (2026-11-12): a work opens over the grid; the Photos layout hosts it.
export { ViewerHost } from './photos/viewer/viewer-host'
export type { WorkView } from './photos/work-view'
// Wishlist post form (T12): one upload field, same zone and stages as the workspace.
export { PhotoTile, type PhotoTileProps } from './workspace/photo-tile'
// Marketing and sign-in render the home generator through the narrow marketing.ts entry.
export { UPLOAD_FORMAT_NAMES, UPLOAD_MAX_MB } from './workspace/upload-formats'
// Admin template test runs (ARCHITECTURE §10.b, T85), server only: the /api/admin/test-* routes.
export {
  listManagedAssets, removeAssets, thumbnailForAsset, thumbnailKey,
  cleanupOnOpen,
  confirmTestPhoto,
  createTestPhotoUpload,
  loadTestBudget,
  preparePanelSummary, loadPanelSummary, loadPanelRecords, loadTestPanel,
  runTestEdit,
  runTestGenerate,
  runTestTranslate,
  saveTestBudget,
  setTestRunCover,
  signPhoto, signRun,
  signTestRunDownload,
  testBudgetBodySchema,
  testCoverBodySchema,
  testEditBodySchema,
  testGenerateBodySchema,
  testPhotoConfirmSchema,
  testTranslateBodySchema,
} from './test-run'

export { isPromptLabVisionProvider, assertPromptLabVisionCapability } from './prompt-lab/vision-capability'
export { quoteLabMatrix, reserveLabMatrix } from './prompt-lab/matrix'
export { executeLabCell } from './prompt-lab/cell'
export { publishLabRun } from './prompt-lab/publish'
export { reverseLabPrompt } from './prompt-lab/reverse'
