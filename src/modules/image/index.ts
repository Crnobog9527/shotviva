// Image module entry. The provider is server-only; the workspace pieces are client code
// and are only bundled for the browser when a client component imports them.
export { createOpenAIImageProvider, IMAGE_ADAPTERS, imageProvider, outputSize, OUTPUT_SIZES } from './provider'
export { CREDITS_FLOOR } from './credits-floor'
export { useUpload, type UploadState } from './workspace/use-upload'
export { checkPickedFile, uploadPhoto, UploadError, type UploadDeps, type UploadErrorCode } from './workspace/upload-photo'
export { targetSize } from './workspace/compress-image'
// TEMPORARY T4 harness, kept while the T16 validation handoff still points Codex at it.
export { UploadTestPanel, type TestTemplate } from './workspace/dev/upload-test-panel'

// App shell pieces (T8).
export { TemplateCatalogue } from './catalogue/template-catalogue'
export { toCatalogueTemplate, type CatalogueTemplate } from './catalogue/catalogue-template'
export { ImageWorkspace, type WorkspaceProps } from './workspace/image-workspace'
export { WorkspaceHead } from './workspace/workspace-head'
export { GenerationRunner } from './generation/generation-runner'
export { GeneratingPill } from './generation/generating-pill'
export { PhotosTabBadge } from './generation/photos-tab-badge'
export { RunningList } from './photos/running-list'
export { DoneGrid } from './photos/done-grid'
export { PhotosCount } from './photos/photos-count'
export { toPhotoItem, type PhotoItem, type TemplateLookup } from './photos/photo-item'
export { ResultView } from './result/result-view'
