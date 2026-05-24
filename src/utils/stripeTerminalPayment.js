import { stripeApi } from './api'

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function terminalErrorMessage(status = {}) {
  const actionStatus = String(status.actionStatus || '')
  const intentStatus = String(status.paymentIntentStatus || '')
  if (actionStatus === 'failed') return 'Stripe POS reader action failed.'
  if (intentStatus === 'canceled') return 'Stripe POS payment was canceled.'
  if (intentStatus === 'requires_payment_method' && actionStatus && actionStatus !== 'in_progress') {
    return 'Stripe POS payment needs another card/payment method.'
  }
  return ''
}

export async function runStripeTerminalPayment(
  consultationId,
  {
    intervalMs = 2000,
    timeoutMs = 120000,
    onStarted,
    onStatus,
  } = {},
) {
  const started = await stripeApi.createTerminalPayment(consultationId)
  onStarted?.(started)
  if (started?.paid) return started

  const paymentIntentId = started?.paymentIntentId
  if (!paymentIntentId) {
    throw new Error('Stripe POS payment intent was not returned.')
  }

  const expiresAt = Date.now() + timeoutMs
  let latest = started
  while (Date.now() < expiresAt) {
    await delay(intervalMs)
    latest = await stripeApi.getTerminalPaymentStatus(consultationId, paymentIntentId)
    onStatus?.(latest)
    if (latest?.paid) return latest

    const message = terminalErrorMessage(latest)
    if (message) {
      throw new Error(message)
    }
  }

  throw new Error('Stripe POS payment timed out. Please check the reader and Stripe dashboard.')
}
