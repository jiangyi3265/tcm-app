import test from 'node:test'
import assert from 'node:assert/strict'
import { comparePatientNames, sortPatientsByName } from '../src/utils/patientName.js'

test('patient sorting prefers trimmed family/given names and falls back to legacy names', () => {
  const patients = [
    { id: 'zulu', lastName: 'Zulu', firstName: 'Amy', name: 'Aaron' },
    { id: 'baker10', name: 'Baker 10' },
    { id: 'adams', lastName: ' Adams ', firstName: ' Zoe ', name: 'ZZZ' },
    { id: 'baker2', lastName: ' ', firstName: '', name: ' Baker 2 ' },
    { id: 'carol', firstName: 'Carol' },
  ]
  assert.deepEqual(sortPatientsByName(patients).map(({ id }) => id), ['adams', 'baker2', 'baker10', 'carol', 'zulu'])
})

test('English and Chinese numeric suffixes sort naturally', () => {
  for (const prefix of ['Patient', '张']) {
    const patients = [10, 2, 1].map((number) => ({ id: String(number), name: `${prefix} ${number}` }))
    assert.deepEqual(sortPatientsByName(patients).map(({ id }) => id), ['1', '2', '10'])
    assert.deepEqual(sortPatientsByName(patients, 'descending').map(({ id }) => id), ['10', '2', '1'])
  }
})

test('names ignore case and accents but equal names retain the existing lexical ID tie-break', () => {
  const patients = [
    { id: 'id-2', name: 'Álice' },
    { id: 'id-10', name: 'alice' },
    { id: 'id-1', name: 'ALICE' },
  ]
  assert.deepEqual(sortPatientsByName(patients).map(({ id }) => id), ['id-1', 'id-10', 'id-2'])
  assert.deepEqual(sortPatientsByName(patients, 'descending').map(({ id }) => id), ['id-2', 'id-10', 'id-1'])
})

test('both sort directions preserve equal-record stability and never mutate the source', () => {
  const first = Object.freeze({ id: 'same', name: '张 2' })
  const second = Object.freeze({ id: 'same', name: '张 2' })
  const patients = Object.freeze([first, second])
  for (const order of ['ascending', 'descending']) {
    const result = sortPatientsByName(patients, order)
    assert.notEqual(result, patients)
    assert.equal(result[0], first)
    assert.equal(result[1], second)
  }
  assert.equal(comparePatientNames(first, second), 0)
})

test('mixed and incomplete records keep the legacy locale-sensitive ascending and descending results', () => {
  const patients = [null, {}, { id: 0, name: ' ' }, { id: '2', name: '王芳' },
    { id: '10', name: 'Émile 10' }, { id: '1', name: 'emile 2' },
    { id: '刘', lastName: '赵', firstName: '明' }, { id: '张', name: '赵 明' },
    { id: '11', lastName: 'O’Connor', firstName: 'Ada' }, { id: '7', firstName: '李 2' }]
  const legacyKey = (patient) => [patient?.lastName, patient?.firstName]
    .map((part) => String(part || '').trim()).filter(Boolean).join(' ') || String(patient?.name || '').trim()
  const legacyCompare = (a, b) => legacyKey(a).localeCompare(legacyKey(b), undefined, { sensitivity: 'base', numeric: true })
    || String(a?.id || '').localeCompare(String(b?.id || ''))
  for (const order of ['ascending', 'descending']) {
    const direction = order === 'descending' ? -1 : 1
    assert.deepEqual(sortPatientsByName(patients, order), [...patients].sort((a, b) => direction * legacyCompare(a, b)))
  }
})
