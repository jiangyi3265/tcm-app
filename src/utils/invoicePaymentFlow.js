import { getOutstandingAmount } from './prescriptionWorkflow.js'

export async function resolveInvoicePaymentAfterSave(persistConsultationDraft) {
  const savedConsultation = await persistConsultationDraft({ silent: true, syncRoute: false })
  return {
    savedConsultation,
    outstandingAmount: getOutstandingAmount(savedConsultation || {}),
  }
}
