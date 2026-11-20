import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { AdminPage, BLOG_COPY, getAdminPost, PostEditor, postToForm } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'

import { blogEditorActions } from '../editor-actions'

export const instant = false

export const metadata: Metadata = { title: BLOG_COPY.title }

export default async function EditBlogPostPage({ params }: PageProps<'/[locale]/admin/blog/[id]'>) {
  await requireAdmin()
  const post = await getAdminPost(createAdminSupabase(), (await params).id)
  if (!post) notFound()
  return (
    <AdminPage title={post.title}>
      <PostEditor initial={postToForm(post)} status={post.status} actions={blogEditorActions} />
    </AdminPage>
  )
}
