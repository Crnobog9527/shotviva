import type { TreeItem, TreeMove } from '@/core/admin/ui/category-tree'

export type ReferenceCategory = TreeItem & { nameZh: string; nameEn: string }
export type ReferenceStatus = 'active' | 'archived'
export type ReferenceAsset = {
  id: string
  categoryId: string
  width: number
  height: number
  bytes: number
  sourceUrl: string | null
  note: string | null
  tags: string[]
  status: ReferenceStatus
  createdAt: string
  usedInTemplates: number
}

export type AssetPage = { items: ReferenceAsset[]; nextCursor: string | null }
export type AssetFilter = {
  categoryId: string | null
  tag: string
  note: string
  status: ReferenceStatus
  sort: 'newest' | 'oldest'
}
export const initialFilter: AssetFilter = { categoryId: null, tag: '', note: '', status: 'active', sort: 'newest' }
export type AssetOperation = 'move' | 'add-tags' | 'remove-tags' | 'archive' | 'restore' | 'delete'
export type BatchInput = { ids: string[]; operation: AssetOperation; categoryId?: string; tags?: string[] }
export type AssetUpdate = Pick<ReferenceAsset, 'categoryId' | 'note' | 'sourceUrl' | 'tags'>
export type CategoryInput =
  | { op: 'create' | 'rename'; key?: string; nameZh: string; nameEn: string; parentId: string | null }
  | ({ op: 'move' } & TreeMove)
  | { op: 'delete'; key: string; moveTo: string | null }
