const DIFF_ARRAY_FIELDS = [
  'coldHeat', 'sweat', 'headDiscomfort', 'headPosition', 'eye', 'ear', 'nose', 'mouth', 'taste',
  'bodyDiscomforts', 'bodyDiscomfortsLocation', 'skinIssues',
  'chest', 'hypochondriac', 'sleep',
  'appetite', 'thirst', 'abdomen',
  'bowelMovement', 'urine',
  'bloodQuality', 'pms',
  'pulse', 'pulseRightHand', 'pulseLeftHand', 'pulseBothCun', 'pulseBothGuan', 'pulseBothChi',
  'tongueColor', 'tongueBody', 'tongueCoating',
  'pathologicalChannel',
]

const DIFF_TEXT_FIELDS = [
  'otherExterior',
  'otherChest',
  'otherAbdomen',
  'otherLowerAbdomen',
  'otherFemale',
  'detailedPulse',
  'pathologicalChanges',
  'otherTongue',
]

const DIFF_NUMBER_FIELDS = ['anxietyStress', 'periodCircle', 'periodDuration']

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[，,、;；:：.\-_/\\()[\]{}'"`~!@#$%^&*+=?<>|\s]+/g, '')
}

function leadingAscii(value) {
  const match = String(value || '').trim().match(/^[\x00-\x7F]+/)
  return match ? match[0].trim() : ''
}

function uniqueStrings(values = []) {
  const seen = new Set()
  const result = []
  for (const value of values || []) {
    const text = String(value || '').trim()
    if (!text) continue
    const key = normalizeKey(text)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(text)
  }
  return result
}

function resolveAllowedOption(value, allowedOptions = []) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (allowedOptions.includes(text)) return text
  const textKey = normalizeKey(text)
  if (!textKey) return ''
  const exact = allowedOptions.find((option) => normalizeKey(option) === textKey)
  if (exact) return exact
  const asciiTextKey = normalizeKey(leadingAscii(text))
  if (!asciiTextKey) return ''
  return allowedOptions.find((option) => normalizeKey(leadingAscii(option)) === asciiTextKey) || ''
}

function appendText(existing, addition) {
  const current = String(existing || '').trim()
  const next = String(addition || '').trim()
  if (!next) return current
  if (!current) return next
  const existingLines = current.split(/\n+/).map((line) => line.trim()).filter(Boolean)
  const incomingLines = next.split(/\n+/).map((line) => line.trim()).filter(Boolean)
  const keys = new Set(existingLines.map(normalizeKey))
  const additions = incomingLines.filter((line) => {
    const key = normalizeKey(line)
    if (!key || keys.has(key)) return false
    keys.add(key)
    return true
  })
  return additions.length ? `${current}\n${additions.join('\n')}` : current
}

function mergeSelections(existing = [], incoming = [], allowedOptions = []) {
  const current = Array.isArray(existing) ? [...existing] : []
  const keys = new Set(current.map(normalizeKey))
  let added = 0
  for (const value of incoming || []) {
    const option = resolveAllowedOption(value, allowedOptions)
    const key = normalizeKey(option)
    if (!option || keys.has(key)) continue
    current.push(option)
    keys.add(key)
    added += 1
  }
  return { values: current, added }
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function buildAiOptionCatalog({ tcmOptions = {}, chiefComplaints = [], customChiefComplaints = [] } = {}) {
  const diff = {}
  for (const field of DIFF_ARRAY_FIELDS) {
    if (field.startsWith('pulse') && field !== 'pulse') {
      diff[field] = uniqueStrings(tcmOptions.pulse || [])
    } else {
      diff[field] = uniqueStrings(tcmOptions[field] || [])
    }
  }
  return {
    summary: {
      chiefComplaints: uniqueStrings([...(chiefComplaints || []), ...(customChiefComplaints || [])]),
      chiefComplaintDurations: uniqueStrings(tcmOptions.chiefComplaintDuration || []),
    },
    diff,
    textFields: {
      otherExterior: 'Practitioner observations and exterior/body-surface symptoms, including limbs, five sense organs, head, back, muscles, skin, and visible findings.',
      otherChest: 'Chest, breathing, sleep, palpitation, stress, and hypochondriac details that do not match options.',
      otherAbdomen: 'Appetite, thirst, stomach, abdomen, reflux, bloating, and digestion details that do not match options.',
      otherLowerAbdomen: 'Bowel and urinary details that do not match options.',
      otherFemale: 'Menstrual, pregnancy, postpartum, fertility, or gynecological details that do not match options.',
      detailedPulse: 'Pulse details not covered by selectable pulse options.',
      pathologicalChanges: 'Palpation/channel findings and body-region pathological changes not covered by options.',
      otherTongue: 'Tongue observations not covered by selectable tongue options.',
    },
    numberFields: DIFF_NUMBER_FIELDS,
  }
}

export function buildAiCurrentNotes(form = {}) {
  return {
    summary: {
      chiefComplaint: form.chiefComplaint || '',
      chiefComplaintDuration: form.chiefComplaintDuration || '',
      chiefComplaintDescription: form.chiefComplaintDescription || '',
      progressOfDisease: form.progressOfDisease || '',
      summary: form.summary || '',
    },
    diff: {
      ...(form.diff || {}),
      conclusions: undefined,
      tongueImage: undefined,
      tongueImageResource: undefined,
    },
  }
}

export function applyAiConsultationNotes(target, aiResult = {}, optionCatalog = {}) {
  if (!target || typeof target !== 'object') {
    return { addedSelections: 0, appendedTextFields: 0, filledFields: 0 }
  }
  if (!target.diff || typeof target.diff !== 'object') target.diff = {}

  const result = aiResult.result && typeof aiResult.result === 'object' ? aiResult.result : aiResult
  const summary = result.summary && typeof result.summary === 'object' ? result.summary : {}
  const diff = result.diff && typeof result.diff === 'object' ? result.diff : {}
  let addedSelections = 0
  let appendedTextFields = 0
  let filledFields = 0

  if (!target.chiefComplaint && summary.chiefComplaint) {
    target.chiefComplaint = String(summary.chiefComplaint || '').trim()
    if (target.chiefComplaint) filledFields += 1
  }
  if (!target.chiefComplaintDuration && summary.chiefComplaintDuration) {
    const allowed = optionCatalog?.summary?.chiefComplaintDurations || []
    target.chiefComplaintDuration = resolveAllowedOption(summary.chiefComplaintDuration, allowed)
      || String(summary.chiefComplaintDuration || '').trim()
    if (target.chiefComplaintDuration) filledFields += 1
  }

  for (const field of ['chiefComplaintDescription', 'progressOfDisease', 'summary']) {
    const before = target[field] || ''
    const after = appendText(before, summary[field])
    if (after !== before) {
      target[field] = after
      appendedTextFields += 1
    }
  }

  for (const field of DIFF_ARRAY_FIELDS) {
    const allowed = optionCatalog?.diff?.[field] || []
    const incoming = Array.isArray(diff[field]) ? diff[field] : []
    const merged = mergeSelections(target.diff[field], incoming, allowed)
    target.diff[field] = merged.values
    addedSelections += merged.added
  }

  for (const field of DIFF_TEXT_FIELDS) {
    const before = target.diff[field] || ''
    const after = appendText(before, diff[field])
    if (after !== before) {
      target.diff[field] = after
      appendedTextFields += 1
    }
  }

  for (const field of DIFF_NUMBER_FIELDS) {
    const number = toFiniteNumber(diff[field])
    if (number === null) continue
    if (target.diff[field] === null || target.diff[field] === undefined || target.diff[field] === '') {
      target.diff[field] = number
      filledFields += 1
    }
  }

  return { addedSelections, appendedTextFields, filledFields }
}

