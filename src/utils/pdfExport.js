function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatMoney(value) {
  const amount = Number(value ?? 0)
  const safeAmount = Number.isFinite(amount) ? amount : 0
  return `CAD ${safeAmount.toFixed(2)}`
}

function formatStructuredValue(value) {
  if (value == null || value === '' || value === '-' || value === '[]' || value === '{}') return '-'
  if (Array.isArray(value)) {
    const parts = value.map(formatStructuredValue).filter((item) => item && item !== '-')
    return parts.length ? parts.join(', ') : '-'
  }
  if (typeof value === 'object') {
    const parts = Object.entries(value)
      .filter(([, item]) => item != null && item !== '' && item !== '-' && item !== '[]' && item !== '{}')
      .map(([key, item]) => `${key}: ${formatStructuredValue(item)}`)
    return parts.length ? parts.join('\n') : '-'
  }
  return String(value).trim() || '-'
}

function firstValue(...values) {
  const found = values.find((value) => {
    if (value == null) return false
    const text = String(value).trim()
    return text && text !== '-' && text !== '[]' && text !== '{}'
  })
  return found == null ? '-' : String(found).trim()
}

function buildPatientAddress(patient = {}) {
  const parts = [
    firstValue(patient.addressStreet, patient.street, patient.address),
    firstValue(patient.addressCity, patient.city),
    firstValue(patient.addressState, patient.province),
    firstValue(patient.addressPostal, patient.postalCode),
  ].filter((item) => item && item !== '-')
  return parts.length ? parts.join(', ') : firstValue(patient.fullAddress, patient.mailingAddress)
}

function getPractitionerName(practitioner = {}) {
  return firstValue(practitioner.practitionerName, practitioner.name, practitioner.nickName)
}

function getPractitionerOrganization(practitioner = {}) {
  return firstValue(practitioner.organization, practitioner.regulatoryBody)
}

function getPractitionerNumber(practitioner = {}) {
  return firstValue(practitioner.organizationNumber, practitioner.registrationNumber, practitioner.licenseNumber)
}

function getSubtotal(consultation = {}) {
  if (consultation.totalWithoutTax != null) return Number(consultation.totalWithoutTax || 0)
  const total = Number(consultation.totalAmount || 0)
  const tax = Number(consultation.taxAmount || 0)
  return Math.max(0, total - tax)
}

function getTaxAmount(consultation = {}) {
  return Number(consultation.taxAmount || 0)
}

function getTotalAmount(consultation = {}) {
  if (consultation.totalAmount != null) return Number(consultation.totalAmount || 0)
  return getSubtotal(consultation) + getTaxAmount(consultation)
}

function openPrintWindow(title, bodyHtml) {
  const win = window.open('', '_blank', 'width=1100,height=800')
  if (!win) return

  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; padding: 24px 28px; line-height: 1.5; }
    h1, h2, h3 { margin: 0; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #d1d5db; padding-bottom: 12px; margin-bottom: 20px; }
    .subtitle { color: #6b7280; margin-top: 4px; }
    .section { margin-top: 18px; }
    .section-title { font-size: 14px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 10px; color: #111827; }
    .info-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px; }
    .info-item { display: flex; gap: 8px; }
    .info-label { min-width: 120px; color: #6b7280; font-weight: 600; }
    .preline { white-space: pre-wrap; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #d1d5db; padding: 8px 10px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; font-weight: 700; }
    .muted { color: #6b7280; }
    .note { margin-top: 16px; padding-top: 12px; border-top: 1px dashed #d1d5db; color: #6b7280; font-size: 12px; }
    ul { margin: 8px 0 0 18px; }
    @media print { body { padding: 16px 20px; } }
  </style>
</head>
<body>${bodyHtml}</body>
</html>`)
  win.document.close()
  setTimeout(() => win.print(), 500)
}

function buildRows(items, renderRow, emptyMessage, columnCount) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<tr><td colspan="${columnCount}" class="muted">${escapeHtml(emptyMessage)}</td></tr>`
  }
  return items.map(renderRow).join('')
}

function getServiceExtended(service) {
  const quantity = Number(service?.quantity || 0)
  const price = Number(service?.price || 0)
  const discount = Number(service?.manualDiscount || 0)
  return Math.max(0, price * quantity - discount)
}

function getConsultationServiceTotal(consultation = {}) {
  const services = Array.isArray(consultation?.services) ? consultation.services : []
  return services.reduce((sum, service) => sum + getServiceExtended(service), 0)
}

function getConsultationPrescriptionTotal(consultation = {}) {
  const prescriptions = Array.isArray(consultation?.prescriptions) ? consultation.prescriptions : []
  return prescriptions.reduce((sum, rx) => sum + Number(rx?.subtotal || 0), 0)
}

function getPaidAmount(consultation = {}) {
  if (consultation?.paidAmount != null) return Number(consultation.paidAmount || 0)
  const records = Array.isArray(consultation?.paymentRecords) ? consultation.paymentRecords : []
  return records.reduce((sum, record) => sum + Number(record?.amount || 0), 0)
}

function getHstLabel(rate) {
  const numericRate = Number(rate || 0)
  if (!Number.isFinite(numericRate) || numericRate <= 0) return 'HST'
  const percent = numericRate > 1 ? numericRate : numericRate * 100
  return `HST (${Number(percent.toFixed(2)).toString()}%)`
}

function getPractitionerSignatureUrl(practitioner = {}) {
  const signature = practitioner?.signature
  if (signature && typeof signature === 'object') return signature.url || ''
  return practitioner?.signatureUrl || ''
}

function buildInvoiceChargeRows(consultation = {}, currency = 'CAD') {
  const rows = []
  const consultationFee = Number(consultation?.consultationFee || 0)
  if (consultationFee > 0) {
    rows.push({
      description: 'Consultation Fee / 诊疗费',
      quantity: 1,
      unitPrice: consultationFee,
      amount: consultationFee,
    })
  }

  const services = Array.isArray(consultation?.services) ? consultation.services : []
  services.forEach((service) => {
    const quantity = Number(service?.quantity || 1)
    const unitPrice = Number(service?.price || 0)
    const amount = getServiceExtended(service)
    if (!service?.name && amount <= 0) return
    rows.push({
      description: service?.name || 'Service / 服务',
      quantity,
      unitPrice,
      amount,
    })
  })

  if (consultation?.includeRxAmount) {
    const prescriptions = Array.isArray(consultation?.prescriptions) ? consultation.prescriptions : []
    prescriptions
      .filter((rx) => !rx?.deletedAt && rx?.rxStatus !== 'deleted')
      .filter((rx) => !rx?.rxStatus || ['pending', 'dispensed'].includes(rx.rxStatus))
      .forEach((rx) => {
        const quantity = Math.max(1, Number(rx?.quantity || 1))
        const amount = Number(rx?.subtotal || 0)
        const unitPrice = rx?.perDoseSubtotal != null ? Number(rx.perDoseSubtotal || 0) : amount / quantity
        const name = rx?.formulaName || rx?.name || rx?.prescriptionType || 'Prescription / 中药'
        rows.push({
          description: `Prescription / 中药: ${name}`,
          quantity,
          unitPrice,
          amount,
        })
      })
  }

  if (rows.length === 0) {
    return `<tr><td colspan="4" class="muted">No charge items / 暂无收费项目</td></tr>`
  }

  return rows.map((row) => `<tr>
    <td>${escapeHtml(row.description)}</td>
    <td>${escapeHtml(String(row.quantity || '-'))}</td>
    <td>${formatMoney(row.unitPrice, currency)}</td>
    <td>${formatMoney(row.amount, currency)}</td>
  </tr>`).join('')
}

function buildDiffSummary(diff = {}) {
  const fields = [
    ['Cold / Heat', diff.coldHeat],
    ['Sweat', diff.sweat],
    ['Sleep', diff.sleep],
    ['Appetite', diff.appetite],
    ['Thirst', diff.thirst],
    ['Bowel Movement', diff.bowelMovement],
    ['Urine', diff.urine],
    ['Pulse', diff.pulse],
    ['Tongue Color', diff.tongueColor],
    ['Tongue Body / Shape', diff.tongueBody],
    ['Tongue Coating', diff.tongueCoating],
  ].filter(([, value]) => value && (Array.isArray(value) ? value.length > 0 : true))

  if (fields.length === 0) {
    return '<p class="muted">No differentiation summary recorded.</p>'
  }

  return `<ul>${fields.map(([label, value]) => {
    const displayVal = formatStructuredValue(value)
    return `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(String(displayVal))}</li>`
  }).join('')}</ul>`
}

function buildPrescriptionTables(prescriptions = [], currency = 'CAD') {
  if (!Array.isArray(prescriptions) || prescriptions.length === 0) {
    return '<p class="muted">No prescriptions recorded.</p>'
  }

  return prescriptions.map((rx, index) => {
    const items = Array.isArray(rx.items) ? rx.items : []
    const rows = buildRows(
      items,
      (item) => {
        const dose = item.convertedQty != null
          ? `${item.convertedQty} ${item.convertedUnit || ''}`.trim()
          : `${item.dosage || item.quantity || '-'} ${item.unit || ''}`.trim()
        return `<tr>
          <td>${escapeHtml(item.herbName || item.name || '-')}</td>
          <td>${escapeHtml(dose || '-')}</td>
          <td>${escapeHtml(item.supplierName || item.supplier || '-')}</td>
          <td>${escapeHtml(item.notes || '')}</td>
        </tr>`
      },
      'No prescription items recorded.',
      4,
    )

    return `
      <div class="section">
        <div class="section-title">Prescription ${index + 1}</div>
        <div><strong>Name:</strong> ${escapeHtml(rx.formulaName || 'Custom Formula')}</div>
        <div><strong>Type:</strong> ${escapeHtml(rx.prescriptionType || '-')}</div>
        <div><strong>Source:</strong> ${escapeHtml(rx.whereToGet || '-')}</div>
        <div><strong>Quantity:</strong> ${escapeHtml(rx.quantity || '-')}</div>
        <div><strong>Total:</strong> ${formatMoney(rx.subtotal || 0, currency)}</div>
        <table>
          <tr><th>Herb</th><th>Dose</th><th>Supplier</th><th>Notes</th></tr>
          ${rows}
        </table>
      </div>`
  }).join('')
}

export function printConsultationReport(consultation, patient, practitioner, clinicName) {
  const clinic = clinicName || 'TCM Clinic Management System'
  const diff = consultation?.diff || {}
  const acupunctureRows = buildRows(
    consultation?.acupuncture || [],
    (item) => `<tr>
      <td>${escapeHtml(item.point || '-')}</td>
      <td>${escapeHtml(item.side || '-')}</td>
      <td>${escapeHtml(item.notes || '-')}</td>
    </tr>`,
    'No acupuncture points recorded.',
    3,
  )
  const conclusionRows = buildRows(
    diff.conclusions || [],
    (item) => `<tr>
      <td>${escapeHtml(item.name || '-')}</td>
      <td>${escapeHtml(item.treatment || '-')}</td>
    </tr>`,
    'No differentiation conclusions recorded.',
    2,
  )
  const currency = consultation?.currency || 'CAD'
  const chargeRows = buildInvoiceChargeRows(consultation, currency)
  const paidAmount = getPaidAmount(consultation)
  const totalAmount = getTotalAmount(consultation)
  const balanceAmount = Math.max(0, totalAmount - paidAmount)
  const practitionerName = getPractitionerName(practitioner)
  const organization = getPractitionerOrganization(practitioner)
  const organizationNumber = getPractitionerNumber(practitioner)
  const hstLabel = getHstLabel(consultation?.overrideTaxRate || consultation?.taxRate)

  const bodyHtml = `
    <div class="header">
      <div>
        <h1>${escapeHtml(clinic)}</h1>
        <div class="subtitle">Clinical Record: Consultation</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Patient and Insurance Details / 报销信息</div>
      <div class="info-grid">
        <div class="info-item"><span class="info-label">Consultation ID</span><span>${escapeHtml(consultation?.consultationId || '-')}</span></div>
        <div class="info-item"><span class="info-label">Date</span><span>${escapeHtml(consultation?.date || '-')}</span></div>
        <div class="info-item"><span class="info-label">Patient</span><span>${escapeHtml(patient?.name || '-')}</span></div>
        <div class="info-item"><span class="info-label">Date of Birth</span><span>${escapeHtml(firstValue(patient?.dateOfBirth, patient?.birthDate, patient?.dob))}</span></div>
        <div class="info-item"><span class="info-label">Patient Phone</span><span>${escapeHtml(firstValue(patient?.phone, patient?.phoneNumber, patient?.mobile))}</span></div>
        <div class="info-item"><span class="info-label">Patient Email</span><span>${escapeHtml(firstValue(patient?.email))}</span></div>
        <div class="info-item"><span class="info-label">Patient Address</span><span>${escapeHtml(buildPatientAddress(patient))}</span></div>
        <div class="info-item"><span class="info-label">Clinic</span><span>${escapeHtml(clinic)}</span></div>
        <div class="info-item"><span class="info-label">Practitioner</span><span>${escapeHtml(practitionerName)}</span></div>
        <div class="info-item"><span class="info-label">Title</span><span>${escapeHtml(firstValue(practitioner?.title))}</span></div>
        <div class="info-item"><span class="info-label">Organization</span><span>${escapeHtml(organization)}</span></div>
        <div class="info-item"><span class="info-label">Organization No.</span><span>${escapeHtml(organizationNumber)}</span></div>
        <div class="info-item"><span class="info-label">Practitioner Phone</span><span>${escapeHtml(firstValue(practitioner?.practitionerPhone, practitioner?.phone, practitioner?.phonenumber))}</span></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Chief Complaint</div>
      <p><strong>${escapeHtml(consultation?.chiefComplaint || '-')}</strong> ${consultation?.chiefComplaintDuration ? `(${escapeHtml(consultation.chiefComplaintDuration)})` : ''}</p>
      <p>${escapeHtml(consultation?.chiefComplaintDescription || '')}</p>
      <p>${escapeHtml(consultation?.progressOfDisease || '')}</p>
    </div>

    <div class="section">
      <div class="section-title">History and Medication</div>
      <p>${escapeHtml(consultation?.historyAndMedicationSnapshot || consultation?.historyAndMedication || patient?.historyAndMedication || '-')}</p>
    </div>

    <div class="section">
      <div class="section-title">Differentiation Summary</div>
      ${buildDiffSummary(diff)}
    </div>

    <div class="section">
      <div class="section-title">Differentiation Conclusions</div>
      <table>
        <tr><th>Name</th><th>Treatment</th></tr>
        ${conclusionRows}
      </table>
    </div>

    <div class="section">
      <div class="section-title">Treatment / 治疗</div>
      <p><strong>Treatment Plan:</strong> ${escapeHtml(firstValue(consultation?.treatment, consultation?.treatmentPlan, consultation?.acupunctureTreatment))}</p>
      <p><strong>Prognosis:</strong> ${escapeHtml(firstValue(consultation?.prognosis))}</p>
      <p><strong>Follow Up:</strong> ${escapeHtml(firstValue(consultation?.followUp, consultation?.followUpAdvice, consultation?.aftercare))}</p>
    </div>

    <div class="section">
      <div class="section-title">Acupuncture</div>
      <table>
        <tr><th>Point</th><th>Side</th><th>Notes</th></tr>
        ${acupunctureRows}
      </table>
    </div>

    ${buildPrescriptionTables(consultation?.prescriptions || [], currency)}

    <div class="section">
      <div class="section-title">收费项目 / Service Items</div>
      <table>
        <tr><th>Description / 收费项目</th><th>Qty / 数量</th><th>Unit Price / 单价</th><th>Subtotal / 小计</th></tr>
        ${chargeRows}
      </table>
    </div>

    <div class="section">
      <div class="section-title">Payment Summary / 付款摘要</div>
      <table>
        <tr><th>Field</th><th>Value</th></tr>
        <tr><td>Subtotal</td><td>${formatMoney(getSubtotal(consultation), currency)}</td></tr>
        <tr><td>${escapeHtml(hstLabel)}</td><td>${formatMoney(getTaxAmount(consultation), currency)}</td></tr>
        <tr><td>Total</td><td>${formatMoney(totalAmount, currency)}</td></tr>
        <tr><td>Paid Amount</td><td>${formatMoney(paidAmount, currency)}</td></tr>
        <tr><td>Balance Amount</td><td>${formatMoney(balanceAmount, currency)}</td></tr>
      </table>
    </div>

    <div class="section">
      <div class="section-title">Notes</div>
      <p>${escapeHtml(consultation?.comments || consultation?.previousPrognosisReview || '-')}</p>
    </div>
  `

  openPrintWindow('Consultation Report', bodyHtml)
}

export function printInvoice(consultation, patient, practitioner, clinicName, taxRate) {
  const clinic = clinicName || 'TCM Clinic Management System'
  const currency = consultation?.currency || 'CAD'
  const chargeRows = buildInvoiceChargeRows(consultation, currency)
  const paidAmount = getPaidAmount(consultation)
  const totalAmount = getTotalAmount(consultation)
  const balanceAmount = Math.max(0, totalAmount - paidAmount)
  const signatureUrl = getPractitionerSignatureUrl(practitioner)
  const organization = getPractitionerOrganization(practitioner)
  const organizationNumber = getPractitionerNumber(practitioner)
  const practitionerName = getPractitionerName(practitioner)
  const hstLabel = getHstLabel(consultation?.overrideTaxRate || consultation?.taxRate || taxRate)

  const bodyHtml = `
    <div class="header">
      <div>
        <h1>${escapeHtml(clinic)}</h1>
        <div class="subtitle">Invoice</div>
      </div>
    </div>

    <div class="section">
      <div class="info-grid">
        <div class="info-item"><span class="info-label">Invoice ID</span><span>${escapeHtml(consultation?.consultationId || consultation?.id || '-')}</span></div>
        <div class="info-item"><span class="info-label">Date</span><span>${escapeHtml(consultation?.date || '-')}</span></div>
        <div class="info-item"><span class="info-label">Patient</span><span>${escapeHtml(patient?.name || '-')}</span></div>
        <div class="info-item"><span class="info-label">Patient Phone</span><span>${escapeHtml(firstValue(patient?.phone, patient?.phoneNumber, patient?.mobile))}</span></div>
        <div class="info-item"><span class="info-label">Patient Email</span><span>${escapeHtml(firstValue(patient?.email))}</span></div>
        <div class="info-item"><span class="info-label">Patient Address</span><span>${escapeHtml(buildPatientAddress(patient))}</span></div>
        <div class="info-item"><span class="info-label">Practitioner</span><span>${escapeHtml(practitionerName)}</span></div>
        <div class="info-item"><span class="info-label">Title</span><span>${escapeHtml(firstValue(practitioner?.title))}</span></div>
        <div class="info-item"><span class="info-label">Organization</span><span>${escapeHtml(organization)}</span></div>
        <div class="info-item"><span class="info-label">Organization No.</span><span>${escapeHtml(organizationNumber)}</span></div>
        <div class="info-item"><span class="info-label">Practitioner Phone</span><span>${escapeHtml(firstValue(practitioner?.practitionerPhone, practitioner?.phone, practitioner?.phonenumber))}</span></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">收费项目 / Service Items</div>
      <table>
        <tr><th>Description / 收费项目</th><th>Qty / 数量</th><th>Unit Price / 单价</th><th>Amount / 金额</th></tr>
        ${chargeRows}
      </table>
    </div>

    <div class="section">
      <div class="section-title">Totals</div>
      <table>
        <tr><th>Field</th><th>Value</th></tr>
        <tr><td>Subtotal</td><td>${formatMoney(getSubtotal(consultation), currency)}</td></tr>
        <tr><td>${escapeHtml(hstLabel)}</td><td>${formatMoney(getTaxAmount(consultation), currency)}</td></tr>
        <tr><td>Total</td><td>${formatMoney(totalAmount, currency)}</td></tr>
        <tr><td>Paid Amount</td><td>${formatMoney(paidAmount, currency)}</td></tr>
        <tr><td>Balance Amount</td><td>${formatMoney(balanceAmount, currency)}</td></tr>
      </table>
    </div>

    ${signatureUrl ? `<div class="section"><div class="section-title">Practitioner Signature / 医师签名</div><img src="${escapeHtml(signatureUrl)}" alt="Practitioner signature" style="max-width:220px;max-height:82px;object-fit:contain" /></div>` : ''}

    <div class="section">
      <div class="section-title">Comments</div>
      <p>${escapeHtml(consultation?.comments || '-')}</p>
    </div>
  `

  openPrintWindow('Invoice', bodyHtml)
}

export function printPrescription(consultation, patient, practitioner, clinicName, prescriptionIndex = 0) {
  const clinic = clinicName || 'TCM Clinic'
  const prescriptions = Array.isArray(consultation?.prescriptions) ? consultation.prescriptions : []
  const rx = prescriptions[prescriptionIndex] || prescriptions[0] || {}
  const items = Array.isArray(rx.items) ? rx.items : []
  const itemRows = buildRows(
    items,
    (item) => {
      const dose = item.convertedQty != null
        ? `${item.convertedQty} ${item.convertedUnit || ''}`.trim()
        : `${item.dosage || item.quantity || '-'} ${item.unit || ''}`.trim()
      return `<tr>
        <td>${escapeHtml(item.herbName || item.name || '-')}</td>
        <td>${escapeHtml(dose || '-')}</td>
        <td>${escapeHtml(item.supplierName || item.supplier || '-')}</td>
        <td>${escapeHtml(item.notes || '-')}</td>
      </tr>`
    },
    'No prescription items recorded.',
    4,
  )
  const conclusions = Array.isArray(consultation?.diff?.conclusions) && consultation.diff.conclusions.length > 0
    ? consultation.diff.conclusions.map((item) => `${item.name || '-'}: ${item.treatment || '-'}`).join('; ')
    : '-'

  const bodyHtml = `
    <div class="header">
      <div>
        <h1>${escapeHtml(clinic)}</h1>
        <div class="subtitle">Traditional Chinese Medicine Prescription</div>
      </div>
      <div class="muted">Printed ${escapeHtml(new Date().toLocaleDateString())}</div>
    </div>

    <div class="section">
      <div class="info-grid">
        <div class="info-item"><span class="info-label">Patient</span><span>${escapeHtml(patient?.name || '-')}</span></div>
        <div class="info-item"><span class="info-label">Gender</span><span>${escapeHtml(patient?.gender || '-')}</span></div>
        <div class="info-item"><span class="info-label">Date</span><span>${escapeHtml(consultation?.date || '-')}</span></div>
        <div class="info-item"><span class="info-label">Consultation ID</span><span>${escapeHtml(consultation?.consultationId || consultation?.id || '-')}</span></div>
        <div class="info-item"><span class="info-label">Chief Complaint</span><span>${escapeHtml(consultation?.chiefComplaint || '-')}</span></div>
        <div class="info-item"><span class="info-label">Practitioner</span><span>${escapeHtml(practitioner?.name || '-')}</span></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Prescription</div>
      <div><strong>Formula Name:</strong> ${escapeHtml(rx.formulaName || 'Custom Formula')}</div>
      <div><strong>Type:</strong> ${escapeHtml(rx.prescriptionType || '-')}</div>
      <div><strong>Quantity:</strong> ${escapeHtml(rx.quantity || '-')}</div>
      <div><strong>Direction:</strong> ${escapeHtml(rx.direction || '-')}</div>
      <div><strong>Where To Get:</strong> ${escapeHtml(rx.whereToGet || '-')}</div>
      <table>
        <tr><th>Herb</th><th>Dose</th><th>Supplier</th><th>Notes</th></tr>
        ${itemRows}
      </table>
    </div>

    <div class="section">
      <div class="section-title">Differentiation Conclusions</div>
      <p>${escapeHtml(conclusions)}</p>
    </div>

    <div class="note">
      Issued by ${escapeHtml(clinic)} on ${escapeHtml(new Date().toLocaleDateString())}. Please follow the practitioner's instructions.
    </div>
  `

  openPrintWindow('Prescription', bodyHtml)
}
