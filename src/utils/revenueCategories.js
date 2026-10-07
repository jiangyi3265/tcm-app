import { getBillablePrescriptionTotal } from './prescriptionWorkflow.js'

export const REVENUE_CATEGORIES = ['acupuncture', 'consultation', 'herbs', 'others']
const normalize = (value) => String(value || '').trim().toLowerCase().replace(/[\s_()-]+/g, '')
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0
const money = (value) => Math.round((value + Number.EPSILON) * 100) / 100

export function getRevenueCategory(service = {}, serviceTypes = {}, categories = {}) {
  const key = service.serviceKey || service.key
  const matched = serviceTypes[key] || Object.entries(serviceTypes).find(([, item]) =>
    normalize(item.label) && normalize(item.label) === normalize(service.name || service.label),
  )?.[1]
  const matchedKey = Object.keys(serviceTypes).find((id) => serviceTypes[id] === matched) || key
  const configured = categories[matchedKey] || service.revenueCategory || matched?.revenueCategory
  if (REVENUE_CATEGORIES.includes(configured)) return configured
  const text = [key, service.name, service.label, matched?.label, matched?.requiredTag].map(normalize).join(' ')
  if (/acupuncture|针灸|^acu\b/.test(text)) return 'acupuncture'
  if (/consultation|consultonly|问诊|咨询/.test(text)) return 'consultation'
  if (/herb|formula|chinesemedicine|草药|中药|方剂/.test(text)) return 'herbs'
  return 'others'
}

export function classifyPaidRevenue(consultation = {}, paid = 0, serviceTypes = {}, categories = {}) {
  const weights = { acupuncture: 0, consultation: Math.max(0, number(consultation.consultationFee)), herbs: 0, others: 0 }
  for (const service of consultation.services || []) {
    const category = getRevenueCategory(service, serviceTypes, categories)
    const amount = service.price != null
      ? number(service.price) * number(service.quantity ?? 1) - number(service.manualDiscount)
      : number(service.amount)
    weights[category] += Math.max(0, amount)
  }
  if (consultation.includeRxAmount !== false) {
    weights.herbs += Math.max(0, getBillablePrescriptionTotal(consultation))
    if (!consultation.prescriptions?.length && consultation.prescriptionType && consultation.prescriptionType !== 'none') {
      weights.herbs += Math.max(0, number(consultation.totalWithoutTax) - Object.values(weights).reduce((sum, amount) => sum + amount, 0))
    }
  }
  const gross = number(consultation.totalAmount) || number(paid)
  const tax = gross > 0 ? money(number(paid) * Math.min(Math.max(number(consultation.taxAmount), 0), gross) / gross) : 0
  const net = money(number(paid) - tax)
  let totalWeight = Object.values(weights).reduce((sum, amount) => sum + amount, 0)
  if (!totalWeight) { weights.others = 1; totalWeight = 1 }
  const result = { tax, total: money(number(paid)) }
  for (const category of REVENUE_CATEGORIES) result[category] = money(net * weights[category] / totalWeight)
  const largest = REVENUE_CATEGORIES.reduce((a, b) => weights[a] >= weights[b] ? a : b)
  result[largest] = money(result[largest] + net - REVENUE_CATEGORIES.reduce((sum, category) => sum + result[category], 0))
  return result
}
