const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'
const RELOAD_QUERY_PARAM = '__otcm_v'
const RELOAD_TS_QUERY_PARAM = '__otcm_ts'
const VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000

let reloadInProgress = false

function normalizeVersion(value) {
  return String(value || '').trim()
}

function getVersionUrl() {
  return `/version.json?t=${Date.now()}`
}

async function fetchServerVersion() {
  const response = await fetch(getVersionUrl(), { cache: 'no-store' })
  if (!response.ok) return ''
  const data = await response.json().catch(() => null)
  return normalizeVersion(data?.version)
}

function cleanReloadMarker() {
  const url = new URL(window.location.href)
  if (url.searchParams.get(RELOAD_QUERY_PARAM) !== APP_VERSION) return
  url.searchParams.delete(RELOAD_QUERY_PARAM)
  url.searchParams.delete(RELOAD_TS_QUERY_PARAM)
  const nextSearch = url.searchParams.toString()
  const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash}`
  window.history.replaceState(window.history.state, '', nextUrl)
}

function reloadForVersion(version) {
  if (reloadInProgress) return
  reloadInProgress = true
  const url = new URL(window.location.href)
  url.searchParams.set(RELOAD_QUERY_PARAM, version)
  url.searchParams.set(RELOAD_TS_QUERY_PARAM, String(Date.now()))
  window.location.replace(url.toString())
}

export async function checkForAppVersionUpdate() {
  try {
    const serverVersion = await fetchServerVersion()
    if (serverVersion && serverVersion !== APP_VERSION) {
      reloadForVersion(serverVersion)
    }
  } catch {
    // Ignore transient network errors; the next focus/interval check will retry.
  }
}

export function initAppVersionWatcher() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  cleanReloadMarker()
  const scheduleCheck = () => {
    void checkForAppVersionUpdate()
  }
  window.addEventListener('focus', scheduleCheck)
  window.addEventListener('online', scheduleCheck)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleCheck()
  })
  window.setInterval(scheduleCheck, VERSION_CHECK_INTERVAL_MS)
  scheduleCheck()
}
