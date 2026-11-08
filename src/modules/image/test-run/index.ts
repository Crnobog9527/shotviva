import 'server-only'

// Admin template test runs (ARCHITECTURE §10.b, T85), server side. The panel (core/admin
// test-run-ui) talks to /api/admin/test-* and imports only the client-safe types below.
export { estimateRunUsd } from './estimate'
export { runTestEdit, type TestEditDeps, type TestEditRequest } from './run-test-edit'
export { languageName, runTestTranslate, type TestTranslateDeps } from './run-test-translate'
export { runTestGenerate, type TestGenerateRequest, type TestRunDeps } from './run-test-generate'
export { cleanupOnOpen, loadTestPanel, signRun } from './test-panel'
export { confirmTestPhoto, createTestPhotoUpload, type TestPhotoTicket } from './test-photos'
export { setTestRunCover, type TestCoverDeps } from './test-cover'
export {
  testBudgetBodySchema,
  testCoverBodySchema,
  testEditBodySchema,
  testGenerateBodySchema,
  testPhotoConfirmSchema,
  testTranslateBodySchema,
} from './test-run-request'
export { loadTestBudget, saveTestBudget } from './test-run-store'
export type { TestBudget, TestRun } from './test-run-row'
export type { TestPanelData, TestPhotoView, TestRunView } from '@/core/admin/test-runs'
