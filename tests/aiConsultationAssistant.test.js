import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyAiConsultationNotes,
  buildAiCurrentNotes,
  buildAiOptionCatalog,
} from '../src/utils/aiConsultationAssistant.js'
import { CHIEF_COMPLAINTS, TCM_OPTIONS, emptyDiff } from '../src/utils/sampleData.js'

test('AI consultation notes merge selectable symptoms and append narrative fields', () => {
  const form = {
    chiefComplaint: '',
    chiefComplaintDuration: '',
    chiefComplaintDescription: 'Existing neck pain.',
    progressOfDisease: '',
    summary: '',
    diff: emptyDiff(),
  }
  const catalog = buildAiOptionCatalog({ tcmOptions: TCM_OPTIONS, chiefComplaints: CHIEF_COMPLAINTS })
  const result = {
    summary: {
      chiefComplaint: 'Neck Pain',
      chiefComplaintDuration: '< 7 days',
      chiefComplaintDescription: 'Pain radiates to the shoulder.',
      progressOfDisease: 'Started after lifting boxes yesterday.',
      summary: 'Patient reports acute neck and shoulder pain.',
    },
    diff: {
      headDiscomfort: ['Dizziness'],
      bodyDiscomforts: ['Stiffness'],
      bodyDiscomfortsLocation: ['Shoulder & Back Neck'],
      otherExterior: 'Observed tight upper back muscles.',
      anxietyStress: 6,
    },
  }

  const stats = applyAiConsultationNotes(form, result, catalog)

  assert.equal(form.chiefComplaint, 'Neck Pain')
  assert.equal(form.chiefComplaintDuration, TCM_OPTIONS.chiefComplaintDuration[0])
  assert.match(form.chiefComplaintDescription, /Existing neck pain/)
  assert.match(form.chiefComplaintDescription, /Pain radiates/)
  assert.match(form.progressOfDisease, /lifting boxes/)
  assert.ok(form.diff.headDiscomfort.length >= 1)
  assert.ok(form.diff.bodyDiscomforts.length >= 1)
  assert.ok(form.diff.bodyDiscomfortsLocation.length >= 1)
  assert.equal(form.diff.otherExterior, 'Observed tight upper back muscles.')
  assert.equal(form.diff.anxietyStress, 6)
  assert.equal(stats.addedSelections, 3)
})

test('AI merge preserves clinician-entered scalar fields and avoids duplicate text', () => {
  const form = {
    chiefComplaint: 'Headache',
    chiefComplaintDuration: '1-4 weeks',
    chiefComplaintDescription: 'Worse at night.',
    progressOfDisease: '',
    summary: '',
    diff: {
      ...emptyDiff(),
      otherChest: 'Sleep interrupted.',
    },
  }
  const catalog = buildAiOptionCatalog({ tcmOptions: TCM_OPTIONS, chiefComplaints: CHIEF_COMPLAINTS })

  applyAiConsultationNotes(form, {
    summary: {
      chiefComplaint: 'Insomnia',
      chiefComplaintDuration: '< 7 days',
      chiefComplaintDescription: 'Worse at night.',
    },
    diff: {
      otherChest: 'Sleep interrupted.\nWakes at 3 AM.',
    },
  }, catalog)

  assert.equal(form.chiefComplaint, 'Headache')
  assert.equal(form.chiefComplaintDuration, '1-4 weeks')
  assert.equal(form.chiefComplaintDescription, 'Worse at night.')
  assert.equal(form.diff.otherChest, 'Sleep interrupted.\nWakes at 3 AM.')
})

test('current notes snapshot excludes images and conclusions', () => {
  const notes = buildAiCurrentNotes({
    chiefComplaint: 'Fatigue',
    diff: {
      otherExterior: 'Pale face.',
      conclusions: [{ name: 'Qi deficiency', treatment: 'Tonify Qi' }],
      tongueImage: 'data:image/png;base64,abc',
      tongueImageResource: 'tongue.png',
    },
  })

  assert.equal(notes.summary.chiefComplaint, 'Fatigue')
  assert.equal(notes.diff.otherExterior, 'Pale face.')
  assert.equal(Object.prototype.hasOwnProperty.call(notes.diff, 'conclusions'), true)
  assert.equal(notes.diff.conclusions, undefined)
  assert.equal(notes.diff.tongueImage, undefined)
})

