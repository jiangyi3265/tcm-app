import test from 'node:test'
import assert from 'node:assert/strict'
import { findStaffPatientByIdentity, isLinkedStaffPatient } from '../src/utils/staffPatientIdentity.js'

const user = { id: '7', name: 'Bob Smith', email: 'family@example.invalid' }
const profile = (extra = {}) => ({ id: 'patient', name: 'Bob Smith', email: user.email, isActive: true, ...extra })

test('shared email never identifies a family member with a different name', () => {
  assert.equal(findStaffPatientByIdentity([profile({ name: 'Alice Smith' })], user), null)
})

test('same structured name and normalized email can reuse an unlinked profile', () => {
  const patient = profile({ name: 'Smith Bob', firstName: 'Bob', lastName: 'Smith', email: 'FAMILY@example.invalid' })
  assert.equal(findStaffPatientByIdentity([patient], { ...user, name: ' bob   smith ', email: ` ${user.email} ` }), patient)
})

test('different email or conflicting structured name never matches', () => {
  assert.equal(findStaffPatientByIdentity([profile({ email: 'other@example.invalid' })], user), null)
  assert.equal(findStaffPatientByIdentity([profile({ firstName: 'Alice', lastName: 'Smith' })], user), null)
})

test('staff fallback excludes linked, deleted, merged, inactive and ambiguous profiles', () => {
  for (const extra of [{ linkedUserId: '8' }, { userId: '8' }, { staffMeta: { userId: '8' } },
    { deletedAt: '2026-10-01' }, { mergedInto: 'another' }, { isActive: false }, { isActive: 0 }]) {
    assert.equal(findStaffPatientByIdentity([profile(extra)], user), null)
  }
  assert.equal(findStaffPatientByIdentity([profile(), profile({ id: 'duplicate' })], user), null)
})

test('explicit user ID link survives changed name/email and rejects conflicting links', () => {
  assert.equal(isLinkedStaffPatient(profile({ linkedUserId: '7', staffUserId: 7, name: 'Old Name', email: '' }), 7), true)
  assert.equal(isLinkedStaffPatient(profile({ linkedUserId: '7', staffUserId: '8' }), 7), false)
  assert.equal(isLinkedStaffPatient(profile({ linkedUserId: '7', mergedInto: 'other' }), 7), false)
})
