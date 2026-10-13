import { expect } from '@playwright/test'
import { loginWithCredentials } from './api.js'

export function trackBrowserFailures(page) {
  const failures = []
  page.on('pageerror', (error) => failures.push(error.message))
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.startsWith('/api/') && response.status() >= 400) {
      failures.push(`${response.status()} ${response.request().method()} ${new URL(response.url()).pathname}`)
    }
  })
  return failures
}

export async function setPreferredLocale(page, locale = 'zh-CN') {
  await page.addInitScript((value) => {
    window.localStorage.setItem('tcm_lang', value)
  }, locale)
}

export async function loginThroughUi(page, { email = 'admin@clinic.com', password = 'admin123' } = {}) {
  await setPreferredLocale(page)
  await page.goto('/login')
  await expect(page.getByRole('button', { name: '登 录' })).toBeVisible()
  await page.getByPlaceholder('邮箱地址', { exact: true }).fill(email)
  await page.getByPlaceholder('密码', { exact: true }).fill(password)
  await page.getByRole('button', { name: '登 录' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

export async function seedSession(page, request, { email = 'admin@clinic.com', password = 'admin123' } = {}) {
  const result = await loginWithCredentials(request, { email, password })
  await setPreferredLocale(page)
  await page.addInitScript(({ token, user }) => {
    window.sessionStorage.setItem('tcm_token', token)
    window.sessionStorage.setItem('tcm_auth', JSON.stringify({ currentUser: user }))
  }, { token: result.token, user: result.user })
}

export async function chooseSelectOption(page, scope, labelText, optionText) {
  const formItem = scope.locator('.el-form-item').filter({ hasText: labelText }).first()
  await expect(formItem).toBeVisible()
  await formItem.locator('.el-select').first().click()
  const option = page.locator('.el-select-dropdown__item').filter({ hasText: optionText }).last()
  await expect(option).toBeVisible()
  await option.click()
}

export async function clickElementPlusMessageBoxConfirm(page) {
  const dialog = page.locator('.el-message-box').last()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: /确定|Confirm/ }).click()
}
