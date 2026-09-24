// Resolve a saved clinic file URL without retaining an old host or expired signature.
export function managedFileResource(value) {
  if (typeof value !== 'string') return null
  let resource = value
  if (/^https?:\/\//.test(value) || value.startsWith('/api/public/files/access')) {
    try {
      const url = new URL(value, 'https://clinic.invalid')
      if (url.pathname !== '/api/public/files/access') return null
      resource = url.searchParams.get('resource') || ''
    } catch {
      return null
    }
  }
  return /^(?:\/profile\/|\/?hospital-private\/)/.test(resource) ? resource : null
}
