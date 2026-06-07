import test from 'node:test'
import assert from 'node:assert/strict'
import { canAccessPatientRecords, filterAccessibleConsultations, hasPermission } from '../src/utils/permissions.js'

test('primary practitioner can always access patient records', () => {
  const allowed = canAccessPatientRecords(
    ['practitioner'],
    'u-1',
    { id: 'p-1', practitionerId: 'u-1' },
    [],
  )

  assert.equal(allowed, true)
})

test('non-primary practitioner cannot access other recent records without appointment', () => {
  const allowed = canAccessPatientRecords(
    ['practitioner'],
    'u-2',
    { id: 'p-1', practitionerId: 'u-9' },
    [
      {
        patientId: 'p-1',
        practitionerId: 'u-9',
        status: 'completed',
        date: '2026-04-03',
        deletedAt: null,
      },
    ],
    { now: '2026-04-06' },
  )

  assert.equal(allowed, false)
})

test('non-primary practitioner cannot keep patient access from old own consultation alone', () => {
  const allowed = canAccessPatientRecords(
    ['practitioner'],
    'u-2',
    { id: 'p-1', practitionerId: 'u-9' },
    [
      {
        patientId: 'p-1',
        practitionerId: 'u-2',
        status: 'completed',
        date: '2026-04-03',
        deletedAt: null,
      },
    ],
    { now: '2026-04-06' },
  )

  assert.equal(allowed, false)
})

test('appointment practitioner can see only recent three months of other records', () => {
  const patient = { id: 'p-3', practitionerId: 'u-9' }
  const appointments = [
    {
      patientId: 'p-3',
      practitionerId: 'u-3',
      status: 'completed',
      startTime: '2026-04-06 10:00:00',
      endTime: '2026-04-06 10:30:00',
    },
  ]
  const consultations = [
    { id: 'recent', patientId: 'p-3', practitionerId: 'u-9', date: '2026-02-06', deletedAt: null },
    { id: 'old', patientId: 'p-3', practitionerId: 'u-9', date: '2025-12-01', deletedAt: null },
  ]

  assert.equal(canAccessPatientRecords(
    ['practitioner'],
    'u-3',
    patient,
    consultations,
    { currentUser: { id: 'u-3' }, appointments, now: '2026-04-06' },
  ), true)

  const visible = filterAccessibleConsultations(
    ['practitioner'],
    consultations,
    { currentUser: { id: 'u-3' }, patient, appointments, now: '2026-04-06' },
  )

  assert.deepEqual(visible.map((consultation) => consultation.id), ['recent'])
})

test('expired appointment hides other records but own records remain visible', () => {
  const patient = { id: 'p-4', practitionerId: 'u-9' }
  const appointments = [
    {
      patientId: 'p-4',
      practitionerId: 'u-4',
      status: 'completed',
      startTime: '2026-04-06 10:00:00',
      endTime: '2026-04-06 10:30:00',
    },
  ]
  const consultations = [
    { id: 'other', patientId: 'p-4', practitionerId: 'u-9', date: '2026-04-14', deletedAt: null },
    { id: 'own', patientId: 'p-4', practitionerId: 'u-4', date: '2025-08-01', deletedAt: null },
  ]

  const visible = filterAccessibleConsultations(
    ['practitioner'],
    consultations,
    { currentUser: { id: 'u-4' }, patient, appointments, now: '2026-04-15' },
  )

  assert.deepEqual(visible.map((consultation) => consultation.id), ['own'])
})

test('admin plus practitioner keeps admin patient access and merge permission', () => {
  assert.equal(canAccessPatientRecords(
    ['admin', 'practitioner'],
    'u-5',
    { id: 'p-5', practitionerId: 'u-9' },
    [],
  ), true)
  assert.equal(hasPermission(['practitioner'], 'patient.merge'), false)
  assert.equal(hasPermission(['admin', 'practitioner'], 'patient.merge'), true)
})

test('pharmacist can access patient with paid consultation', () => {
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

test('apprentice can access appointment patient during internship window', () => {
  const allowed = canAccessPatientRecords(
    ['apprentice'],
    'ap-1',
    { id: 'p-6', practitionerId: 'u-9' },
    [],
    {
      currentUser: { internshipDates: ['2026-04-04'] },
      appointments: [
        {
          patientId: 'p-6',
          startTime: '2026-04-06 10:00:00',
          status: 'booked',
        },
      ],
      now: '2026-04-06',
    },
  )

  assert.equal(allowed, true)
})

test('apprentice cannot access records after internship window', () => {
  const allowed = canAccessPatientRecords(
    ['apprentice'],
    'ap-1',
    { id: 'p-7', practitionerId: 'u-9' },
    [
      {
        patientId: 'p-7',
        practitionerId: 'u-9',
        status: 'completed',
        date: '2026-04-04',
        deletedAt: null,
      },
    ],
    {
      currentUser: { internshipDates: ['2026-04-01'] },
      now: '2026-04-06',
    },
  )

  assert.equal(allowed, false)
})

test('apprentice sees only records inside active internship window', () => {
  const visible = filterAccessibleConsultations(
    ['apprentice'],
    [
      { id: 'c-1', patientId: 'p-1', date: '2026-04-06', deletedAt: null },
      { id: 'c-2', patientId: 'p-1', date: '2026-04-01', deletedAt: null },
      { id: 'c-3', patientId: 'p-1', date: '2026-04-06', deletedAt: '2026-04-06 12:00:00' },
    ],
    {
      currentUser: { internshipDates: ['2026-04-04'] },
      now: '2026-04-06',
    },
  )

  assert.deepEqual(visible.map((consultation) => consultation.id), ['c-1'])
})
