import { expect, test } from 'vitest'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { pendingHeadShown, recallTemplate, rememberTemplate, showPendingHead } from './pending-template'

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

test('a head the pending view has on screen is known as shown until that view goes away', () => {
  expect(pendingHeadShown('a')).toBe(false)
  const gone = showPendingHead('a')
  expect(pendingHeadShown('a')).toBe(true)
  expect(pendingHeadShown('b')).toBe(false)
  gone()
  expect(pendingHeadShown('a')).toBe(false)
})

test('an older pending view going away does not unmark the one that replaced it', () => {
  const firstGone = showPendingHead('a')
  const secondGone = showPendingHead('b')
  firstGone()
  expect(pendingHeadShown('b')).toBe(true)
  secondGone()
  expect(pendingHeadShown('b')).toBe(false)
})
