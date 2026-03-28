import test from 'node:test'
import assert from 'node:assert/strict'
import { canAccessPatientRecords } from '../src/utils/permissions.js'

test('主治医师始终可以访问患者记录', () => {
  const allowed = canAccessPatientRecords(
    ['practitioner'],
    'u-1',
    { id: 'p-1', practitionerId: 'u-1' },
    [],
  )

  assert.equal(allowed, true)
})

test('非主治且无近期问诊的 practitioner 不可访问患者记录', () => {
  const allowed = canAccessPatientRecords(
    ['practitioner'],
    'u-2',
    { id: 'p-1', practitionerId: 'u-9' },
    [
      {
        patientId: 'p-1',
        practitionerId: 'u-9',
        status: 'completed',
        date: '2024-01-01',
        deletedAt: null,
      },
    ],
  )

  assert.equal(allowed, false)
})

test('pharmacist 对 paid 问诊患者有访问权限', () => {
  const allowed = canAccessPatientRecords(
    ['pharmacist'],
    'ph-1',
    { id: 'p-2', practitionerId: 'u-9' },
    [
      {
        patientId: 'p-2',
        practitionerId: 'u-9',
        status: 'paid',
        date: '2026-03-28',
        deletedAt: null,
      },
    ],
  )

  assert.equal(allowed, true)
})

test('一周内完成的问诊仍允许访问', () => {
  const recentDate = new Date()
  recentDate.setDate(recentDate.getDate() - 3)

  const allowed = canAccessPatientRecords(
    ['practitioner'],
    'u-3',
    { id: 'p-3', practitionerId: 'u-9' },
    [
      {
        patientId: 'p-3',
        practitionerId: 'u-9',
        status: 'completed',
        date: recentDate.toISOString().slice(0, 10),
        deletedAt: null,
      },
    ],
  )

  assert.equal(allowed, true)
})
