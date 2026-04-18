const PRACTITIONER_COLORS = [
  '#2d6a4f', '#d97706', '#4361ee', '#b5179e', '#0ea5e9',
  '#e11d48', '#16a34a', '#7c3aed', '#f59e0b', '#0891b2',
]

const ROOM_COLORS = [
  '#f4a261', '#a8dadc', '#ffb4a2', '#b5e48c', '#ffd6a5',
  '#caffbf', '#bde0fe', '#ffc8dd', '#fdffb6', '#cdb4db',
]

function hashString(input) {
  const text = String(input || '')
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function pickPractitionerColor(id) {
  if (!id) return PRACTITIONER_COLORS[0]
  return PRACTITIONER_COLORS[hashString(id) % PRACTITIONER_COLORS.length]
}

export function pickRoomColor(id) {
  if (!id) return ROOM_COLORS[0]
  return ROOM_COLORS[hashString(id) % ROOM_COLORS.length]
}

export function resolvePractitionerColor(user) {
  return user?.color || pickPractitionerColor(user?.id)
}

export function resolveRoomColor(room) {
  return room?.color || pickRoomColor(room?.id)
}

export { PRACTITIONER_COLORS, ROOM_COLORS }
