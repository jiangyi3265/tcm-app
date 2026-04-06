export function shouldQueueRxAutosave({ rxSyncing = false, hasPendingChanges = false } = {}) {
  return Boolean(rxSyncing && hasPendingChanges)
}

export function shouldSkipRxAutosaveAfterSync({ currentSnapshot = '', baselineSnapshot = '' } = {}) {
  return currentSnapshot === baselineSnapshot
}

export function shouldApplyRxAutosaveResult({
  requestSessionId = 0,
  activeSessionId = 0,
  showDialog = false,
} = {}) {
  return Boolean(
    showDialog
      && requestSessionId > 0
      && requestSessionId === activeSessionId,
  )
}
