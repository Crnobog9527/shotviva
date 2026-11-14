import { treeOrder } from '@/core/admin/ui/category-tree'
import type { ReferenceCategory } from './types'

export function CategoryOptions({ categories }: { categories: ReferenceCategory[] }) {
  return treeOrder(categories).map(item => (
    <option key={item.key} value={item.key}>{'　'.repeat(item.level - 1)}{item.nameZh}</option>
  ))
}
