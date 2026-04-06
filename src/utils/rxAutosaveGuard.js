export function shouldQueueRxAutosave({ rxSyncing = false, hasPendingChanges = false } = {}) {
  return Boolean(rxSyncing && hasPendingChanges)
}

export function shouldSkipRxAutosaveAfterSync({ currentSnapshot = '', baselineSnapshot = '' } = {}) {
  return currentSnapshot === baselineSnapshot
}
