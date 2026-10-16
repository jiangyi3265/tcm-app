import { test, expect } from '@playwright/test'
import { apiJson, createDraftConsultation, createPatient, loginAsAdmin, requireLocalTestTarget } from './helpers/api.js'
import { seedSession, setPreferredLocale, trackBrowserFailures } from './helpers/ui.js'

test.beforeEach(({ baseURL }) => requireLocalTestTarget(baseURL))

test('prescription tax survives real save, invoice PDF generation, and cashier loading', async ({ page, request }) => {
  const errors = trackBrowserFailures(page)
  const { token } = await loginAsAdmin(request)
  const patient = await createPatient(request, { name: `E2E Tax ${Date.now()}` })
  const consultation = await createDraftConsultation(request, {
    patientId: patient.id,
    overrideTaxRate: 0.13,
    prescriptions: [{ id: `tax-rx-${Date.now()}`, formulaName: 'Tax acceptance herbs', prescriptionType: 'raw_herbs', rxStatus: 'pending', quantity: 1, subtotal: 103.04, perDoseSubtotal: 103.04, items: [] }],
  })
  await seedSession(page, request)
  await setPreferredLocale(page, 'en')
  await page.goto(`/patients/${patient.id}/consultations/${consultation.id}`)
  await page.getByRole('tab', { name: 'Pricing', exact: true }).click()
  await expect(page.locator('.price-summary .tax-row')).toContainText('$13.40')
  await expect(page.locator('.price-summary .grand-total')).toContainText('$116.44')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(async () => (await apiJson(request, `/api/consultations/${consultation.id}`, { token })).totalAmount).toBe(116.44)
  const saved = await apiJson(request, `/api/consultations/${consultation.id}`, { token })
  expect(saved).toMatchObject({ totalWithoutTax: 103.04, taxAmount: 13.4, totalAmount: 116.44 })
  const pdf = await apiJson(request, `/api/consultations/${consultation.id}/pdf/invoice`, { token, method: 'POST' })
  expect(pdf).toHaveProperty('resource')
  expect(pdf.resource).toMatch(/\.pdf$/)
  await apiJson(request, `/api/consultations/${consultation.id}/complete`, { token, method: 'PATCH' })
  await page.goto('/cashier')
  const card = page.locator('.payment-card').filter({ hasText: patient.name })
  await expect(card).toBeVisible()
  await expect(card.locator('.amount-total')).toHaveText('$116.44')
  expect(errors).toEqual([])
})
