import { applyCoverAction, requestCoverUploadAction, savePostAction, setPostStatusAction } from './actions'

// The editor's four server actions, in the shape PostEditor takes.
export const blogEditorActions = {
  save: savePostAction,
  setStatus: setPostStatusAction,
  cover: { requestUpload: requestCoverUploadAction, apply: applyCoverAction },
}
