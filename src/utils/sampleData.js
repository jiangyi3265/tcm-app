// ============================================================
// TCM 中医辨证选项（对应文档 Differentiation 标签各字段）
// 所有字段均为多选(multiple)下拉菜单，除非特别标注
// ============================================================
export const TCM_OPTIONS = {
  // ── Exterior & Head 表&头部 ──
  coldHeat: [
    'Normal 正常', 'Aversion to Cold 恶寒', 'Aversion to Heat 恶热', 'Aversion to Wind 恶风',
    'Tends to feel Cold 畏寒', 'Tends to feel Heat 畏热', 'Cooler Limbs 肢凉', 'Cold Limbs 肢厥',
    'Warmer Finger Tips 手足自温', 'Fever 发热', 'Hot Flush 潮热', 'Five Center Heat 五心烦热',
    'Anxiety Heat in the chest 心中烦热', 'Chills 战栗', 'Chills on the upper back 背心凉',
  ],
  sweat: [
    'Normal 正常', 'No Sweat 无汗', 'Easily Sweat 易汗', 'Cold Sweat 冷汗',
    'Yellow Sweat 黄汗', 'Smelly Sweat 汗有味道', 'Partial Sweat 局部汗出',
  ],
  headDiscomfort: [
    'Normal 正常', 'Empty Headache 空', 'Heaviness 重', 'Distending Pain 胀痛',
    'Throbbing Pain 跳痛', 'Brain Fog 脑蒙', 'Dizziness 头晕', 'Vertigo 头眩',
    'Deviated face 面瘫', 'Twitching muscle 肌肉跳动', 'Burning Pain on the muscle 肌肉灼痛',
  ],
  headPosition: [
    'Frontal 前额', 'Temple 一侧', 'Migraine 偏头痛', 'Occipital 后脑',
    'Top of the Head 巅顶', 'Behind the Eye 眼后', 'Around the Ears 耳周', 'Skin of the head 头皮',
  ],
  eye: [
    'Normal 正常', 'Floaters 飞蚊症', 'Itchy eyes 眼痒', 'Stye 麦粒肿', 'Dry eyes 眼干',
    'Irritation 敏感', 'More Discharges 分泌物增多', 'Eye distension 眼胀',
    'Yellow sclera 眼白发黄', 'Tears easily 易流泪', 'Blood vessels covers the eye 胬肉攀睛',
  ],
  ear: [
    'Normal 正常', 'Pressure in the ear 耳中闷胀', 'Pain in the ear 耳中痛',
    'More Earwax 耳分泌物增加', 'Foul Discharges 分泌物异味', 'Swollen Ears 耳肿',
    'High Pitch Tinnitus 高声耳鸣', 'Low Pitch Tinnitus 低声耳鸣', 'Hearing Loss 听力减退',
    'Itchiness 痒', "Meniere's diseases 梅尼尔综合征",
  ],
  nose: [
    'Normal 正常', 'Sinusitis 鼻窦炎', 'White discharges 白色鼻涕', 'Yellow discharges 黄绿色鼻涕',
    'Congestion 鼻塞', 'Post Nasal Drip 鼻涕倒流', 'Dry Nose 鼻干', 'Nose Bleeding 鼻血',
    'Irritability 易受刺激', 'Smell Loss 嗅觉减弱', 'Abnormal Smell 嗅觉异常',
  ],
  mouth: [
    'Normal 正常', 'Sore throat 咽痛', 'Red throat 咽红', 'Dry throat 咽干',
    'Hyperplasia of lymphoid follicles 咽后壁滤泡', 'Plum-pit Qi 梅核气', 'Ulceration 口腔溃疡',
    'Distension feeling in the tongue 舌胀', 'Toothache 牙痛', 'Gum Bleeding 牙龈出血',
    'Gum Swollen 牙龈红肿', 'Gum Atrophy 牙龈萎缩',
  ],
  taste: [
    'Normal 正常', 'Bitter Taste 苦', 'Sweet Taste 甜', 'Sour Taste 酸',
    'Sticky Taste 粘', 'Metal Taste 金属', 'Salty Taste 咸', 'Loss of Taste 味觉减退',
  ],
  bodyDiscomforts: [
    'Normal 正常', 'Sharp Pain 痛', 'Dull Pain 隐痛', 'Moving Pain 窜痛',
    'Tightness 紧', 'Stiffness 僵硬', 'Soreness 酸痛', 'Burning Pain 灼痛',
    'Heaviness 重', 'Distending Pain 胀痛', 'Cramping 抽筋', 'Restlessness 不安腿',
    'Twitching 抽搐', 'Tingling 麻', 'Numbness 木', 'Radiating Pain 传导痛',
  ],
  bodyDiscomfortsLocation: [
    'None 无', 'Shoulder & Back Neck 肩背项', 'Side of the neck 颈', 'Upper Back 上背',
    'Mid Back 中背', 'Lower Back 腰部', 'Forearm 前臂', 'Upper arm 上臂',
    'Thigh 大腿', 'Lower Legs 小腿', 'Hands 手', 'Feet 脚', 'Finger 手指', 'Toes 脚趾',
  ],
  skinIssues: [
    'Normal 正常', 'Pitting Edema 凹陷性水肿', 'Non-Pitting Edema 非凹陷性水肿', 'Itchiness 痒',
    'Raised 凸起', 'Redness 发红', 'Clear border 边界清晰', 'Pus 脓', 'Wet 流水',
    'Dry 干燥', 'Desquamation 脱屑', 'Hardened skin 皮肤发硬', 'Wandering 游走性的',
  ],
  // ── Chest 心胸 ──
  chest: [
    'Normal 正常', 'Stuffy Chest 胸闷', 'Shortness of Breath 短气', 'Panting 喘',
    'Wheezing 哮', 'Coughing 咳', 'Pain 痛', 'Asthma 哮喘病', 'Palpitation 心悸',
    'Easily Frightened 易惊', 'Irregular Heart Beat 心跳不规律',
  ],
  hypochondriac: [
    'Normal 正常', 'Pain on pressure 压痛', 'Distending 胀', 'Pain 痛', 'Stabbing Pain 刺痛',
  ],
  sleep: [
    'Normal 正常', 'Difficulty falling asleep 入睡困难', 'Wake ups easily 易醒',
    'Night Urination 夜尿', 'Night Sweat Before Wake Up 盗汗', 'Night Sweat After Wake Up 夜醒汗出',
    'Dreams a lot 多梦', 'Snoring or Apnea 打鼾/呼吸暂停', 'Fatigue when wake up 醒后疲劳', 'Sleepy 嗜睡',
  ],
  // anxietyStress: 数字输入(1-10)，不在这里
  // ── Abdomen 腹部 ──
  appetite: [
    'Normal 正常', 'Desire to eat 欲食', 'No Desire to eat 不欲食', 'Able to eat 能食',
    'Cannot Eat much 不能多食', 'Not much taste 食不知味', 'Craving for sweet 嗜甜',
    'Noisy feeling as if hunger 嘈杂似饥', 'Excessive Hungry feeling 饥饿',
    'Cannot Hold the hunger 不能忍受饥饿',
  ],
  thirst: [
    'Normal 正常', 'Excessive Thirst 口渴', 'Dry Mouth 口干', 'Dislike Drink 不欲饮',
    'No Thirst 不渴', 'In Big Gulps 大口喝水', 'In Small Sips 小口喝水',
    'Prefer cold drinks 喜冷饮', 'Prefer hot drinks 喜热饮', 'Prefer Tasty water 喜有味道的水',
  ],
  abdomen: [
    'Normal 正常', 'Pain with pressure 压痛', 'Burning Pain 灼痛', 'Pi Syndrome 痞硬',
    'Pain when releasing the pressure 反跳痛', 'Bloating 腹胀', 'Acid reflux 反酸',
    'Belching with food smell 嗳气有食物的味道', 'Hiccups 打膈', 'Gas 放屁', 'Masses 结块', 'Bowel sounds 肠鸣',
  ],
  // ── Lower Abdomen 下腹 ──
  bowelMovement: [
    'Normal 正常', 'Hard/Pepples 硬便', 'Soft 软便', 'Loose 稀便', 'Mucus 粘液',
    'Sticky 粘便', 'Watery 水样便', 'Unfinished 便意不尽', 'Tenesmus 里急后重',
    'Black 黑便', 'Yellowish 淡黄便', 'Fresh Blood 血便', 'No Willing to poo 无便意',
    'No Strength to poo 无力排便', 'Constipation 便秘', 'Fatigue after the BM 便后无力', 'Urgency to go Poo 便前急迫',
  ],
  urine: [
    'Normal 正常', 'Urgency to go to urinate 便前急迫', 'Clear Urination 色清',
    'Cloudy Urination 色混浊', 'Yellowish Urination 色黄', 'Dark Urination 色深',
    'Red Urination 色红', 'Bubble Urine 泡沫尿', 'Pain During Urination 尿痛',
    'Pain After Urination 尿后痛', 'Scanty Urine 尿少', 'Profuse Urine 尿多',
    'Frequent Urine 尿频', 'Incontinence 尿失禁', 'Unfinished 尿不尽', 'Dribbling 尿涩', 'Night Urination 夜尿',
  ],
  // ── Female 妇科 ──
  bloodQuality: [
    'Normal 正常', 'Dark Red 深红', 'Bright Red 正红', 'Pale Red 淡红/有水',
    'Pink 粉红/有粘液', 'Small clots 小血块', 'Big Clots 大血块',
    'Small Amount 量少', 'Big Amount 量多', 'More Release after Pain 痛后下血',
  ],
  pms: [
    'Normal 正常', 'Abdominal Pain 腹痛', 'Dizziness 眩晕', 'Headache 头痛',
    'Distending Breast 胸胀', 'Constipation 便秘', 'Loose Stool 腹泻', 'Emotional 情绪化',
  ],
  // ── Pulse 脉 ──
  pulse: [
    'Floating 浮', 'Deep 沉', 'Slow 迟', 'Rapid 数', 'Moderate 缓', 'Forceful 强',
    'Weak 弱', 'Soft 软', 'Thin 细', 'Wiry 弦', 'Tight 紧', 'Choppy 涩',
    'Slippery 滑', 'Hard 硬', 'Not Clear Edges 边界不清', 'Leather 革', 'Irregular 结代',
  ],
  // ── Tongue 舌 ──
  tongueColor: [
    'Pale Red 淡红/正常', 'Pale 淡', 'Red 红', 'Deep Red 深红', 'Purple 紫',
    'Dull 暗', 'Edge Red 边红', 'Tip Red 尖红', 'Edge Purple 边紫', 'Petechiae 瘀点',
  ],
  tongueBody: [
    'Normal 正常', 'Swollen 胖大', 'Swollen Edge 边胀', 'Teeth mark 齿痕', 'Thick 厚',
    'Triangle tip 三角尖', 'Rough 粗糙', 'Tender 嫩舌', 'Incline to one side 舌歪斜',
    'Depression 舌凹陷', 'Middle Cracks 舌中凹陷', 'Small Cracks 小裂纹',
  ],
  tongueCoating: [
    'Thin White/Normal 正常', 'Yellow 黄苔', 'White 白苔', 'Grey/Black 灰黑苔',
    'Watery 水滑苔', 'Greasy 腻苔', 'Turbid 浊苔', 'Powder 粉积苔',
    'Thick 厚苔', 'Thin 薄苔', 'Clean 净苔', 'Peel 剥苔',
  ],
  // ── Palpitation 触诊 ──
  pathologicalChannel: [
    'None 无', 'H-Taiyin 肺经', 'H-Yangming 大肠经', 'F-Yangming 胃经', 'F-Taiyin 脾经',
    'H-Shaoyin 心经', 'H-Taiyang 小肠经', 'F-Taiyang 膀胱经', 'F-Shaoyin 肾经',
    'H-Jueyin 心包经', 'H-Shaoyang 三焦经', 'F-Shaoyang 胆经', 'F-Jueyin 肝经',
    'Ren Mai 任脉', 'Du Mai 督脉', 'Yang Mobility 阳跷', 'Yin Mobility 阴跷',
    'Yang Wei 阳维', 'Yin Wei 阴维', 'Chong Mai 冲脉', 'Dai Mai 带脉',
  ],
  // ── 其他选项 ──
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

// 空的辨证数据结构（多选字段使用数组）
export function emptyDiff() {
  return {
    // Exterior & Head
    coldHeat: [], sweat: [], headDiscomfort: [], headPosition: [],
    eye: [], ear: [], nose: [], mouth: [], taste: [],
    bodyDiscomforts: [], bodyDiscomfortsLocation: [], skinIssues: [], otherExterior: '',
    // Chest
    chest: [], hypochondriac: [], sleep: [],
    anxietyStress: null, // 数字 1-10
    otherChest: '',
    // Abdomen
    appetite: [], thirst: [], abdomen: [], otherAbdomen: '',
    // Lower Abdomen
    bowelMovement: [], urine: [], otherLowerAbdomen: '',
    // Female
    periodCircle: null, periodDuration: null, bloodQuality: [], pms: [], otherFemale: '',
    // Pulse
    pulse: [], pulseRightHand: [], pulseLeftHand: [],
    pulseBothCun: [], pulseBothGuan: [], pulseBothChi: [],
    detailedPulse: '',
    // Tongue
    tongueColor: [], tongueBody: [], tongueCoating: [], otherTongue: '', tongueImage: null, tongueImageResource: null,
    // Palpitation
    pathologicalChannel: [], pathologicalChanges: '',
    // Differentiation Conclusion
    conclusions: [],
  }
}

// 兼容旧数据：将字符串值转换为数组
export function normalizeDiff(diff) {
  const result = { ...emptyDiff(), ...diff }
  const arrayFields = [
    'coldHeat', 'sweat', 'headDiscomfort', 'headPosition', 'eye', 'ear', 'nose', 'mouth', 'taste',
    'bodyDiscomforts', 'bodyDiscomfortsLocation', 'skinIssues',
    'chest', 'hypochondriac', 'sleep',
    'appetite', 'thirst', 'abdomen',
    'bowelMovement', 'urine',
    'bloodQuality', 'pms',
    'pulse', 'pulseRightHand', 'pulseLeftHand', 'pulseBothCun', 'pulseBothGuan', 'pulseBothChi',
    'tongueColor', 'tongueBody', 'tongueCoating',
    'pathologicalChannel',
  ]
  for (const field of arrayFields) {
    const val = result[field]
    if (typeof val === 'string' && val) {
      result[field] = [val]
    } else if (!Array.isArray(val)) {
      result[field] = []
    }
  }
  if (!Array.isArray(result.conclusions)) result.conclusions = []
  return result
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
      coldHeat: ['Normal 正常'], sweat: ['Normal 正常'], headDiscomfort: ['Distending Pain 胀痛'], headPosition: ['Temple 一侧'],
      eye: [], ear: [], nose: [], mouth: [], taste: ['Bitter Taste 苦'],
      bodyDiscomforts: ['Stiffness 僵硬'], bodyDiscomfortsLocation: ['Shoulder & Back Neck 肩背项'], skinIssues: [], otherExterior: '',
      chest: ['Stuffy Chest 胸闷', 'Palpitation 心悸'], hypochondriac: ['Distending 胀'], sleep: ['Difficulty falling asleep 入睡困难'], anxietyStress: 7, otherChest: '',
      appetite: ['No Desire to eat 不欲食'], thirst: ['Dry Mouth 口干'], abdomen: ['Bloating 腹胀'], otherAbdomen: '',
      bowelMovement: ['Normal 正常'], urine: ['Normal 正常'], otherLowerAbdomen: '',
      periodCircle: null, periodDuration: null, bloodQuality: [], pms: [], otherFemale: '',
      pathologicalChannel: ['F-Jueyin 肝经', 'H-Shaoyin 心经'], pathologicalChanges: '肝区压痛，太冲穴有明显酸胀感',
      pulse: ['Wiry 弦'], pulseRightHand: [], pulseLeftHand: [], pulseBothCun: [], pulseBothGuan: [], pulseBothChi: [], detailedPulse: '弦细，左关尤甚',
      tongueColor: ['Red 红'], tongueBody: ['Normal 正常'], tongueCoating: ['Yellow 黄苔', 'Thin 薄苔'], otherTongue: '舌尖红', tongueImage: null,
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
      coldHeat: ['Normal 正常'], sweat: ['Easily Sweat 易汗'], headDiscomfort: ['Dizziness 头晕'], headPosition: [],
      eye: [], ear: [], nose: [], mouth: [], taste: ['Normal 正常'],
      bodyDiscomforts: ['Heaviness 重'], bodyDiscomfortsLocation: [], skinIssues: [], otherExterior: '',
      chest: ['Normal 正常'], hypochondriac: ['Normal 正常'], sleep: ['Dreams a lot 多梦'], anxietyStress: null, otherChest: '',
      appetite: ['No Desire to eat 不欲食'], thirst: ['Normal 正常'], abdomen: ['Normal 正常'], otherAbdomen: '',
      bowelMovement: ['Loose 稀便'], urine: ['Normal 正常'], otherLowerAbdomen: '',
      periodCircle: null, periodDuration: null, bloodQuality: [], pms: [], otherFemale: '',
      pathologicalChannel: ['F-Taiyin 脾经', 'F-Yangming 胃经'], pathologicalChanges: '腹部压痛减轻',
      pulse: ['Thin 细'], pulseRightHand: [], pulseLeftHand: [], pulseBothCun: [], pulseBothGuan: [], pulseBothChi: [], detailedPulse: '细弱',
      tongueColor: ['Pale 淡'], tongueBody: ['Swollen 胖大'], tongueCoating: ['White 白苔', 'Thin 薄苔'], otherTongue: '舌边有齿痕', tongueImage: null,
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

// 演示库存数据
export const DEMO_INVENTORY = [
  // 粉剂
  { id: 'inv-1', name: '逍遥散', category: 'powder', unit: '包', quantity: 50, pricePerUnit: 35, supplier: '同仁堂', gramsPerPacket: 6, minStockLevel: 10, isActive: true },
  { id: 'inv-2', name: '六味地黄丸（浓缩粉）', category: 'powder', unit: '包', quantity: 8, pricePerUnit: 40, supplier: '同仁堂', gramsPerPacket: 6, minStockLevel: 10, isActive: true },
  { id: 'inv-3', name: '补中益气汤', category: 'powder', unit: '包', quantity: 30, pricePerUnit: 38, supplier: '康仁堂', gramsPerPacket: 5, minStockLevel: 10, isActive: true },
  // 草药
  { id: 'inv-4', name: '黄芪', category: 'raw_herbs', unit: 'g', quantity: 2000, pricePerUnit: 0.08, supplier: '本草药材', gramsPerPacket: null, minStockLevel: 500, isActive: true },
  { id: 'inv-5', name: '党参', category: 'raw_herbs', unit: 'g', quantity: 1500, pricePerUnit: 0.12, supplier: '本草药材', gramsPerPacket: null, minStockLevel: 300, isActive: true },
  { id: 'inv-6', name: '白术', category: 'raw_herbs', unit: 'g', quantity: 800, pricePerUnit: 0.10, supplier: '本草药材', gramsPerPacket: null, minStockLevel: 200, isActive: true },
  { id: 'inv-7', name: '茯苓', category: 'raw_herbs', unit: 'g', quantity: 1200, pricePerUnit: 0.09, supplier: '本草药材', gramsPerPacket: null, minStockLevel: 300, isActive: true },
  { id: 'inv-8', name: '柴胡', category: 'raw_herbs', unit: 'g', quantity: 150, pricePerUnit: 0.15, supplier: '本草药材', gramsPerPacket: null, minStockLevel: 200, isActive: true },
  { id: 'inv-9', name: '当归', category: 'raw_herbs', unit: 'g', quantity: 900, pricePerUnit: 0.20, supplier: '本草药材', gramsPerPacket: null, minStockLevel: 200, isActive: true },
  { id: 'inv-10', name: '甘草', category: 'raw_herbs', unit: 'g', quantity: 1800, pricePerUnit: 0.06, supplier: '本草药材', gramsPerPacket: null, minStockLevel: 300, isActive: true },
  // 成药
  { id: 'inv-11', name: '六味地黄丸', category: 'pills', unit: '盒', quantity: 25, pricePerUnit: 28, supplier: '同仁堂', gramsPerPacket: null, minStockLevel: 5, isActive: true },
  { id: 'inv-12', name: '逍遥丸', category: 'pills', unit: '盒', quantity: 3, pricePerUnit: 22, supplier: '同仁堂', gramsPerPacket: null, minStockLevel: 5, isActive: true },
  { id: 'inv-13', name: '金匮肾气丸', category: 'pills', unit: '瓶', quantity: 15, pricePerUnit: 35, supplier: '华佗', gramsPerPacket: null, minStockLevel: 5, isActive: true },
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
]

// 演示房间数据
export const DEMO_ROOMS = [
  { id: 'room-1', name: '诊疗室一号', supportTags: ['consultation', 'herbs'], isActive: true },
  { id: 'room-2', name: '诊疗室二号', supportTags: ['tuina', 'moxibustion'], isActive: true },
  { id: 'room-3', name: '诊疗室三号', supportTags: ['acupuncture', 'moxibustion'], isActive: true },
]

// 服务类型配置
export const SERVICE_TAGS = ['acupuncture', 'tuina', 'consultation', 'herbs', 'moxibustion']

export const SERVICE_TYPES = {
  acupuncture_new: {
    label: '针灸首诊',
    duration: 60,
    practitionerTime: 20,
    roomRequired: true,
    defaultPrice: 120,
    requiredTag: 'acupuncture',
  },
  acupuncture_followup: {
    label: '针灸复诊',
    duration: 50,
    practitionerTime: 10,
    roomRequired: true,
    defaultPrice: 80,
    requiredTag: 'acupuncture',
  },
  herbs_only: {
    label: '仅中药',
    duration: 20,
    practitionerTime: 20,
    roomRequired: true,
    defaultPrice: 60,
    requiredTag: 'herbs',
  },
  acupuncture_40: {
    label: '针灸40分钟',
    duration: 40,
    practitionerTime: 20,
    roomRequired: true,
    defaultPrice: 100,
    requiredTag: 'acupuncture',
  },
  tuina_40: {
    label: '推拿40分钟',
    duration: 40,
    practitionerTime: 40,
    roomRequired: true,
    defaultPrice: 100,
    requiredTag: 'tuina',
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
