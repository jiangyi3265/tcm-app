import { allCountries } from 'country-region-data'

export const DEFAULT_COUNTRY = 'CA'

const countries = allCountries.map(([name, code, regions]) => ({
  name,
  code,
  regions: Array.isArray(regions) ? regions : [],
}))

const countryByCode = new Map(countries.map((country) => [country.code, country]))
const countryByName = new Map(countries.map((country) => [country.name.toLowerCase(), country]))

export const COUNTRY_OPTIONS = countries.map((country) => ({
  value: country.code,
  label: country.name,
}))

export function normalizeCountryCode(value, fallback = DEFAULT_COUNTRY) {
  const text = String(value || '').trim()
  if (!text) return fallback
  const upper = text.toUpperCase()
  if (countryByCode.has(upper)) return upper
  return countryByName.get(text.toLowerCase())?.code || fallback
}

export function getCountryLabel(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const code = normalizeCountryCode(text, '')
  return countryByCode.get(code)?.name || text
}

export function getProvinceOptions(countryCode = DEFAULT_COUNTRY) {
  const code = normalizeCountryCode(countryCode)
  const country = countryByCode.get(code)
  return (country?.regions || []).map(([name, regionCode]) => ({
    value: regionCode || name,
    label: regionCode ? `${regionCode} (${name})` : name,
    name,
    code: regionCode || '',
  }))
}

export function normalizeProvinceCode(countryCode, value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const options = getProvinceOptions(countryCode)
  const lower = text.toLowerCase()
  return options.find((option) =>
    String(option.value).toLowerCase() === lower
    || option.name.toLowerCase() === lower
    || option.label.toLowerCase() === lower
  )?.value || text
}

export function getProvinceLabel(countryCode, value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const options = getProvinceOptions(countryCode)
  return options.find((option) => String(option.value).toLowerCase() === text.toLowerCase())?.label || text
}
