import { expect, test } from '@playwright/test'
import dayjs from 'dayjs'
import { createDraftConsultation, createPatient, createPractitioner, createRoom, withTemporaryPractitionerSchedule } from './helpers/api.js'
import { chooseSelectOption, seedSession, setPreferredLocale } from './helpers/ui.js'

const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

test.describe.serial('最小浏览器级冒烟', () => {
  test('公开预约页可匿名完成预约', async ({ page, request }) => {
    const practitioner = await createPractitioner(request, {
      name: `E2E公开医师-${Date.now()}`,
    })
    const room = await createRoom(request, {
      name: `E2E公开诊室-${Date.now()}`,
      supportTags: ['acupuncture'],
    })
    await withTemporaryPractitionerSchedule(request, practitioner.id, {
      wednesday: [{ start: '09:00', end: '12:00' }],
    }, async () => {
      const bookingName = `E2E公开预约-${Date.now()}`
      const bookingPhone = `138${String(Date.now()).slice(-8)}`

      await setPreferredLocale(page)
      await page.goto('/book')
      await expect(page.getByRole('heading', { name: '在线预约' })).toBeVisible()

      const form = page.locator('.public-form')
      await chooseSelectOption(page, form, '医师', practitioner.name)

      await expect(page.locator('.schedule-empty').filter({ hasText: '加载中...' })).toBeHidden({ timeout: 15000 })
      const slotCard = page.locator('.slot-card').first()
      await expect(slotCard).toBeVisible()
      const selectedSlotTime = (await slotCard.locator('.slot-time').first().textContent())?.trim() || ''
      await slotCard.click()

      await page.locator('input[placeholder="请输入您的姓名"]').fill(bookingName)
      await page.locator('input[placeholder="请输入手机号或联系电话"]').fill(bookingPhone)
      await page.getByRole('button', { name: '提交预约' }).click()

      await expect(page.getByRole('heading', { name: '预约已提交' })).toBeVisible()
      await expect(page.getByText(`接诊医师：${practitioner.name}`)).toBeVisible()
      if (selectedSlotTime) {
        await expect(page.getByText('预约时间：')).toContainText(selectedSlotTime.split(' - ')[0])
      }

      await page.getByRole('button', { name: /继续预约|再约一个/ }).click()
      await expect(page.getByRole('heading', { name: '在线预约' })).toBeVisible()
      if (selectedSlotTime) {
        await expect(page.locator('.slot-card').filter({ hasText: selectedSlotTime.split(' - ')[0] })).toHaveCount(0)
      }
    })
  })

  test('前台预约页排班与建单联动可用', async ({ page, request }) => {
    const practitioner = await createPractitioner(request, {
      name: `E2E排班医师-${Date.now()}`,
    })
    const todayKey = WEEKDAY_KEYS[dayjs().day()]
    await withTemporaryPractitionerSchedule(request, practitioner.id, {
      [todayKey]: [{ start: '14:20', end: '16:20' }],
    }, async () => {
      const patient = await createPatient(request, {
        name: `E2E排班联动-${Date.now()}`,
        email: '',
      })

      await seedSession(page, request)
      await page.goto('/appointments')
      await expect(page.getByRole('banner').getByText('预约管理', { exact: true })).toBeVisible()

      await page.locator('.appt-toolbar .toolbar-right .el-select').first().click()
      await page.locator('.el-select-dropdown__item').filter({ hasText: practitioner.name }).last().click()

      const slotPrefix = dayjs().format('YYYY-MM-DD')
      const slot1420 = page.locator(`[data-testid="appointment-slot-${slotPrefix}-14:20"].clickable`)
      const slot1430 = page.locator(`[data-testid="appointment-slot-${slotPrefix}-14:30"].clickable`)
      await expect(slot1420).toBeVisible()
      await expect(slot1430).toBeVisible()
      await slot1420.click()

      const drawer = page.locator('.el-drawer').filter({ hasText: '新建预约' }).last()
      await expect(drawer).toBeVisible()
      await chooseSelectOption(page, drawer, '病人', patient.name)
      await chooseSelectOption(page, drawer, '服务类型', '仅中药')

      const slotCard = drawer.locator('.availability-card').filter({ hasText: '14:20' }).first()
      await expect(slotCard).toBeVisible()
      await slotCard.click()
      await drawer.getByRole('button', { name: '确认预约' }).click()

      await expect(page.getByText('预约已创建')).toBeVisible()
      await expect(page.locator('[data-testid^="appointment-block-"]').filter({ hasText: patient.name }).first()).toBeVisible()
    })
  })

  test('处方完成在 autosave 竞争下仍进入待发状态', async ({ page, request }) => {
    const consultation = await createDraftConsultation(request, {
      patientId: 'patient-1',
      practitionerId: '101',
    })
    const rxTraffic = []
    const rxRequestPattern = /\/api\/consultations\/[^/]+\/prescriptions(?:\/[^/]+\/complete)?$/
    page.on('request', (req) => {
      if (rxRequestPattern.test(req.url())) {
        rxTraffic.push(`REQ ${req.method()} ${req.url()}`)
      }
    })
    page.on('response', async (res) => {
      if (rxRequestPattern.test(res.url())) {
        let detail = `RES ${res.status()} ${res.request().method()} ${res.url()}`
        if (!res.ok()) {
          const responseText = await res.text().catch(() => '')
          if (responseText) detail += ` BODY ${responseText}`
        }
        rxTraffic.push(detail)
      }
    })

    let delayedAutosaveCount = 0
    await page.route('**/api/consultations/*/prescriptions', async (route) => {
      if (route.request().method() === 'PATCH' && delayedAutosaveCount === 0) {
        delayedAutosaveCount += 1
        await page.waitForTimeout(1500)
      }
      await route.continue()
    })

    await seedSession(page, request)
    await page.goto(`/patients/patient-1/consultations/${consultation.id}`)
    const treatmentsTab = page.getByRole('tab', { name: /Treatments/ })
    await expect(treatmentsTab).toBeVisible()
    await treatmentsTab.click()

    const treatmentsPanel = page.getByRole('tabpanel', { name: /Treatments/ })
    await expect(treatmentsPanel.locator('.sec-header').filter({ hasText: 'Prescriptions' })).toBeVisible()

    await treatmentsPanel.getByRole('button', { name: /New Prescription/ }).click()
    const drawer = page.locator('.el-drawer').filter({ hasText: 'New Prescription' }).last()
    await expect(drawer).toBeVisible()

    const autosaveStarted = page.waitForRequest((req) =>
      req.method() === 'PATCH' && /\/api\/consultations\/[^/]+\/prescriptions$/.test(req.url()),
    )

    await drawer.locator('.el-form-item').filter({ hasText: 'Formula' }).locator('input').fill('四君子汤')
    await expect(page.locator('.formula-item').filter({ hasText: '四君子汤' }).first()).toBeVisible()
    await page.locator('.formula-item').filter({ hasText: '四君子汤' }).first().click()

    await autosaveStarted
    const completeResponse = page.waitForResponse(
      (res) => res.request().method() === 'PATCH'
        && /\/api\/consultations\/[^/]+\/prescriptions\/[^/]+\/complete$/.test(res.url()),
      { timeout: 20000 },
    )
    await drawer.getByRole('button', { name: '完成处方' }).click()
    try {
      await completeResponse
    } catch (error) {
      throw new Error(`${error.message}\n处方请求轨迹:\n${rxTraffic.join('\n')}`)
    }

    await expect(drawer).toBeHidden()
    const row = treatmentsPanel.locator('.el-table__row').filter({ hasText: '四君子汤' }).first()
    await expect(row).toContainText('待发')

    await page.goto('/pharmacy')
    await expect(page.getByText('待发药处方')).toBeVisible()
    await expect(page.locator('.rx-card').filter({ hasText: '四君子汤' }).first()).toBeVisible()
  })
})
