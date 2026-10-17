import { test, expect } from '@playwright/test'
import { apiJson, createDraftConsultation, createPatient, loginAsAdmin, requireLocalTestTarget } from './helpers/api.js'
import { seedSession, setPreferredLocale, trackBrowserFailures } from './helpers/ui.js'

test.beforeEach(({ baseURL }) => requireLocalTestTarget(baseURL))

for (const scenario of [
  { name: 'Mubu prescription tax', amount: 103.04, discount: 0, base: 103.04, tax: 13.4, total: 116.44 },
  { name: 'discount half-cent boundary', amount: 2.3, discount: 5, base: 2.19, tax: 0.28, total: 2.47 },
]) test(`${scenario.name} survives real save, invoice PDF generation, and cashier loading`, async ({ page, request }) => {
  const errors = trackBrowserFailures(page)
  const { token } = await loginAsAdmin(request)
  const patient = await createPatient(request, { name: `E2E Tax ${Date.now()}` })
  const consultation = await createDraftConsultation(request, {
    patientId: patient.id,
    overrideTaxRate: 0.13,
    discountType: 'percentage', discountValue: scenario.discount,
    prescriptions: [{ id: `tax-rx-${Date.now()}`, formulaName: 'Tax acceptance herbs', prescriptionType: 'raw_herbs', rxStatus: 'pending', quantity: 1, subtotal: scenario.amount, perDoseSubtotal: scenario.amount, items: [] }],
  })
  await seedSession(page, request)
  await setPreferredLocale(page, 'en')
  await page.goto(`/patients/${patient.id}/consultations/${consultation.id}`)
  await page.getByRole('tab', { name: 'Pricing', exact: true }).click()
  await expect(page.locator('.price-summary .tax-row')).toContainText(`$${scenario.tax.toFixed(2)}`)
  await expect(page.locator('.price-summary .grand-total')).toContainText(`$${scenario.total.toFixed(2)}`)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(async () => (await apiJson(request, `/api/consultations/${consultation.id}`, { token })).totalAmount).toBe(scenario.total)
  const saved = await apiJson(request, `/api/consultations/${consultation.id}`, { token })
  expect(saved).toMatchObject({ totalWithoutTax: scenario.base, taxAmount: scenario.tax, totalAmount: scenario.total })
  const pdf = await apiJson(request, `/api/consultations/${consultation.id}/pdf/invoice`, { token, method: 'POST' })
  expect(pdf).toHaveProperty('resource')
  expect(pdf.resource).toMatch(/\.pdf$/)
  await apiJson(request, `/api/consultations/${consultation.id}/complete`, { token, method: 'PATCH' })
  await page.goto('/cashier')
  const card = page.locator('.payment-card').filter({ hasText: patient.name })
  await expect(card).toBeVisible()
  await expect(card.locator('.amount-total')).toHaveText(`$${scenario.total.toFixed(2)}`)
  expect(errors).toEqual([])
})
