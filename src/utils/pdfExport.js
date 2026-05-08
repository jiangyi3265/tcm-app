function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatMoney(value, currency = 'CAD') {
  return `${escapeHtml(currency)} ${Number(value || 0).toFixed(2)}`
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
    const displayVal = Array.isArray(value) ? value.join(', ') : value
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

  const bodyHtml = `
    <div class="header">
      <div>
        <h1>${escapeHtml(clinic)}</h1>
        <div class="subtitle">Consultation Report</div>
      </div>
      <div class="muted">Printed ${escapeHtml(new Date().toLocaleDateString())}</div>
    </div>

    <div class="section">
      <div class="section-title">Patient Summary</div>
      <div class="info-grid">
        <div class="info-item"><span class="info-label">Consultation ID</span><span>${escapeHtml(consultation?.consultationId || '-')}</span></div>
        <div class="info-item"><span class="info-label">Date</span><span>${escapeHtml(consultation?.date || '-')}</span></div>
        <div class="info-item"><span class="info-label">Patient</span><span>${escapeHtml(patient?.name || '-')}</span></div>
        <div class="info-item"><span class="info-label">Practitioner</span><span>${escapeHtml(practitioner?.name || '-')}</span></div>
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
      <div class="section-title">Acupuncture</div>
      <table>
        <tr><th>Point</th><th>Side</th><th>Notes</th></tr>
        ${acupunctureRows}
      </table>
    </div>

    ${buildPrescriptionTables(consultation?.prescriptions || [], currency)}

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
  const services = Array.isArray(consultation?.services) ? consultation.services : []
  const totalServiceAmount = getConsultationServiceTotal(consultation)
  const prescriptionAmount = getConsultationPrescriptionTotal(consultation)
  const serviceRows = buildRows(
    services,
    (service) => {
      const quantity = Number(service.quantity || 0)
      const price = Number(service.price || 0)
      const discount = Number(service.manualDiscount || 0)
      const extended = getServiceExtended(service)
      const taxableRate = service.taxable ? Number(taxRate || 0) : 0
      const tax = extended * taxableRate
      return `<tr>
        <td>${escapeHtml(service.name || '-')}</td>
        <td>${escapeHtml(String(quantity || '-'))}</td>
        <td>${formatMoney(price, currency)}</td>
        <td>${formatMoney(discount, currency)}</td>
        <td>${formatMoney(extended, currency)}</td>
        <td>${service.taxable ? 'Yes' : 'No'}</td>
        <td>${formatMoney(tax, currency)}</td>
      </tr>`
    },
    'No services recorded.',
    7,
  )

  const bodyHtml = `
    <div class="header">
      <div>
        <h1>${escapeHtml(clinic)}</h1>
        <div class="subtitle">Invoice</div>
      </div>
      <div class="muted">Printed ${escapeHtml(new Date().toLocaleDateString())}</div>
    </div>

    <div class="section">
      <div class="info-grid">
        <div class="info-item"><span class="info-label">Invoice ID</span><span>${escapeHtml(consultation?.consultationId || consultation?.id || '-')}</span></div>
        <div class="info-item"><span class="info-label">Date</span><span>${escapeHtml(consultation?.date || '-')}</span></div>
        <div class="info-item"><span class="info-label">Patient</span><span>${escapeHtml(patient?.name || '-')}</span></div>
        <div class="info-item"><span class="info-label">Patient Address</span><span>${escapeHtml([patient?.addressStreet, patient?.addressCity, patient?.addressState, patient?.addressPostal].filter(Boolean).join(', ') || patient?.address || '-')}</span></div>
        <div class="info-item"><span class="info-label">Practitioner</span><span>${escapeHtml(practitioner?.name || '-')}</span></div>
        <div class="info-item"><span class="info-label">Organization</span><span>${escapeHtml(practitioner?.regulatoryBody || '-')}</span></div>
        <div class="info-item"><span class="info-label">Organization No.</span><span>${escapeHtml(practitioner?.organizationNumber || practitioner?.registrationNumber || '-')}</span></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Services</div>
      <table>
        <tr><th>Service</th><th>Qty</th><th>Price</th><th>Discount</th><th>Extended</th><th>Taxable</th><th>Tax</th></tr>
        ${serviceRows}
      </table>
    </div>

    <div class="section">
      <div class="section-title">Prescriptions / Medicines</div>
      ${buildPrescriptionTables(consultation?.prescriptions || [], currency)}
    </div>

    <div class="section">
      <div class="section-title">Totals</div>
      <table>
        <tr><th>Field</th><th>Value</th></tr>
        <tr><td>Consultation Fee</td><td>${formatMoney(consultation?.consultationFee, currency)}</td></tr>
        <tr><td>Total Service</td><td>${formatMoney(totalServiceAmount, currency)}</td></tr>
        <tr><td>Prescription Amount</td><td>${formatMoney(prescriptionAmount, currency)}</td></tr>
        <tr><td>Total Without Tax</td><td>${formatMoney(consultation?.totalWithoutTax, currency)}</td></tr>
        <tr><td>Tax Amount</td><td>${formatMoney(consultation?.taxAmount, currency)}</td></tr>
        <tr><td>Grand Total</td><td>${formatMoney(consultation?.totalAmount, currency)}</td></tr>
      </table>
    </div>

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
