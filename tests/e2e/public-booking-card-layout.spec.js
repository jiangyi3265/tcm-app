import { test, expect } from '@playwright/test'

for (const width of [390, 320]) {
  test(`long service names retain their price inside the card at ${width}px`, async ({ page, browserName }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.addInitScript(() => localStorage.setItem('tcm_lang', 'en'))
    await page.route('**/api/public-booking/options', route => route.fulfill({ json: {
      serviceTypes: [
        { key: 'short', label: 'Acupuncture 30min (70$) recommended for follow-ups', defaultPrice: 70, duration: 30 },
        { key: 'long', label: 'Acupuncture 1 hour (100$) recommended for 1st visit', defaultPrice: 100, duration: 60 },
      ],
      practitioners: [{ id: 'qa-doctor', name: 'QA Doctor', serviceKeys: ['short', 'long'] }],
      publicWindowStart: '2026-10-30', publicWindowEnd: '2026-11-13',
    } }))
    await page.route('**/api/public-booking/schedule**', route => route.fulfill({ json: {
      publicWindowStart: '2026-10-30', publicWindowEnd: '2026-11-13', days: [{
        date: '2026-10-30', availableCount: 1,
        slots: [{ date: '2026-10-30', startTime: '2026-10-30T09:00:00', endTime: '2026-10-30T10:00:00', status: 'available', assignedPractitionerId: 'qa-doctor' }],
      }],
    } }))
    await page.goto('/booking')
    await expect(page.locator('.time-block-button')).toBeVisible()
    await expect.poll(() => page.locator('.service-card').evaluateAll(cards => cards.every(card => {
      const bounds = card.getBoundingClientRect()
      const facts = card.querySelector('.service-facts').getBoundingClientRect()
      const title = card.querySelector('.service-name').getBoundingClientRect()
      return facts.bottom <= bounds.bottom - 10 && facts.top >= title.bottom
    }))).toBe(true)
    await page.getByRole('radio').last().click()
    await expect(page.getByRole('radio').last()).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('radio').first()).toHaveAttribute('aria-checked', 'false')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: `test-results/booking-cards-${browserName}-${width}.png`, fullPage: true })
  })
}
