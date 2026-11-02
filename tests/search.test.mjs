import assert from 'node:assert/strict'
import { test } from 'node:test'
import { searchTools } from '../src/lib/search.js'

const top = (q) => searchTools(q)[0]?.path

test('finds tools by name, keyword and intent', () => {
  assert.equal(top('merge'), '/merge-pdf')
  assert.equal(top('join pdf'), '/merge-pdf') // keyword only, not in the name
  assert.equal(top('sign'), '/sign-pdf')
  assert.equal(top('visa'), '/compress-pdf-for-visa-application') // landing page
  assert.equal(top('compress 200'), '/compress-pdf-to-200kb')
})

test('a tool beats its own landing pages on a tie', () => {
  assert.equal(top('compress'), '/compress-pdf')
})

test('every word has to match', () => {
  assert.deepEqual(searchTools('merge zzzz'), [])
})

test('an empty query lists recent tools first, then every tool once', () => {
  const list = searchTools('', ['sign-pdf', 'not-a-tool'])
  assert.equal(list[0].path, '/sign-pdf')
  assert.equal(list[0].recent, true)
  assert.equal(list.filter((e) => e.path === '/sign-pdf').length, 1)
  assert.ok(list.every((e) => !e.landing))
})
