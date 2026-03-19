// ============================================================
// TCM 中医辨证选项（对应文档 Differentiation 标签各字段）
// ============================================================
export const TCM_OPTIONS = {
  coldHeat: ['Aversion to Cold 恶寒', 'Fever 发热', 'Aversion to Heat 恶热', 'Alternating 寒热往来', 'Low-grade Fever 低热', 'Neither 无'],
  sweat: ['Normal 正常', 'No sweat 无汗', 'Spontaneous sweating 自汗', 'Night sweats 盗汗', 'Excessive sweating 多汗'],
  taste: ['Normal 正常', 'Bitter 口苦', 'Sweet 口甜', 'Sour 口酸', 'Salty 口咸', 'Bland 口淡', 'Sticky 口腻'],
  chest: ['Normal 正常', 'Tightness 胸闷', 'Pain 胸痛', 'Fullness 胸满', 'Stuffiness 痞满'],
  heart: ['Normal 正常', 'Palpitation 心悸', 'Racing heart 心跳加速', 'Irregular heartbeat 心律不齐'],
  hypochondriac: ['None 无', 'Distension 胀', 'Pain 痛', 'Fullness 满'],
  sleep: ['Normal 正常', 'Insomnia 失眠', 'Excessive sleep 嗜睡', 'Dream-disturbed 多梦', 'Difficulty falling asleep 难入睡', 'Early waking 早醒'],
  appetite: ['Normal 正常', 'Poor appetit 食欲不振', 'Increased appetite 食欲亢进', 'No desire to eat 不思食', 'Hungry but no desire to eat 饥不欲食'],
  thirst: ['Normal 正常', 'Dry mouth 口干', 'Thirsty 口渴', 'No thirst 不渴', 'Thirsty no desire to drink 渴不欲饮'],
  abdomen: ['Normal 正常', 'Bloating 腹胀', 'Pain 腹痛', 'Distension 胀满', 'Hardness 腹硬'],
  bowelMovement: ['Normal 正常', 'Loose 便溏', 'Dry/Constipated 便秘', 'Alternating 交替', 'Undigested food 完谷不化'],
  urine: ['Normal 正常', 'Frequent 尿频', 'Scanty 尿少', 'Dark yellow 黄赤', 'Clear and copious 清长', 'Cloudy 混浊'],
  tongueColor: ['Normal pink 淡红', 'Pale 淡白', 'Red 红', 'Deep red 绛', 'Purple 紫', 'Dark purple 暗紫'],
  tongueBody: ['Normal 正常', 'Swollen 胖大', 'Thin 瘦薄', 'Cracked 裂纹', 'Stiff 强硬', 'Trembling 颤动', 'Deviated 歪斜'],
  tongueCoating: ['Thin white 薄白', 'Thick white 厚白', 'Thin yellow 薄黄', 'Thick yellow 厚黄', 'Dry 干燥', 'Greasy 腻', 'Peeled 剥脱', 'No coating 无苔'],
  pulse: ['Floating 浮', 'Sinking 沉', 'Slow 迟', 'Rapid 数', 'Wiry 弦', 'Slippery 滑', 'Rough 涩', 'Thready 细', 'Tight 紧', 'Soft 软', 'Weak 弱', 'Excess 实', 'Faint 微'],
  chiefComplaintDuration: ['< 7 days 一周内', '1-4 weeks 一个月内', '1-3 months 三个月内', '3-6 months 半年内', '6-12 months 一年内', '> 1 year 一年以上', '> 5 years 五年以上'],
  direction: ['内服 Oral intake', '外用 Topical', '足浴 Foot bath', '熏蒸 Steam', '灌肠 Enema'],
  whereToGet: ['In-store 店内取药', 'External 外部购买', 'Mail 邮寄'],
  preferredContact: ['Any', 'Email', 'Phone', 'Mobile Phone', 'Fax'],
}

export const CHIEF_COMPLAINTS = [
  'Fatigue 疲劳', 'Insomnia 失眠', 'Headache 头痛', 'Back Pain 背痛',
  'Neck Pain 颈痛', 'Shoulder Pain 肩痛', 'Knee Pain 膝痛',
  'Anxiety 焦虑', 'Depression 抑郁', 'Digestive Issues 消化问题',
  'Common cold 感冒', 'Cough 咳嗽', 'Bloating 腹胀', 'Constipation 便秘',
  'Diarrhea 腹泻', 'Menstrual Issues 月经问题', 'Sore throat 咽痛',
  'Skin Issues 皮肤问题', 'Fertility 不孕不育', 'Maintenance 维护保健',
]

export const HERB_CATEGORIES = [
  '1. 辛温解表药', '2. 辛凉解表药', '3. 清热泻火药', '4. 清热燥湿药',
  '5. 清热解毒药', '6. 清热凉血药', '7. 清虚热药', '8. 泻下药',
  '10. 祛风湿散寒药', '11. 祛风湿清热药', '12. 祛风湿强筋骨药',
  '13. 祛风湿药', '14. 化湿药', '15. 利水渗湿药', '16. 利尿通淋药',
  '20. 理气药', '21. 消食药', '22. 驱虫药',
  '24. 活血止痛药', '25. 活血调经药', '26. 活血疗伤药', '27. 破血消癥药',
  '28. 温里药', '29. 化痰止咳平喘药', '30. 化痰药',
  '32. 安神药', '33. 重镇安神药', '34. 养心安神药',
  '35. 平肝熄风药', '36. 平抑肝阳药', '37. 息风止痉药',
  '38. 补气药', '39. 补阳药', '40. 补血药', '41. 补阴药',
  '42. 收涩药', '43. 固表止汗药', '44. 敛肺涩肠药', '45. 固精缩尿止带药',
  '46. 止血药', '47. 凉血止血药', '48. 化瘀止血药', '49. 收敛止血药',
]

export const HERB_NATURES = ['1. 大寒', '2. 寒', '3. 微寒', '4. 平', '5. 微温', '6. 温', '7. 热', '8. 大热']
export const HERB_TASTES = ['Bitter苦', 'Sweet甜', 'Acrid辛', 'Sour酸', 'Salty咸', 'Bland淡', 'Astringent涩']
export const HERB_CHANNELS = ['肺', '肝', '脾', '胃', '肾', '心', '心包', '小肠', '大肠', '膀胱', '胆', '三焦']

// 空的辨证数据结构
export function emptyDiff() {
  return {
    coldHeat: '', sweat: '', headDiscomfort: '', eye: '', ear: '', nose: '', mouth: '', taste: '', bodyDiscomforts: '', skinIssues: '', otherExterior: '',
    chest: '', heart: '', hypochondriac: '', sleep: '', anxietyStress: '', otherChest: '',
    appetite: '', thirst: '', abdomen: '', otherAbdomen: '',
    bowelMovement: '', urine: '', otherLowerAbdomen: '',
    periodCircle: '', periodDuration: '', bloodQuality: '', pms: '', otherFemale: '',
    pathologicalChannel: '', pathologicalChanges: '', pulse: '', detailedPulse: '',
    tongueColor: '', tongueBody: '', tongueCoating: '', otherTongue: '', tongueImage: null,
    conclusions: [],
  }
}

// 演示用账户
export const DEMO_USERS = [
  {
    id: 'user-admin-1',
    name: '张管理',
    email: 'admin@clinic.com',
    password: 'admin123',
    role: 'admin',
    phone: '13800000001',
    createdAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'user-doctor-1',
    name: '李医师',
    email: 'doctor@clinic.com',
    password: 'admin123',
    role: 'practitioner',
    phone: '13800000002',
    createdAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'user-doctor-2',
    name: '王医师',
    email: 'doctor2@clinic.com',
    password: 'admin123',
    role: 'practitioner',
    phone: '13800000005',
    createdAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'user-apprentice-1',
    name: '陈学徒',
    email: 'apprentice@clinic.com',
    password: 'admin123',
    role: 'apprentice',
    phone: '13800000003',
    assignedTo: 'user-doctor-1',
    createdAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'user-pharmacist-1',
    name: '刘药师',
    email: 'pharmacist@clinic.com',
    password: 'admin123',
    role: 'pharmacist',
    phone: '13800000004',
    createdAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'user-cashier-1',
    name: '赵收银',
    email: 'cashier@clinic.com',
    password: 'admin123',
    role: 'cashier',
    phone: '13800000006',
    createdAt: '2024-01-01T00:00:00.000Z',
  },
]

// 演示病人数据
export const DEMO_PATIENTS = [
  {
    id: 'patient-1',
    name: '张三',
    firstName: '三', lastName: '张', middleName: '',
    jobTitle: '', accountName: '',
    emails: ['zhangsan@example.com'],
    email2: '', email3: '',
    phone: '13900001111',
    mobilePhone: '13900001111', businessPhone: '', fax: '',
    preferredContact: 'Any',
    dateOfBirth: '1985-06-15',
    gender: '男',
    address: '北京市朝阳区',
    addressStreet: '朝阳路802号', addressCity: '北京', addressState: '北京市', addressPostal: '100020',
    diseaseName: '慢性疲劳综合征',
    historyAndMedication: '对花粉过敏，既往无重大手术史',
    createdAt: '2024-02-01T08:00:00.000Z',
    isActive: true,
    mergedInto: null,
    consentSigned: true,
    consentSignedAt: '2024-02-01T08:30:00.000Z',
    notes: '对花粉过敏',
    practitionerId: 'user-doctor-1',
  },
  {
    id: 'patient-2',
    name: '李四',
    firstName: '四', lastName: '李', middleName: '',
    jobTitle: '', accountName: '',
    emails: ['lisi@example.com', 'lisi_work@example.com'],
    email2: 'lisi_work@example.com', email3: '',
    phone: '13900002222',
    mobilePhone: '13900002222', businessPhone: '', fax: '',
    preferredContact: 'Email',
    dateOfBirth: '1990-11-20',
    gender: '女',
    address: '北京市海淀区',
    addressStreet: '海淀路15号', addressCity: '北京', addressState: '北京市', addressPostal: '100080',
    diseaseName: '失眠症，月经不调',
    historyAndMedication: '无药物过敏史',
    createdAt: '2024-02-10T09:00:00.000Z',
    isActive: true,
    mergedInto: null,
    consentSigned: true,
    consentSignedAt: '2024-02-10T09:15:00.000Z',
    notes: '',
    practitionerId: 'user-doctor-1',
  },
  {
    id: 'patient-3',
    name: '王五',
    firstName: '五', lastName: '王', middleName: '',
    jobTitle: '', accountName: '',
    emails: ['wangwu@example.com'],
    email2: '', email3: '',
    phone: '13900003333',
    mobilePhone: '13900003333', businessPhone: '01088881234', fax: '',
    preferredContact: 'Phone',
    dateOfBirth: '1978-03-08',
    gender: '男',
    address: '北京市西城区',
    addressStreet: '西长安街1号', addressCity: '北京', addressState: '北京市', addressPostal: '100032',
    diseaseName: '高血压，颈椎病',
    historyAndMedication: '高血压病史10年，服用降压药',
    createdAt: '2024-03-01T10:00:00.000Z',
    isActive: true,
    mergedInto: null,
    consentSigned: false,
    consentSignedAt: null,
    notes: '高血压病史',
    practitionerId: 'user-doctor-2',
  },
]

// 演示诊疗记录
export const DEMO_CONSULTATIONS = [
  {
    id: 'consult-1',
    consultationId: 'ORD-00001-A1B2C3',
    patientId: 'patient-1',
    practitionerId: 'user-doctor-1',
    parentConsultationId: null,
    date: '2024-02-01',
    status: 'paid',
    // Summary
    chiefComplaint: 'Fatigue 疲劳',
    chiefComplaintDuration: '1-4 weeks 一个月内',
    chiefComplaintDescription: '患者主诉头痛、失眠，持续两周，伴有疲劳乏力，工作压力较大。',
    progressOfDisease: '症状逐渐加重，夜间尤为明显。',
    // Legacy fields
    summary: '患者主诉头痛、失眠，持续两周，伴有疲劳乏力。',
    differentiation: '肝郁气滞，心神不宁',
    treatment: '疏肝解郁，养心安神。针灸配合中药汤剂。',
    // Differentiation
    diff: {
      coldHeat: 'Neither 无', sweat: 'Normal 正常', headDiscomfort: '头痛，两侧为主', eye: '', ear: '', nose: '', mouth: '', taste: 'Bitter 口苦',
      bodyDiscomforts: '肩颈僵硬', skinIssues: '', otherExterior: '',
      chest: 'Tightness 胸闷', heart: 'Palpitation 心悸', hypochondriac: 'Distension 胀', sleep: 'Insomnia 失眠', anxietyStress: '工作压力大，容易烦躁', otherChest: '',
      appetite: 'Poor appetit 食欲不振', thirst: 'Dry mouth 口干', abdomen: 'Bloating 腹胀', otherAbdomen: '',
      bowelMovement: 'Normal 正常', urine: 'Normal 正常', otherLowerAbdomen: '',
      periodCircle: '', periodDuration: '', bloodQuality: '', pms: '', otherFemale: '',
      pathologicalChannel: '肝经，心经', pathologicalChanges: '肝区压痛，太冲穴有明显酸胀感', pulse: 'Wiry 弦', detailedPulse: '弦细，左关尤甚',
      tongueColor: 'Red 红', tongueBody: 'Normal 正常', tongueCoating: 'Thin yellow 薄黄', otherTongue: '舌尖红', tongueImage: null,
      conclusions: [{ name: '肝郁气滞', treatment: '疏肝理气' }, { name: '心神不宁', treatment: '养心安神' }],
    },
    // Treatments
    acupuncture: [
      { point: '百会', side: 'bilateral', notes: '留针20分钟' },
      { point: '神门', side: 'bilateral', notes: '' },
      { point: '太冲', side: 'bilateral', notes: '' },
      { point: '合谷', side: 'left', notes: '' },
    ],
    prescriptions: [{
      id: 'rx-1', direction: '内服 Oral intake', whereToGet: 'In-store 店内取药',
      quantity: 7, preferredUnit: 'g', formulaName: '逍遥散加减',
      items: [
        { name: '柴胡', dosage: 10, unit: 'g', category: '1. 辛温解表药', guijing: '肝, 胆', nature: '3. 微寒', taste: 'Acrid辛, Bitter苦', pricePerUnit: 0.15 },
        { name: '白芍', dosage: 15, unit: 'g', category: '40. 补血药', guijing: '肝, 脾', nature: '3. 微寒', taste: 'Bitter苦, Sour酸', pricePerUnit: 0.12 },
        { name: '当归', dosage: 10, unit: 'g', category: '40. 补血药', guijing: '肝, 心, 脾', nature: '6. 温', taste: 'Sweet甜, Acrid辛', pricePerUnit: 0.20 },
        { name: '茯苓', dosage: 15, unit: 'g', category: '15. 利水渗湿药', guijing: '脾, 心, 肺', nature: '4. 平', taste: 'Sweet甜, Bland淡', pricePerUnit: 0.09 },
        { name: '白术', dosage: 10, unit: 'g', category: '38. 补气药', guijing: '脾, 胃', nature: '6. 温', taste: 'Bitter苦, Sweet甜', pricePerUnit: 0.10 },
        { name: '甘草', dosage: 6, unit: 'g', category: '38. 补气药', guijing: '脾, 肺', nature: '4. 平', taste: 'Sweet甜', pricePerUnit: 0.06 },
      ],
      subtotal: 14.94, dispensingCompleted: true,
    }],
    herbals: [
      { name: '柴胡', dosage: 10, unit: 'g' }, { name: '白芍', dosage: 15, unit: 'g' },
      { name: '当归', dosage: 10, unit: 'g' }, { name: '茯苓', dosage: 15, unit: 'g' },
      { name: '白术', dosage: 10, unit: 'g' }, { name: '甘草', dosage: 6, unit: 'g' },
    ],
    formulaName: '逍遥散加减',
    prescriptionType: 'raw_herbs',
    prognosis: '预计1-2周后头痛改善，睡眠逐步好转，建议复诊。',
    feedback: '',
    previousPrognosisReview: null,
    // Pricing
    servicePriceList: '2024-02',
    services: [
      { name: '针灸首诊 Basic Acupuncture 60min', price: 120, quantity: 1, manualDiscount: 0, taxable: true },
      { name: '中药处方（7剂）', price: 280, quantity: 1, manualDiscount: 0, taxable: true },
    ],
    consultationFee: 0, discountType: 'none', discountValue: 0,
    taxable: true, includeRxAmount: false, add3rdParty: false,
    currency: 'CAD', comments: '',
    totalAmount: 400, taxAmount: 52, totalWithoutTax: 400,
    documents: [],
    invoicePdfUrl: null, consultationPdfUrl: null,
    version: 1, modifications: [],
    lockedAt: '2024-02-01T16:00:00.000Z',
    branchId: 'branch-main',
    createdAt: '2024-02-01T14:00:00.000Z',
  },
  {
    id: 'consult-2',
    consultationId: 'ORD-00002-D4E5F6',
    patientId: 'patient-1',
    practitionerId: 'user-doctor-1',
    parentConsultationId: 'consult-1',
    date: '2024-02-15',
    status: 'paid',
    chiefComplaint: 'Fatigue 疲劳',
    chiefComplaintDuration: '1-4 weeks 一个月内',
    chiefComplaintDescription: '复诊。头痛明显改善，睡眠好转约60%，仍感乏力。',
    progressOfDisease: '整体好转，乏力症状为主要问题。',
    summary: '复诊。头痛明显改善，睡眠好转约60%，仍感乏力。',
    differentiation: '气血两虚为主，肝郁已解',
    treatment: '补气养血为主，继续针灸治疗。',
    diff: {
      coldHeat: 'Neither 无', sweat: 'Spontaneous sweating 自汗', headDiscomfort: '偶有轻微头痛', eye: '', ear: '', nose: '', mouth: '', taste: 'Normal 正常',
      bodyDiscomforts: '全身乏力', skinIssues: '', otherExterior: '',
      chest: 'Normal 正常', heart: 'Normal 正常', hypochondriac: 'None 无', sleep: 'Dream-disturbed 多梦', anxietyStress: '', otherChest: '',
      appetite: 'Poor appetit 食欲不振', thirst: 'Normal 正常', abdomen: 'Normal 正常', otherAbdomen: '',
      bowelMovement: 'Loose 便溏', urine: 'Normal 正常', otherLowerAbdomen: '',
      periodCircle: '', periodDuration: '', bloodQuality: '', pms: '', otherFemale: '',
      pathologicalChannel: '脾经，胃经', pathologicalChanges: '腹部压痛减轻', pulse: 'Thready 细', detailedPulse: '细弱',
      tongueColor: 'Pale 淡白', tongueBody: 'Swollen 胖大', tongueCoating: 'Thin white 薄白', otherTongue: '舌边有齿痕', tongueImage: null,
      conclusions: [{ name: '气血两虚', treatment: '补气养血' }, { name: '脾虚湿困', treatment: '健脾祛湿' }],
    },
    acupuncture: [
      { point: '气海', side: 'bilateral', notes: '' },
      { point: '足三里', side: 'bilateral', notes: '补法' },
      { point: '三阴交', side: 'bilateral', notes: '' },
    ],
    prescriptions: [{
      id: 'rx-2', direction: '内服 Oral intake', whereToGet: 'In-store 店内取药',
      quantity: 7, preferredUnit: 'g', formulaName: '八珍汤加减',
      items: [
        { name: '黄芪', dosage: 30, unit: 'g', category: '38. 补气药', guijing: '肺, 脾', nature: '6. 温', taste: 'Sweet甜', pricePerUnit: 0.08 },
        { name: '党参', dosage: 15, unit: 'g', category: '38. 补气药', guijing: '脾, 肺', nature: '4. 平', taste: 'Sweet甜', pricePerUnit: 0.12 },
        { name: '白术', dosage: 10, unit: 'g', category: '38. 补气药', guijing: '脾, 胃', nature: '6. 温', taste: 'Bitter苦, Sweet甜', pricePerUnit: 0.10 },
        { name: '当归', dosage: 10, unit: 'g', category: '40. 补血药', guijing: '肝, 心, 脾', nature: '6. 温', taste: 'Sweet甜, Acrid辛', pricePerUnit: 0.20 },
        { name: '熟地黄', dosage: 15, unit: 'g', category: '40. 补血药', guijing: '肝, 肾', nature: '3. 微寒', taste: 'Sweet甜', pricePerUnit: 0.14 },
        { name: '甘草', dosage: 6, unit: 'g', category: '38. 补气药', guijing: '脾, 肺', nature: '4. 平', taste: 'Sweet甜', pricePerUnit: 0.06 },
      ],
      subtotal: 18.62, dispensingCompleted: true,
    }],
    herbals: [
      { name: '黄芪', dosage: 30, unit: 'g' }, { name: '党参', dosage: 15, unit: 'g' },
      { name: '白术', dosage: 10, unit: 'g' }, { name: '当归', dosage: 10, unit: 'g' },
      { name: '熟地黄', dosage: 15, unit: 'g' }, { name: '甘草', dosage: 6, unit: 'g' },
    ],
    formulaName: '八珍汤加减',
    prescriptionType: 'raw_herbs',
    prognosis: '再坚持两周，乏力症状可显著改善。',
    feedback: '',
    previousPrognosisReview: '上次预测头痛会改善——准确，睡眠改善比预期稍慢。',
    servicePriceList: '2024-02',
    services: [
      { name: '针灸复诊 Supercare Acupuncture 30min', price: 80, quantity: 1, manualDiscount: 0, taxable: true },
      { name: '中药处方（7剂）', price: 280, quantity: 1, manualDiscount: 0, taxable: true },
    ],
    consultationFee: 0, discountType: 'none', discountValue: 0,
    taxable: true, includeRxAmount: false, add3rdParty: false,
    currency: 'CAD', comments: '',
    totalAmount: 360, taxAmount: 46.8, totalWithoutTax: 360,
    documents: [],
    invoicePdfUrl: null, consultationPdfUrl: null,
    version: 1, modifications: [],
    lockedAt: '2024-02-15T16:00:00.000Z',
    branchId: 'branch-main',
    createdAt: '2024-02-15T14:30:00.000Z',
  },
]

// 演示预约数据
export const DEMO_APPOINTMENTS = [
  {
    id: 'appt-1',
    patientId: 'patient-1',
    practitionerId: 'user-doctor-1',
    roomId: 'room-1',
    serviceType: 'acupuncture_followup',
    startTime: new Date(new Date().setHours(9, 0, 0, 0)).toISOString(),
    endTime: new Date(new Date().setHours(9, 50, 0, 0)).toISOString(),
    status: 'confirmed',
    intakeFormData: { chiefComplaint: '乏力改善，但仍有轻微头痛' },
    notes: '',
    branchId: 'branch-main',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'appt-2',
    patientId: 'patient-2',
    practitionerId: 'user-doctor-1',
    roomId: 'room-2',
    serviceType: 'acupuncture_new',
    startTime: new Date(new Date().setHours(10, 30, 0, 0)).toISOString(),
    endTime: new Date(new Date().setHours(11, 30, 0, 0)).toISOString(),
    status: 'booked',
    intakeFormData: {},
    notes: '初次就诊',
    branchId: 'branch-main',
    createdAt: new Date().toISOString(),
  },
]

// 演示库存数据（supplierId 与后端 v3 SQL 保持一致: supplier-1=同仁堂, supplier-2=康仁堂, supplier-3=本草药材, supplier-4=华佗）
export const DEMO_INVENTORY = [
  // 粉剂
  { id: 'inv-1', name: '逍遥散', category: 'powder', unit: '包', quantity: 50, pricePerUnit: 35, supplier: '同仁堂', supplierId: 'supplier-1', gramsPerPacket: 6, minStockLevel: 10, isActive: true },
  { id: 'inv-2', name: '六味地黄丸（浓缩粉）', category: 'powder', unit: '包', quantity: 8, pricePerUnit: 40, supplier: '同仁堂', supplierId: 'supplier-1', gramsPerPacket: 6, minStockLevel: 10, isActive: true },
  { id: 'inv-3', name: '补中益气汤', category: 'powder', unit: '包', quantity: 30, pricePerUnit: 38, supplier: '康仁堂', supplierId: 'supplier-2', gramsPerPacket: 5, minStockLevel: 10, isActive: true },
  // 草药
  { id: 'inv-4', name: '黄芪', category: 'raw_herbs', unit: 'g', quantity: 2000, pricePerUnit: 0.08, supplier: '本草药材', supplierId: 'supplier-3', gramsPerPacket: null, minStockLevel: 500, isActive: true },
  { id: 'inv-5', name: '党参', category: 'raw_herbs', unit: 'g', quantity: 1500, pricePerUnit: 0.12, supplier: '本草药材', supplierId: 'supplier-3', gramsPerPacket: null, minStockLevel: 300, isActive: true },
  { id: 'inv-6', name: '白术', category: 'raw_herbs', unit: 'g', quantity: 800, pricePerUnit: 0.10, supplier: '本草药材', supplierId: 'supplier-3', gramsPerPacket: null, minStockLevel: 200, isActive: true },
  { id: 'inv-7', name: '茯苓', category: 'raw_herbs', unit: 'g', quantity: 1200, pricePerUnit: 0.09, supplier: '本草药材', supplierId: 'supplier-3', gramsPerPacket: null, minStockLevel: 300, isActive: true },
  { id: 'inv-8', name: '柴胡', category: 'raw_herbs', unit: 'g', quantity: 150, pricePerUnit: 0.15, supplier: '本草药材', supplierId: 'supplier-3', gramsPerPacket: null, minStockLevel: 200, isActive: true },
  { id: 'inv-9', name: '当归', category: 'raw_herbs', unit: 'g', quantity: 900, pricePerUnit: 0.20, supplier: '本草药材', supplierId: 'supplier-3', gramsPerPacket: null, minStockLevel: 200, isActive: true },
  { id: 'inv-10', name: '甘草', category: 'raw_herbs', unit: 'g', quantity: 1800, pricePerUnit: 0.06, supplier: '本草药材', supplierId: 'supplier-3', gramsPerPacket: null, minStockLevel: 300, isActive: true },
  // 草药 - 人参（多供应商）
  { id: 'inv-14', name: '人参', category: 'raw_herbs', unit: 'g', quantity: 500, pricePerUnit: 0.80, supplier: '本草药材', supplierId: 'supplier-3', gramsPerPacket: null, minStockLevel: 100, isActive: true },
  { id: 'inv-15', name: '人参', category: 'raw_herbs', unit: 'g', quantity: 300, pricePerUnit: 1.20, supplier: '同仁堂', supplierId: 'supplier-1', gramsPerPacket: null, minStockLevel: 100, isActive: true },
  // 草药 - 麦冬（多供应商）
  { id: 'inv-16', name: '麦冬', category: 'raw_herbs', unit: 'g', quantity: 1200, pricePerUnit: 0.15, supplier: '本草药材', supplierId: 'supplier-3', gramsPerPacket: null, minStockLevel: 200, isActive: true },
  { id: 'inv-17', name: '麦冬', category: 'raw_herbs', unit: 'g', quantity: 600, pricePerUnit: 0.18, supplier: '康仁堂', supplierId: 'supplier-2', gramsPerPacket: null, minStockLevel: 200, isActive: true },
  // 草药 - 五味子（多供应商）
  { id: 'inv-18', name: '五味子', category: 'raw_herbs', unit: 'g', quantity: 800, pricePerUnit: 0.25, supplier: '本草药材', supplierId: 'supplier-3', gramsPerPacket: null, minStockLevel: 150, isActive: true },
  { id: 'inv-19', name: '五味子', category: 'raw_herbs', unit: 'g', quantity: 400, pricePerUnit: 0.30, supplier: '华佗', supplierId: 'supplier-4', gramsPerPacket: null, minStockLevel: 100, isActive: true },
  // 草药 - 其他常用药
  { id: 'inv-20', name: '白芍', category: 'raw_herbs', unit: 'g', quantity: 1000, pricePerUnit: 0.12, supplier: '本草药材', supplierId: 'supplier-3', gramsPerPacket: null, minStockLevel: 200, isActive: true },
  { id: 'inv-21', name: '熟地黄', category: 'raw_herbs', unit: 'g', quantity: 600, pricePerUnit: 0.14, supplier: '本草药材', supplierId: 'supplier-3', gramsPerPacket: null, minStockLevel: 200, isActive: true },
  { id: 'inv-22', name: '黄芩', category: 'raw_herbs', unit: 'g', quantity: 700, pricePerUnit: 0.10, supplier: '本草药材', supplierId: 'supplier-3', gramsPerPacket: null, minStockLevel: 150, isActive: true },
  { id: 'inv-23', name: '山药', category: 'raw_herbs', unit: 'g', quantity: 900, pricePerUnit: 0.08, supplier: '本草药材', supplierId: 'supplier-3', gramsPerPacket: null, minStockLevel: 200, isActive: true },
  { id: 'inv-24', name: '陈皮', category: 'raw_herbs', unit: 'g', quantity: 500, pricePerUnit: 0.05, supplier: '本草药材', supplierId: 'supplier-3', gramsPerPacket: null, minStockLevel: 100, isActive: true },
  { id: 'inv-25', name: '川芎', category: 'raw_herbs', unit: 'g', quantity: 400, pricePerUnit: 0.18, supplier: '本草药材', supplierId: 'supplier-3', gramsPerPacket: null, minStockLevel: 100, isActive: true },
  { id: 'inv-26', name: '桂枝', category: 'raw_herbs', unit: 'g', quantity: 600, pricePerUnit: 0.10, supplier: '本草药材', supplierId: 'supplier-3', gramsPerPacket: null, minStockLevel: 100, isActive: true },
  { id: 'inv-27', name: '生姜', category: 'raw_herbs', unit: 'g', quantity: 2000, pricePerUnit: 0.03, supplier: '本草药材', supplierId: 'supplier-3', gramsPerPacket: null, minStockLevel: 300, isActive: true },
  { id: 'inv-28', name: '大枣', category: 'raw_herbs', unit: 'g', quantity: 1500, pricePerUnit: 0.04, supplier: '本草药材', supplierId: 'supplier-3', gramsPerPacket: null, minStockLevel: 200, isActive: true },
  { id: 'inv-29', name: '薄荷', category: 'raw_herbs', unit: 'g', quantity: 300, pricePerUnit: 0.06, supplier: '本草药材', supplierId: 'supplier-3', gramsPerPacket: null, minStockLevel: 80, isActive: true },
  { id: 'inv-30', name: '法半夏', category: 'raw_herbs', unit: 'g', quantity: 400, pricePerUnit: 0.22, supplier: '本草药材', supplierId: 'supplier-3', gramsPerPacket: null, minStockLevel: 100, isActive: true },
  // 粉剂 - 人参（多供应商，不同gramsPerPacket）
  { id: 'inv-31', name: '人参', category: 'powder', unit: '包', quantity: 200, pricePerUnit: 5.00, supplier: '同仁堂', supplierId: 'supplier-1', gramsPerPacket: 2, minStockLevel: 30, isActive: true },
  { id: 'inv-32', name: '人参', category: 'powder', unit: '包', quantity: 150, pricePerUnit: 3.50, supplier: '康仁堂', supplierId: 'supplier-2', gramsPerPacket: 5, minStockLevel: 30, isActive: true },
  // 粉剂 - 麦冬
  { id: 'inv-33', name: '麦冬', category: 'powder', unit: '包', quantity: 300, pricePerUnit: 2.00, supplier: '同仁堂', supplierId: 'supplier-1', gramsPerPacket: 3, minStockLevel: 40, isActive: true },
  { id: 'inv-34', name: '麦冬', category: 'powder', unit: '包', quantity: 180, pricePerUnit: 1.80, supplier: '康仁堂', supplierId: 'supplier-2', gramsPerPacket: 5, minStockLevel: 30, isActive: true },
  // 粉剂 - 五味子
  { id: 'inv-35', name: '五味子', category: 'powder', unit: '包', quantity: 250, pricePerUnit: 2.50, supplier: '同仁堂', supplierId: 'supplier-1', gramsPerPacket: 2, minStockLevel: 30, isActive: true },
  { id: 'inv-36', name: '五味子', category: 'powder', unit: '包', quantity: 100, pricePerUnit: 2.20, supplier: '华佗', supplierId: 'supplier-4', gramsPerPacket: 3, minStockLevel: 20, isActive: true },
  // 粉剂 - 生脉散 (成方粉剂)
  { id: 'inv-37', name: '生脉散', category: 'powder', unit: '包', quantity: 60, pricePerUnit: 8.00, supplier: '同仁堂', supplierId: 'supplier-1', gramsPerPacket: 6, minStockLevel: 10, isActive: true },
  // 成药
  { id: 'inv-11', name: '六味地黄丸', category: 'pills', unit: '盒', quantity: 25, pricePerUnit: 28, supplier: '同仁堂', supplierId: 'supplier-1', gramsPerPacket: null, minStockLevel: 5, isActive: true },
  { id: 'inv-12', name: '逍遥丸', category: 'pills', unit: '盒', quantity: 3, pricePerUnit: 22, supplier: '同仁堂', supplierId: 'supplier-1', gramsPerPacket: null, minStockLevel: 5, isActive: true },
  { id: 'inv-13', name: '金匮肾气丸', category: 'pills', unit: '瓶', quantity: 15, pricePerUnit: 35, supplier: '华佗', supplierId: 'supplier-4', gramsPerPacket: null, minStockLevel: 5, isActive: true },
]

// 常用方剂库
export const FORMULA_DATABASE = [
  {
    name: '四君子汤',
    herbs: [
      { name: '党参', dosage: 15 },
      { name: '白术', dosage: 10 },
      { name: '茯苓', dosage: 15 },
      { name: '甘草', dosage: 6 },
    ],
  },
  {
    name: '六味地黄丸',
    herbs: [
      { name: '熟地黄', dosage: 24 },
      { name: '山萸肉', dosage: 12 },
      { name: '山药', dosage: 12 },
      { name: '泽泻', dosage: 9 },
      { name: '茯苓', dosage: 9 },
      { name: '牡丹皮', dosage: 9 },
    ],
  },
  {
    name: '逍遥散',
    herbs: [
      { name: '柴胡', dosage: 10 },
      { name: '白芍', dosage: 15 },
      { name: '当归', dosage: 10 },
      { name: '茯苓', dosage: 15 },
      { name: '白术', dosage: 10 },
      { name: '甘草', dosage: 6 },
      { name: '薄荷', dosage: 3 },
      { name: '生姜', dosage: 3 },
    ],
  },
  {
    name: '补中益气汤',
    herbs: [
      { name: '黄芪', dosage: 30 },
      { name: '党参', dosage: 15 },
      { name: '白术', dosage: 10 },
      { name: '甘草', dosage: 6 },
      { name: '当归', dosage: 10 },
      { name: '陈皮', dosage: 6 },
      { name: '升麻', dosage: 6 },
      { name: '柴胡', dosage: 6 },
    ],
  },
  {
    name: '八珍汤',
    herbs: [
      { name: '党参', dosage: 15 },
      { name: '白术', dosage: 10 },
      { name: '茯苓', dosage: 15 },
      { name: '甘草', dosage: 6 },
      { name: '当归', dosage: 10 },
      { name: '白芍', dosage: 10 },
      { name: '川芎', dosage: 8 },
      { name: '熟地黄', dosage: 15 },
    ],
  },
  {
    name: '小柴胡汤',
    herbs: [
      { name: '柴胡', dosage: 24 },
      { name: '黄芩', dosage: 9 },
      { name: '党参', dosage: 9 },
      { name: '法半夏', dosage: 9 },
      { name: '甘草', dosage: 6 },
      { name: '生姜', dosage: 9 },
      { name: '大枣', dosage: 12 },
    ],
  },
  {
    name: '桂枝汤',
    herbs: [
      { name: '桂枝', dosage: 9 },
      { name: '白芍', dosage: 9 },
      { name: '生姜', dosage: 9 },
      { name: '大枣', dosage: 12 },
      { name: '甘草', dosage: 6 },
    ],
  },
  {
    name: '金匮肾气丸',
    herbs: [
      { name: '熟地黄', dosage: 24 },
      { name: '山萸肉', dosage: 12 },
      { name: '山药', dosage: 12 },
      { name: '泽泻', dosage: 9 },
      { name: '茯苓', dosage: 9 },
      { name: '牡丹皮', dosage: 9 },
      { name: '附子', dosage: 3 },
      { name: '桂枝', dosage: 3 },
    ],
  },
  {
    name: '生脉散',
    herbs: [
      { name: '人参', dosage: 10 },
      { name: '麦冬', dosage: 30 },
      { name: '五味子', dosage: 6 },
    ],
  },
  {
    name: '归脾汤',
    herbs: [
      { name: '黄芪', dosage: 15 },
      { name: '党参', dosage: 15 },
      { name: '白术', dosage: 10 },
      { name: '茯苓', dosage: 15 },
      { name: '当归', dosage: 10 },
      { name: '甘草', dosage: 6 },
    ],
  },
  {
    name: '四物汤',
    herbs: [
      { name: '当归', dosage: 10 },
      { name: '白芍', dosage: 10 },
      { name: '川芎', dosage: 8 },
      { name: '熟地黄', dosage: 15 },
    ],
  },
]

// 演示供应商数据（与后端 tcm_upgrade_v3 保持一致）
export const DEMO_SUPPLIERS = [
  { id: 'supplier-1', name: '同仁堂', contact: '张经理', phone: '010-65135566', email: 'tongren@example.com', address: '北京市东城区东兴隆街52号', notes: '百年老字号', isActive: true },
  { id: 'supplier-2', name: '康仁堂', contact: '李经理', phone: '010-82863366', email: 'kangren@example.com', address: '北京市昌平区科技园区', notes: '中药配方颗粒供应商', isActive: true },
  { id: 'supplier-3', name: '本草药材', contact: '王经理', phone: '010-67891234', email: 'bencao@example.com', address: '北京市丰台区南苑路', notes: '散装草药供应商', isActive: true },
  { id: 'supplier-4', name: '华佗', contact: '赵经理', phone: '020-88881234', email: 'huatuo@example.com', address: '广东省广州市天河区', notes: '成药供应商', isActive: true },
]

// 演示房间数据
export const DEMO_ROOMS = [
  { id: 'room-1', name: '诊疗室一号', isActive: true },
  { id: 'room-2', name: '诊疗室二号', isActive: true },
  { id: 'room-3', name: '诊疗室三号', isActive: true },
]

// 服务类型配置
export const SERVICE_TYPES = {
  acupuncture_new: {
    label: '针灸首诊',
    duration: 60,
    practitionerTime: 20,
    roomRequired: true,
    defaultPrice: 120,
  },
  acupuncture_followup: {
    label: '针灸复诊',
    duration: 50,
    practitionerTime: 10,
    roomRequired: true,
    defaultPrice: 80,
  },
  herbs_only: {
    label: '仅中药',
    duration: 20,
    practitionerTime: 20,
    roomRequired: false,
    defaultPrice: 60,
  },
}

// 常用穴位
export const ACUPUNCTURE_POINTS = [
  '百会', '神庭', '印堂', '太阳', '风池', '风府', '大椎',
  '肺俞', '心俞', '肝俞', '脾俞', '胃俞', '肾俞',
  '中脘', '气海', '关元', '天枢',
  '合谷', '曲池', '内关', '外关', '神门',
  '足三里', '三阴交', '阴陵泉', '阳陵泉', '太冲', '太溪',
  '涌泉', '委中', '承山',
]
