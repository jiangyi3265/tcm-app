import { expect, test } from '@playwright/test'
import dayjs from 'dayjs'
import {
  apiJson,
  createPatient,
  createPractitioner,
  createRoom,
  loginAsAdmin,
  withTemporaryPractitionerSchedule,
} from './helpers/api.js'
import { setPreferredLocale } from './helpers/ui.js'

const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function toArray(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.rows)) return payload.rows
  if (Array.isArray(payload?.data)) return payload.data
  return []
}

async function createCancelableAppointment(request, label) {
  const suffix = `${label}-${Date.now()}`
  const shortId = `${label}${String(Date.now()).slice(-6)}`
  const practitioner = await createPractitioner(request, {
    name: `E2E公开医师-${suffix}`,
    email: `${shortId}@c.com`,
  })
  const room = await createRoom(request, {
    name: `E2E公开诊室-${suffix}`,
    supportTags: ['acupuncture'],
  })
  const patient = await createPatient(request, {
    name: `E2E公开病人-${suffix}`,
    email: '',
  })

  const targetDay = dayjs().add(1, 'day')
  const weekdayKey = WEEKDAY_KEYS[targetDay.day()]
  const startTime = targetDay.hour(9).minute(0).second(0).millisecond(0).format('YYYY-MM-DD HH:mm:ss')
  const endTime = targetDay.hour(10).minute(0).second(0).millisecond(0).format('YYYY-MM-DD HH:mm:ss')

  return withTemporaryPractitionerSchedule(request, practitioner.id, {
    [weekdayKey]: [{ start: '09:00', end: '17:00' }],
  }, async () => {
    const { token } = await loginAsAdmin(request)

    const createdAppointment = await apiJson(request, '/api/appointments', {
      method: 'POST',
      token,
      data: {
        patientId: patient.id,
        practitionerId: practitioner.id,
        roomId: room.id,
        serviceType: 'acupuncture_new',
        startTime,
        endTime,
        status: 'booked',
      },
    })

    const appointments = toArray(await apiJson(request, '/api/appointments', { token }))
    const matchedAppointment = appointments.find((item) => String(item.id) === String(createdAppointment.id))
      || createdAppointment

    const manageToken = matchedAppointment?.manageToken
      || createdAppointment?.manageToken
      || matchedAppointment?.payload?.manageToken

    if (!manageToken) {
      throw new Error(`未能从预约记录中提取 manageToken。创建结果字段：${Object.keys(matchedAppointment || {}).join(', ')}`)
    }

    const intakeLink = await apiJson(request, `/api/appointments/${createdAppointment.id}/intake-link`, {
      method: 'POST',
      token,
    })
    const intakeToken = intakeLink?.token || intakeLink?.intakeToken
    if (!intakeToken) {
      throw new Error('未能生成 intakeToken')
    }

    return {
      appointmentId: createdAppointment.id,
      manageToken,
      intakeToken,
      patientName: patient.name,
      practitionerName: practitioner.name,
    }
  })
}

test.describe.serial('公开预约取消 smoke', () => {
  test('公开预约管理页可以取消预约并展示成功态', async ({ page, request }) => {
    const { manageToken } = await createCancelableAppointment(request, 'manage')

    await setPreferredLocale(page)
    await page.goto(`/manage/${manageToken}`)

    await expect(page.getByRole('heading', { name: '预约管理' })).toBeVisible()
    const cancelButton = page.getByRole('button', { name: '取消预约' })
    await expect(cancelButton).toBeVisible()
    await expect(cancelButton).toBeEnabled()

    await cancelButton.click()

    await expect(page.getByRole('heading', { name: '预约已取消' })).toBeVisible()
    await expect(page.getByText('本次预约已取消，相关后续邮件也会一并停止。')).toBeVisible()
  })

  test('首次资料页可以取消预约并展示成功态', async ({ page, request }) => {
    const { intakeToken } = await createCancelableAppointment(request, 'intake')

    await setPreferredLocale(page)
    await page.goto(`/intake/${intakeToken}`)

    await expect(page.getByRole('heading', { name: '就诊问诊表' })).toBeVisible()
    const cancelButton = page.getByRole('button', { name: '取消这次预约' })
    await expect(cancelButton).toBeVisible()
    await expect(cancelButton).toBeEnabled()

    await cancelButton.click()

    await expect(page.getByRole('heading', { name: '预约已取消' })).toBeVisible()
    await expect(page.getByText('本次预约已经取消，后续提醒和回访邮件将不再发送。')).toBeVisible()
  })
})
