// Image module entry. The provider is server-only; the workspace pieces are client code
// and are only bundled for the browser when a client component imports them.
export { createOpenAIImageProvider, IMAGE_ADAPTERS, imageProvider, outputSize, OUTPUT_SIZES } from './provider'
export { CREDITS_FLOOR } from './credits-floor'
// Photo editing (T30), server only like the provider.
export { editBodySchema, editScopeClassifier, runEdit, toEditRequest, type ClassifierAnswer, type EditDeps, type ScopeClassifier } from './edit'
export { GENERATION_COST_USD } from './generation-cost'
export { useUpload, type UploadState } from './workspace/use-upload'
export { checkPickedFile, uploadPhoto, UploadError, type UploadDeps, type UploadErrorCode } from './workspace/upload-photo'
export { targetSize } from './workspace/compress-image'
// TEMPORARY T4 harness, kept while the T16 validation handoff still points Codex at it.
export { UploadTestPanel, type TestTemplate } from './workspace/dev/upload-test-panel'

// App shell pieces (T8).
export { TemplateCatalogue } from './catalogue/template-catalogue'
export { toCatalogueTemplate, type CatalogueTemplate } from './catalogue/catalogue-template'
export { ImageWorkspace, type WorkspaceProps } from './workspace/image-workspace'
// Make again (T40): server only; reads the work and copies its kept photos back.
export { loadAgain } from './again/load-again'
export { WorkspaceHead } from './workspace/workspace-head'
export { GenerationRunner } from './generation/generation-runner'
export { GeneratingPill } from './generation/generating-pill'
export { HideWhileGenerating } from './generation/hide-while-generating'
export { PhotosTabBadge } from './generation/photos-tab-badge'
export { RunningList } from './photos/running-list'
export { DoneGrid } from './photos/done-grid'
export { PhotosCount } from './photos/photos-count'
export { toPhotoItem, type PhotoItem, type TemplateLookup } from './photos/photo-item'
export { editDisplay, editOriginal } from './photos/edit-display'
export { ResultView } from './result/result-view'
export { toPhotoDetail, type PhotoDetail } from './detail/photo-detail'
export { EditFlow, EditTrigger, type EditSource } from './edit-ui'
// Wishlist post form (T12): one upload field, same zone and stages as the workspace.
export { PhotoSlot, type PhotoSlotProps } from './workspace/photo-slot'
// Home first-screen generator (T36): same pipeline as the workspace (DESIGN §6.9 item 9).
export { HomeGenerator, type HomeGeneratorProps } from './home/home-generator'
export type { HomeViewer } from './home/home-cta'
export type { SampleLookup } from './home/home-samples'
