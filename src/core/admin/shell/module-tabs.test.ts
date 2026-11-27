import { describe, expect, it } from 'vitest'

import { moduleTabs } from './module-tabs'

describe('module tabs', () => {
  const at = (path: string) => {
    const found = moduleTabs(path)
    return found && [found.module.label, found.current.label]
  }

  it('finds the module and tab from the address', () => {
    expect(at('/admin/templates')).toEqual(['模板与系列', '模板'])
    expect(at('/admin/templates/series')).toEqual(['模板与系列', '系列'])
    expect(at('/admin/templates/categories')).toEqual(['模板与系列', '分类'])
    expect(at('/admin/templates/profiles')).toEqual(['出图设置', '模板出图配置'])
    expect(at('/admin/templates/dishware/')).toEqual(['出图设置', '器皿图库'])
    expect(at('/admin/templates/edit')).toEqual(['出图设置', '作品编辑规则'])
    expect(at('/admin/providers')).toEqual(['出图设置', 'AI 供应商'])
    expect(at('/admin/home')).toEqual(['首页展示', '默认'])
    expect(at('/admin/home/zh')).toEqual(['首页展示', '中文站'])
    expect(at('/admin/home/en')).toEqual(['首页展示', '英文站'])
    expect(at('/admin/home/bundles')).toEqual(['首页展示', '组合库'])
  })

  it('shows no tabs elsewhere', () => {
    expect(at('/admin')).toBeNull()
    expect(at('/admin/users')).toBeNull()
    expect(at('/admin/templatesx')).toBeNull()
  })
})
