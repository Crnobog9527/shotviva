import { expect, it } from 'vitest'
import { importFailure, importOptions } from './import-prompts-options'

const actor = '328576a9-f5b8-4c5d-b180-fe7b15deb02c'

it('preserves the default and explicit input paths, with the sale flag in either position', () => {
  expect(importOptions([])).toEqual({ file: '.local/prompts.json', openSale: false, actor: undefined })
  expect(importOptions(['local.json'], actor)).toEqual({ file: 'local.json', openSale: false, actor: undefined })
  for (const args of [['local.json', '--open-sale'], ['--open-sale', 'local.json']]) {
    expect(importOptions(args,actor)).toEqual({ file: 'local.json', openSale: true, actor })
  }
})

it('requires an operator for sale approval and rejects misspelled flags or extra files', () => {
  expect(() => importOptions(['--open-sale'])).toThrow('SHOTVIVA_IMPORT_ADMIN_ID')
  expect(() => importOptions(['--open-sale'],'bad')).toThrow('SHOTVIVA_IMPORT_ADMIN_ID')
  expect(() => importOptions(['--open-sales'],actor)).toThrow()
  expect(() => importOptions(['a.json','b.json'])).toThrow('用法')
})

it('explains the live-template guard and never renders arbitrary database text', () => {
  expect(importFailure({ code: 'P0001', message: 'IMPORT_OPEN_SALE_REQUIRED' })).toContain('--open-sale')
  expect(importFailure({ code: 'P0001', message: 'FORBIDDEN' })).toContain('管理员')
  expect(importFailure({ code: '23514', message: 'test private contents' })).toBe('数据库错误（23514）')
})
