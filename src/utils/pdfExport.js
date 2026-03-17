/**
 * PDF 导出工具（客户端打印方式）
 * 打开新窗口渲染格式化 HTML，调用 window.print()（浏览器自带"另存为PDF"）
 */

function openPrintWindow(title, bodyHtml) {
  const win = window.open('', '_blank', 'width=800,height=900')
  if (!win) {
    alert('请允许弹出窗口以生成PDF')
    return
  }
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: "Microsoft YaHei", "SimSun", sans-serif; padding: 40px; color: #333; font-size: 14px; line-height: 1.6; }
    .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2d6a4f; padding-bottom: 15px; }
    .header h1 { font-size: 22px; color: #2d6a4f; margin-bottom: 5px; }
    .header .subtitle { font-size: 13px; color: #888; }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 15px; font-weight: 700; color: #1b4332; margin-bottom: 8px; border-left: 3px solid #2d6a4f; padding-left: 8px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .info-item { display: flex; gap: 8px; }
    .info-label { font-weight: 600; color: #555; min-width: 100px; }
    .info-value { color: #333; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; font-size: 13px; }
    th { background: #f5f5f5; font-weight: 600; }
    .total-section { text-align: right; margin-top: 15px; padding-top: 10px; border-top: 2px solid #333; }
    .total-row { display: flex; justify-content: flex-end; gap: 20px; margin-bottom: 4px; }
    .total-final { font-size: 18px; font-weight: 700; color: #1b4332; }
    .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #aaa; border-top: 1px solid #eee; padding-top: 10px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  ${bodyHtml}
  <div class="footer">
    此文档由中医诊所综合管理系统自动生成 · ${new Date().toLocaleDateString('zh-CN')}
  </div>
</body>
</html>`)
  win.document.close()
  setTimeout(() => win.print(), 500)
}

/**
 * 打印诊疗报告
 */
export function printConsultationReport(consultation, patient, practitioner, clinicName) {
  const diffItems = []
  const diff = consultation.diff || {}
  if (diff.coldHeat) diffItems.push(`寒热: ${diff.coldHeat}`)
  if (diff.sweat) diffItems.push(`汗: ${diff.sweat}`)
  if (diff.sleep) diffItems.push(`睡眠: ${diff.sleep}`)
  if (diff.appetite) diffItems.push(`胃口: ${diff.appetite}`)
  if (diff.thirst) diffItems.push(`口渴: ${diff.thirst}`)
  if (diff.bowelMovement) diffItems.push(`大便: ${diff.bowelMovement}`)
  if (diff.urine) diffItems.push(`小便: ${diff.urine}`)
  if (diff.pulse) diffItems.push(`脉: ${diff.pulse}`)
  if (diff.tongueColor) diffItems.push(`舌色: ${diff.tongueColor}`)
  if (diff.tongueBody) diffItems.push(`舌体: ${diff.tongueBody}`)
  if (diff.tongueCoating) diffItems.push(`舌苔: ${diff.tongueCoating}`)

  const acuHtml = consultation.acupuncture?.length > 0
    ? `<table><tr><th>穴位</th><th>侧</th><th>备注</th></tr>${consultation.acupuncture.map(a => `<tr><td>${a.point}</td><td>${a.side}</td><td>${a.notes || '-'}</td></tr>`).join('')}</table>`
    : '<p style="color:#aaa">无</p>'

  const rxHtml = consultation.prescriptions?.length > 0
    ? consultation.prescriptions.map(rx => `
      <p style="margin-top:8px"><strong>${rx.formulaName || '自拟方'}</strong> × ${rx.quantity}剂 (${rx.direction})</p>
      <table><tr><th>药材</th><th>剂量</th></tr>${(rx.items || []).map(i => `<tr><td>${i.name}</td><td>${i.dosage}${i.unit}</td></tr>`).join('')}</table>
    `).join('')
    : '<p style="color:#aaa">无处方</p>'

  const conclusionsHtml = (diff.conclusions || []).length > 0
    ? `<table><tr><th>辨证</th><th>治法</th></tr>${diff.conclusions.map(c => `<tr><td>${c.name}</td><td>${c.treatment}</td></tr>`).join('')}</table>`
    : ''

  const bodyHtml = `
    <div class="header">
      <h1>${clinicName || '中医诊所综合管理系统'}</h1>
      <div class="subtitle">诊疗报告 Consultation Report</div>
    </div>

    <div class="section">
      <div class="section-title">基本信息</div>
      <div class="info-grid">
        <div class="info-item"><span class="info-label">诊疗编号:</span><span class="info-value">${consultation.consultationId || '-'}</span></div>
        <div class="info-item"><span class="info-label">日期:</span><span class="info-value">${consultation.date}</span></div>
        <div class="info-item"><span class="info-label">病人:</span><span class="info-value">${patient?.name || '-'}</span></div>
        <div class="info-item"><span class="info-label">医师:</span><span class="info-value">${practitioner?.name || '-'}</span></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">主诉</div>
      <p><strong>${consultation.chiefComplaint || '-'}</strong> (${consultation.chiefComplaintDuration || '-'})</p>
      <p style="margin-top:6px">${consultation.chiefComplaintDescription || ''}</p>
      ${consultation.progressOfDisease ? `<p style="margin-top:6px"><em>病程: ${consultation.progressOfDisease}</em></p>` : ''}
    </div>

    <div class="section">
      <div class="section-title">辨证</div>
      <div style="margin-bottom:8px">${diffItems.join(' · ')}</div>
      ${conclusionsHtml}
      ${consultation.differentiation ? `<p style="margin-top:8px"><strong>辨证结论:</strong> ${consultation.differentiation}</p>` : ''}
    </div>

    <div class="section">
      <div class="section-title">针灸</div>
      ${acuHtml}
    </div>

    <div class="section">
      <div class="section-title">中药处方</div>
      ${rxHtml}
    </div>

    <div class="section">
      <div class="section-title">预后</div>
      <p>${consultation.prognosis || '未记录'}</p>
    </div>
  `

  openPrintWindow(`诊疗报告-${patient?.name || ''}`, bodyHtml)
}

/**
 * 打印发票
 */
export function printInvoice(consultation, patient, practitioner, clinicName, taxRate) {
  const servicesHtml = (consultation.services || []).length > 0
    ? `<table>
        <tr><th>服务项目</th><th>单价</th><th>数量</th><th>折扣</th><th>小计</th><th>含税</th><th>税额</th></tr>
        ${consultation.services.map(s => {
          const ext = (s.price || 0) * (s.quantity || 1) - (s.manualDiscount || 0)
          const tax = s.taxable ? ext * (taxRate || 0.13) : 0
          return `<tr>
            <td>${s.name}</td>
            <td>¥${Number(s.price || 0).toFixed(2)}</td>
            <td>${s.quantity || 1}</td>
            <td>¥${Number(s.manualDiscount || 0).toFixed(2)}</td>
            <td>¥${ext.toFixed(2)}</td>
            <td>${s.taxable ? '✓' : '-'}</td>
            <td>¥${tax.toFixed(2)}</td>
          </tr>`
        }).join('')}
      </table>`
    : '<p style="color:#aaa">无服务项目</p>'

  const bodyHtml = `
    <div class="header">
      <h1>${clinicName || '中医诊所综合管理系统'}</h1>
      <div class="subtitle">发票 Invoice</div>
    </div>

    <div class="section">
      <div class="info-grid">
        <div class="info-item"><span class="info-label">发票编号:</span><span class="info-value">${consultation.consultationId || consultation.id?.slice(-8).toUpperCase() || '-'}</span></div>
        <div class="info-item"><span class="info-label">日期:</span><span class="info-value">${consultation.date}</span></div>
        <div class="info-item"><span class="info-label">病人:</span><span class="info-value">${patient?.name || '-'}</span></div>
        <div class="info-item"><span class="info-label">医师:</span><span class="info-value">${practitioner?.name || '-'}</span></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">服务项目</div>
      ${servicesHtml}
    </div>

    <div class="total-section">
      <div class="total-row"><span>小计:</span><span>¥${((consultation.totalAmount || 0) - (consultation.taxAmount || 0)).toFixed(2)}</span></div>
      <div class="total-row"><span>税额 (${((taxRate || 0.13) * 100).toFixed(0)}%):</span><span>¥${(consultation.taxAmount || 0).toFixed(2)}</span></div>
      <div class="total-row total-final"><span>总计:</span><span>¥${(consultation.totalAmount || 0).toFixed(2)}</span></div>
    </div>

    <div class="section" style="margin-top:30px">
      <div class="info-item"><span class="info-label">付款状态:</span><span class="info-value" style="font-weight:700; color:${consultation.status === 'paid' ? '#2d6a4f' : '#e9a000'}">${consultation.status === 'paid' ? '已付款' : '待付款'}</span></div>
    </div>
  `

  openPrintWindow(`发票-${patient?.name || ''}`, bodyHtml)
}

/**
 * 打印处方笺（独立处方）
 */
export function printPrescription(consultation, patient, practitioner, clinicName, prescriptionIndex = 0) {
  const rx = consultation.prescriptions?.[prescriptionIndex]
  if (!rx) {
    alert('未找到处方')
    return
  }

  const herbRows = (rx.items || []).map((item, idx) => `
    <tr>
      <td style="text-align:center">${idx + 1}</td>
      <td style="font-weight:600">${item.name}</td>
      <td style="text-align:center">${item.dosage}${item.unit}</td>
      <td>${item.notes || ''}</td>
    </tr>
  `).join('')

  const diffConclusions = (consultation.diff?.conclusions || []).map(c => c.name).join('，')

  const win = window.open('', '_blank', 'width=800,height=1000')
  if (!win) { alert('请允许弹出窗口'); return }
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>处方笺-${patient?.name || ''}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:"SimSun","Microsoft YaHei",serif; padding:30px 40px; color:#333; font-size:14px; line-height:1.7; }
    .rx-header { text-align:center; border-bottom:3px double #b22222; padding-bottom:12px; margin-bottom:16px; }
    .rx-header h1 { font-size:24px; color:#b22222; letter-spacing:4px; margin-bottom:4px; }
    .rx-header .rx-label { font-size:18px; color:#333; letter-spacing:8px; font-weight:700; margin-top:4px; }
    .rx-header .clinic-info { font-size:12px; color:#888; margin-top:4px; }
    .patient-info { display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px 20px; margin-bottom:14px; padding-bottom:10px; border-bottom:1px solid #ccc; font-size:13px; }
    .patient-info .pi-item { display:flex; }
    .patient-info .pi-label { font-weight:700; white-space:nowrap; margin-right:6px; }
    .rx-body { margin-bottom:14px; min-height:200px; }
    .rx-body .rx-title { font-size:14px; font-weight:700; margin-bottom:8px; color:#b22222; }
    table { width:100%; border-collapse:collapse; }
    th,td { border:1px solid #999; padding:5px 10px; font-size:13px; }
    th { background:#f5f0ef; font-weight:700; color:#333; }
    .rx-footer { margin-top:16px; padding-top:12px; border-top:1px solid #ccc; }
    .rx-footer-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:13px; }
    .rx-footer-item { display:flex; gap:6px; }
    .rx-footer-item .fl { font-weight:700; }
    .signature-area { margin-top:30px; display:flex; justify-content:space-between; font-size:13px; }
    .signature-area .sig-block { display:flex; flex-direction:column; align-items:center; gap:4px; }
    .sig-line { width:140px; border-bottom:1px solid #333; height:30px; }
    .rx-note { margin-top:14px; font-size:11px; color:#aaa; text-align:center; padding-top:8px; border-top:1px dashed #ddd; }
    @media print { body { padding:20px 30px; } }
  </style>
</head>
<body>
  <div class="rx-header">
    <h1>${clinicName || '中医诊所'}</h1>
    <div class="rx-label">处 方 笺</div>
    <div class="clinic-info">Traditional Chinese Medicine Prescription</div>
  </div>

  <div class="patient-info">
    <div class="pi-item"><span class="pi-label">姓名：</span>${patient?.name || '-'}</div>
    <div class="pi-item"><span class="pi-label">性别：</span>${patient?.gender === 'male' ? '男' : patient?.gender === 'female' ? '女' : '-'}</div>
    <div class="pi-item"><span class="pi-label">年龄：</span>${patient?.dateOfBirth ? Math.floor((new Date() - new Date(patient.dateOfBirth)) / 31557600000) + '岁' : '-'}</div>
    <div class="pi-item"><span class="pi-label">日期：</span>${consultation.date || '-'}</div>
    <div class="pi-item"><span class="pi-label">编号：</span>${consultation.consultationId || consultation.id?.slice(-8).toUpperCase() || '-'}</div>
    <div class="pi-item"><span class="pi-label">主诉：</span>${consultation.chiefComplaint || '-'}</div>
  </div>

  ${diffConclusions ? `<div style="margin-bottom:10px;font-size:13px"><strong>辨证：</strong>${diffConclusions}</div>` : ''}

  <div class="rx-body">
    <div class="rx-title">Rp. ${rx.formulaName || '自拟方'}</div>
    <table>
      <tr><th width="40">序</th><th>药名</th><th width="80">剂量</th><th width="120">备注</th></tr>
      ${herbRows}
    </table>
  </div>

  <div class="rx-footer">
    <div class="rx-footer-grid">
      <div class="rx-footer-item"><span class="fl">剂数：</span>${rx.quantity || 1} 剂</div>
      <div class="rx-footer-item"><span class="fl">处方类型：</span>${rx.prescriptionType === 'raw_herbs' ? '草药' : rx.prescriptionType === 'powder' ? '粉剂' : rx.prescriptionType === 'pills' ? '成药' : '其他'}</div>
      <div class="rx-footer-item"><span class="fl">用法：</span>${rx.direction || '-'}</div>
      <div class="rx-footer-item"><span class="fl">取药处：</span>${rx.whereToGet || '-'}</div>
    </div>
  </div>

  <div class="signature-area">
    <div class="sig-block">
      <div>医师签名</div>
      <div class="sig-line"></div>
      <div style="font-size:12px;color:#888">${practitioner?.name || ''}</div>
    </div>
    <div class="sig-block">
      <div>药师签名</div>
      <div class="sig-line"></div>
    </div>
    <div class="sig-block">
      <div>调剂签名</div>
      <div class="sig-line"></div>
    </div>
  </div>

  <div class="rx-note">
    此处方由 ${clinicName || '中医诊所'} 开具 · ${new Date().toLocaleDateString('zh-CN')} · 请遵医嘱服用
  </div>
</body>
</html>`)
  win.document.close()
  setTimeout(() => win.print(), 500)
}
