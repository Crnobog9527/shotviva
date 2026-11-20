import type { Metadata } from 'next'

import { AdminPage, BLOG_COPY, emptyPostForm, PostEditor } from '@/core/admin'
import { requireAdmin } from '@/core/auth'

import { blogEditorActions } from '../editor-actions'

export const instant = false

export const metadata: Metadata = { title: BLOG_COPY.newTitle }

export default async function NewBlogPostPage() {
  await requireAdmin()
  return (
    <AdminPage title={BLOG_COPY.newTitle}>
      <PostEditor initial={emptyPostForm()} status={null} actions={blogEditorActions} />
    </AdminPage>
  )
}
