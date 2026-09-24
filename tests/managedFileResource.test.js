import test from 'node:test'
import assert from 'node:assert/strict'
import { managedFileResource } from '../src/utils/managedFileResource.js'

test('saved links recover the file key independently of host and expired signature', () => {
  const resource = 'hospital-private/example/consent/form.pdf'
  const suffix = `/api/public/files/access?resource=${encodeURIComponent(resource)}&expires=1&signature=expired`
  assert.equal(managedFileResource(`https://old-clinic.example${suffix}`), resource)
  assert.equal(managedFileResource(suffix), resource)
  assert.equal(managedFileResource(resource), resource)
  assert.equal(managedFileResource('/profile/upload/form.pdf'), '/profile/upload/form.pdf')
})

test('unrelated URLs and non-clinic resources remain external', () => {
  for (const value of ['https://other.example/report.pdf', 'blob:example', 'data:application/pdf;base64,abc',
    '/api/public/files/access?resource=/etc/passwd', '/api/public/files/access?expires=1', null]) {
    assert.equal(managedFileResource(value), null)
  }
})
