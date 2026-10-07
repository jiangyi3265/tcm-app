import { test, expect } from '@playwright/test'

for (const width of [390, 768]) {
  test(`public cancellation remains usable at ${width}px and submits one request`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.addInitScript(() => localStorage.setItem('tcm_lang', 'en'))
    let cancels = 0
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/api/public-booking/manage/qa-token**', async (route) => {
      const cancelled = route.request().method() === 'POST'
      if (cancelled) cancels++
      const appointment = { patientName: 'QA Patient', practitionerName: 'QA Practitioner', serviceLabel: 'Acupuncture',
        startTime: '2027-01-01T09:00:00', status: cancelled ? 'cancelled' : 'booked', canCancel: !cancelled }
      await route.fulfill({ json: cancelled ? { appointment } : appointment })
    })
    await page.goto('/manage/qa-token')
    const button = page.getByRole('button', { name: 'Cancel Appointment', exact: true })
    await expect(button).toBeEnabled()
    const geometry = await button.boundingBox()
    expect(geometry.x).toBeGreaterThanOrEqual(0)
    expect(geometry.x + geometry.width).toBeLessThanOrEqual(width)
    await button.click()
    await expect(page.getByRole('heading', { name: 'Appointment Cancelled', exact: true })).toBeVisible()
    expect(cancels).toBe(1)
    expect(errors).toEqual([])
    await page.screenshot({ path: `test-results/public-cancellation-${width}.png`, fullPage: true })
  })
}
