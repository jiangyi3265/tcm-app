import { test, expect } from '@playwright/test'

const options = {
  serviceTypes: [
    { key: 'short', label: 'Acupuncture 30min (70$) recommended for follow-ups', description: 'A follow-up visit with your practitioner.', defaultPrice: 70, duration: 30 },
    { key: 'long', label: 'Acupuncture 1 hour (100$) recommended for 1st visit', description: 'An initial consultation and acupuncture treatment.', defaultPrice: 100, duration: 60 },
  ],
  practitioners: [{ id: 'qa-doctor', name: 'QA Doctor', serviceKeys: ['short', 'long'] }],
  publicWindowStart: '2026-11-09', publicWindowEnd: '2026-12-08',
}

async function openBooking(page, embedded = false) {
  await page.addInitScript(() => localStorage.setItem('tcm_lang', 'en'))
  await page.route('**/api/public-booking/options', route => route.fulfill({ json: options }))
  await page.route('**/api/public-booking/schedule**', route => route.fulfill({ json: {
    publicWindowStart: options.publicWindowStart, publicWindowEnd: options.publicWindowEnd,
    days: [{ date: '2026-11-09', slots: ['09:30', '11:00'].map(time => ({
      date: '2026-11-09', startTime: `2026-11-09T${time}:00`, endTime: `2026-11-09T${time === '09:30' ? '10:00' : '11:30'}:00`,
      status: 'available', assignedPractitionerId: 'qa-doctor',
    })) }],
  } }))
  await page.goto(embedded ? '/booking?embed=1' : '/booking')
  await expect(page.locator('.time-block-button').first()).toBeVisible()
}

for (const width of [1440, 1200, 900, 390, 320]) {
  test(`booking uses compact text and centered details at ${width}px`, async ({ page, browserName }) => {
    await page.setViewportSize({ width, height: 1000 })
    await openBooking(page)
    const geometry = await page.locator('.public-card').evaluate(card => {
      const rect = card.getBoundingClientRect()
      const fields = card.querySelector('.details-fields').getBoundingClientRect()
      const heading = card.querySelector('.details-section .section-heading')
      return { width: rect.width, center: rect.x + rect.width / 2, fieldsCenter: fields.x + fields.width / 2,
        headingJustification: getComputedStyle(heading).justifyContent, overflow: document.documentElement.scrollWidth > innerWidth + 1 }
    })
    expect(geometry.width).toBeLessThanOrEqual(900)
    if (width >= 1200) expect(geometry.width).toBe(900)
    expect(geometry.fieldsCenter).toBeCloseTo(geometry.center, 1)
    expect(geometry.headingJustification).toBe('center')
    expect(geometry.overflow).toBe(false)
    const fontSizes = await page.locator('.page-head h1, .service-name, .service-description-row, .service-facts, .section-heading, .month-label, .month-step, .date-card, .time-block-button, .timezone-note, .details-fields label, .submit-button').evaluateAll(nodes => [...new Set(nodes.map(node => getComputedStyle(node).fontSize))])
    expect(fontSizes).toEqual(['14px'])
    // Preserve the application's existing iOS focus-zoom protection for inputs.
    const inputFontSizes = await page.locator('.details-fields input').evaluateAll(nodes => [...new Set(nodes.map(node => getComputedStyle(node).fontSize))])
    expect(inputFontSizes).toEqual([width <= 1024 ? '16px' : '14px'])
    expect(await page.locator('.month-step').evaluateAll(buttons => buttons.every(button => button.getBoundingClientRect().height >= 44))).toBe(true)
    await expect(page.locator('.details-fields input')).toHaveCount(4)
    await expect(page.getByRole('button', { name: 'Next month', exact: true })).toBeEnabled()
    await page.getByPlaceholder('First name', { exact: true }).fill('Synthetic')
    await page.getByRole('radio').last().click()
    await expect(page.getByPlaceholder('First name', { exact: true })).toHaveValue('Synthetic')
    await expect(page.locator('.clinic-logo')).toBeVisible()
    await page.screenshot({ path: `test-results/booking-compact-${browserName}-${width}.png`, fullPage: true })
  })
}

test('embedded booking retains the same 900px cap and centered form', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1000 })
  await openBooking(page, true)
  await expect(page.locator('.public-booking-page')).toHaveClass(/embedded/)
  const bounds = await page.locator('.public-card').boundingBox()
  const fields = await page.locator('.details-fields').boundingBox()
  expect(bounds.width).toBe(900)
  expect(fields.x + fields.width / 2).toBeCloseTo(bounds.x + bounds.width / 2, 1)
})
