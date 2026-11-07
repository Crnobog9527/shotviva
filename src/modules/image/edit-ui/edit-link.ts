// "Edit this photo" from the workspace's done view (Owner 2026-11-08): the finished photo's page
// with the edit panel already open, so a change is one tap from the result instead of a trip
// through Photos. The page opens the panel only when editing is on (it then has an EditFlow).
export const EDIT_QUERY = 'edit'

export const editHref = (jobId: string) => `/photos/${encodeURIComponent(jobId)}?${EDIT_QUERY}=1`

// Whether the photo page was opened by that link: exactly ?edit=1, once.
export const opensEdit = (value: string | string[] | undefined) => value === '1'
