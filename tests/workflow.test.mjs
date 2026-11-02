import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatPageList, parsePageList } from '../src/lib/ranges.js'
import { RECIPES, checkWorkflow, decodeWorkflow, encodeWorkflow, newStep, sanitizeSteps, stripSecrets } from '../src/lib/workflow.js'

const pdf = new File(['x'], 'a.pdf', { type: 'application/pdf' })
const jpg = new File(['x'], 'a.jpg', { type: 'image/jpeg' })

test('page lists parse and format', () => {
  assert.deepEqual(parsePageList('1, 3-5, 9-', 10).pages, [0, 2, 3, 4, 8, 9])
  assert.match(parsePageList('12', 10).error, /only has 10 pages/)
  assert.match(parsePageList('abc', 10).error, /isn’t a page number/)
  assert.equal(formatPageList([0, 1, 2, 4]), '1-3, 5')
})

test('recipes are valid for their kind of input', () => {
  for (const r of RECIPES) {
    const input = r.steps[0].type === 'images-to-pdf' ? [jpg, jpg] : [pdf, pdf]
    const steps = r.steps.map((s) => (s.type === 'protect' ? { ...s, opts: { ...s.opts, password: 'secret' } } : s))
    assert.equal(checkWorkflow(steps, input), null, `recipe ${r.id}`)
  }
})

test('checkWorkflow explains what can’t run', () => {
  assert.match(checkWorkflow([], [pdf]), /Add at least one step/)
  assert.match(checkWorkflow([newStep('merge')], [jpg]), /start with “Images to PDF”/)
  assert.match(checkWorkflow([newStep('protect', { password: 'x' }), newStep('rotate')], [pdf]), /has to be the last step/)
  assert.match(checkWorkflow([newStep('protect')], [pdf]), /enter a password/)
  assert.match(checkWorkflow([newStep('compress')], [pdf, jpg]), /not both/)
})

test('share links round-trip and never contain passwords', () => {
  const steps = [newStep('watermark', { text: 'DRAFT', layout: 'tile' }), newStep('protect', { password: 'hunter2' })]
  const code = encodeWorkflow('Mine', steps)
  assert.ok(!Buffer.from(code.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString().includes('hunter2'))
  const back = decodeWorkflow(code)
  assert.equal(back.name, 'Mine')
  assert.deepEqual(back.steps, stripSecrets(steps))
  assert.equal(back.steps[1].opts.password, '')
})

test('shared links are sanitized', () => {
  const evil = sanitizeSteps([
    { type: 'nope', opts: {} },
    { type: 'compress', opts: { mode: 'target', target: 123, evil: 'x' } },
    { type: 'merge', opts: { name: 'x'.repeat(500) } },
  ])
  assert.equal(evil.length, 2)
  assert.equal(evil[0].opts.target, 1048576, 'unknown option values fall back to defaults')
  assert.ok(!('evil' in evil[0].opts))
  assert.equal(evil[1].opts.name.length, 120)
  assert.equal(decodeWorkflow('not-base64!!'), null)
  assert.equal(sanitizeSteps(Array.from({ length: 50 }, () => ({ type: 'rotate', opts: {} }))).length, 20)
})
