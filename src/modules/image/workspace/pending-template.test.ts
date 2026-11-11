import { expect, test } from 'vitest'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { recallTemplate, rememberTemplate } from './pending-template'

const template = (id: string) => ({ id, name: id }) as CatalogueTemplate

test('the template handed over on Generate is recalled by the workspace it leads to, and by no other', () => {
  expect(recallTemplate('a')).toBeNull()
  rememberTemplate(template('a'))
  expect(recallTemplate('a')?.name).toBe('a')
  expect(recallTemplate('b')).toBeNull()
  rememberTemplate(template('b'))
  expect(recallTemplate('a')).toBeNull()
  expect(recallTemplate('b')?.name).toBe('b')
})
