/**
 * ============================================================
 *  แผนส่งมอบบ้าน (Handover Tracker)
 *  Google Apps Script Web App  +  Google Sheets  +  Google Drive
 * ------------------------------------------------------------
 *  ไฟล์ในโปรเจกต์
 *    Code.gs          ← ไฟล์นี้ (ฝั่งเซิร์ฟเวอร์ / ฐานข้อมูล)
 *    Index.html       ← โครงหน้าเว็บ
 *    Stylesheet.html  ← สี ฟอนต์ การจัดวาง
 *    JavaScript.html  ← การทำงานหน้าเว็บทั้งหมด
 *
 *  วิธีเริ่มใช้งาน: เลือกฟังก์ชัน setup แล้วกด Run 1 ครั้ง
 *  (ระบบจะสร้างชีต, โฟลเดอร์รูปภาพ, แม่แบบงาน และข้อมูลตัวอย่าง)
 * ============================================================
 */

const APP = {
  NAME: 'แผนส่งมอบบ้าน',
  TZ: 'Asia/Bangkok',
  PHOTO_FOLDER: 'แผนส่งมอบบ้าน - รูปภาพ',
  VERSION: '1.3.0'
};

/** ประเภทห้อง/บ้าน — เพิ่มได้ในอนาคต (ต้องเพิ่มแม่แบบงานในหน้าตั้งค่าด้วย) */
const UNIT_TYPES = ['คอนโด', 'อาคารพาณิชย์', 'บ้านแฝด', 'บ้านเดี่ยว', 'ทาวน์โฮม'];

/** ขั้นตอนของรูปภาพ */
const PHOTO_STAGES = ['ก่อนปรับปรุง', 'ระหว่างดำเนินการ', 'หลังเสร็จ'];

/**
 * โครงสร้างตาราง (ชีต) — [ชื่อคอลัมน์, ชนิด]
 *   s = ข้อความ, n = ตัวเลข, m = จำนวนเงิน (Number #,##0.00), d = วันที่ (yyyy-MM-dd), t = วันเวลา
 * ระบบอ่าน/เขียนตาม "ชื่อหัวคอลัมน์" จึงเพิ่มคอลัมน์ใหม่ต่อท้ายได้โดยไม่กระทบข้อมูลเดิม
 */
const SCHEMA = {
  Projects: [['id','s'],['name','s'],['code','s'],['location','s'],['description','s'],
             ['startDate','d'],['targetDate','d'],['color','s'],['createdAt','t'],['updatedAt','t']],
  Units:    [['id','s'],['projectId','s'],['unitNo','s'],['unitType','s'],['floor','s'],
             ['area','n'],['landArea','n'],['budget','m'],['customer','s'],['phone','s'],
             ['plannedHandover','d'],['handoverDate','d'],['note','s'],['createdAt','t'],['updatedAt','t']],
  Tasks:    [['id','s'],['unitId','s'],['seq','n'],['category','s'],['title','s'],['detail','s'],
             ['contractor','s'],['startDate','d'],['dueDate','d'],['finishDate','d'],
             ['progress','n'],['estCost','m'],['status','s'],['note','s'],['createdAt','t'],['updatedAt','t']],
  Photos:   [['id','s'],['unitId','s'],['taskId','s'],['stage','s'],['fileId','s'],
             ['caption','s'],['uploadedBy','s'],['createdAt','t']],
  Templates:[['id','s'],['unitType','s'],['seq','n'],['category','s'],['title','s'],['detail','s'],['days','n'],['estCost','m']],
  Settings: [['key','s'],['value','s']],
  Logs:     [['timestamp','t'],['user','s'],['action','s'],['entity','s'],['entityId','s'],['detail','s']]
};

/** แม่แบบงานเริ่มต้น: [หมวดงาน, ชื่องาน, จำนวนวัน, รายละเอียด] */
const TEMPLATE_DEF = {
  'คอนโด': [
    ['เตรียมงาน', 'สำรวจหน้างานและถ่ายภาพก่อนปรับปรุง', 1, 'ตรวจสภาพห้อง จดรายการชำรุด ถ่ายภาพทุกมุม'],
    ['รื้อถอน', 'รื้อถอนวัสดุเดิมและขนย้ายเศษวัสดุ', 3, ''],
    ['งานระบบ', 'ตรวจและแก้ไขระบบไฟฟ้า', 3, 'ปลั๊ก สวิตช์ ดวงโคม ตู้ไฟ'],
    ['งานระบบ', 'ตรวจและแก้ไขระบบประปา/สุขาภิบาล', 2, 'ท่อน้ำดี ท่อน้ำทิ้ง รอยรั่วซึม'],
    ['งานสถาปัตย์', 'ซ่อมฝ้าเพดาน', 2, ''],
    ['งานสถาปัตย์', 'ซ่อมผนัง ฉาบ และทาสีใหม่', 4, ''],
    ['งานสถาปัตย์', 'งานพื้น (ปูใหม่/ขัดเงา)', 4, ''],
    ['ห้องน้ำ', 'ปรับปรุงห้องน้ำและสุขภัณฑ์', 3, ''],
    ['งานสถาปัตย์', 'ซ่อม/เปลี่ยนประตู หน้าต่าง', 2, ''],
    ['ตกแต่ง', 'ติดตั้งเฟอร์นิเจอร์บิวท์อิน', 3, ''],
    ['ส่งมอบ', 'ทำความสะอาดใหญ่', 1, ''],
    ['ส่งมอบ', 'ตรวจรับงาน (QC) และแก้ไขจุดบกพร่อง', 2, '']
  ],
  'อาคารพาณิชย์': [
    ['เตรียมงาน', 'สำรวจหน้างานและถ่ายภาพก่อนปรับปรุง', 1, 'ตรวจสภาพทุกชั้น จดรายการชำรุด ถ่ายภาพทุกมุม'],
    ['รื้อถอน', 'รื้อถอนวัสดุเดิมและขนย้ายเศษวัสดุ', 3, ''],
    ['งานโครงสร้าง', 'ซ่อมรอยร้าวโครงสร้างและผนังภายนอก', 4, ''],
    ['หลังคา', 'ตรวจซ่อมหลังคาและรางน้ำ', 3, ''],
    ['งานระบบ', 'ตรวจและแก้ไขระบบไฟฟ้า', 4, ''],
    ['งานระบบ', 'ตรวจและแก้ไขระบบประปา/สุขาภิบาล', 3, ''],
    ['งานสถาปัตย์', 'ซ่อมฝ้าเพดาน', 3, ''],
    ['งานสถาปัตย์', 'ซ่อมผนัง ฉาบ และทาสีภายใน', 5, ''],
    ['งานสถาปัตย์', 'งานพื้นและบันได', 4, ''],
    ['ห้องน้ำ', 'ปรับปรุงห้องน้ำและสุขภัณฑ์', 3, ''],
    ['ภายนอก', 'ซ่อม/ทาสีประตูม้วนและหน้าอาคาร', 3, ''],
    ['ส่งมอบ', 'ทำความสะอาดใหญ่', 2, ''],
    ['ส่งมอบ', 'ตรวจรับงาน (QC) และแก้ไขจุดบกพร่อง', 2, '']
  ],
  'บ้านแฝด': [
    ['เตรียมงาน', 'สำรวจหน้างานและถ่ายภาพก่อนปรับปรุง', 1, 'ตรวจสภาพบ้านและรอบบ้าน ถ่ายภาพทุกมุม'],
    ['รื้อถอน', 'รื้อถอนวัสดุเดิมและขนย้ายเศษวัสดุ', 3, ''],
    ['หลังคา', 'ตรวจซ่อมหลังคาและรางน้ำ', 3, ''],
    ['งานระบบ', 'ตรวจและแก้ไขระบบไฟฟ้า', 3, ''],
    ['งานระบบ', 'ตรวจและแก้ไขระบบประปา/สุขาภิบาล', 3, ''],
    ['งานสถาปัตย์', 'ซ่อมฝ้าเพดาน', 2, ''],
    ['งานสถาปัตย์', 'ซ่อมผนัง ฉาบ และทาสีภายใน-ภายนอก', 5, ''],
    ['งานสถาปัตย์', 'งานพื้น', 4, ''],
    ['ห้องน้ำ', 'ปรับปรุงห้องน้ำและสุขภัณฑ์', 3, ''],
    ['งานสถาปัตย์', 'ซ่อม/เปลี่ยนประตู หน้าต่าง', 2, ''],
    ['ภายนอก', 'ซ่อมรั้ว ประตูรั้ว และลานจอดรถ', 3, ''],
    ['ภายนอก', 'ปรับปรุงสวนและทางเดินรอบบ้าน', 2, ''],
    ['ส่งมอบ', 'ทำความสะอาดใหญ่', 2, ''],
    ['ส่งมอบ', 'ตรวจรับงาน (QC) และแก้ไขจุดบกพร่อง', 2, '']
  ]
};

/* ============================================================
 *  Web App
 * ============================================================ */

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(APP.NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * จุดเรียก API เดียวจากหน้าเว็บ: google.script.run.api(action, payload)
 * เพิ่มฟีเจอร์ใหม่ = เพิ่มฟังก์ชันใน ROUTES
 */
const ROUTES = {
  bootstrap:      bootstrap_,
  saveProject:    p => upsert_('Projects', p, 'PRJ'),
  deleteProject:  deleteProject_,
  saveUnit:       saveUnit_,
  deleteUnit:     p => deleteUnit_(p.id),
  saveTask:       saveTask_,
  deleteTask:     deleteTask_,
  applyTemplate:  applyTemplate_,
  uploadPhoto:    uploadPhoto_,
  savePdf:        savePdf_,
  updatePhoto:    p => decoratePhoto_(upsert_('Photos', { id: p.id, caption: p.caption, stage: p.stage }, 'PHO')),
  deletePhoto:    deletePhoto_,
  saveTemplate:   p => upsert_('Templates', p, 'TPL'),
  deleteTemplate: p => ({ deleted: deleteWhere_('Templates', r => r.id === p.id) })
};

function api(action, payload) {
  try {
    const fn = ROUTES[action];
    if (!fn) throw new Error('ไม่รู้จักคำสั่ง: ' + action);
    return JSON.stringify({ ok: true, data: fn(payload || {}) });
  } catch (err) {
    console.error(action, err);
    return JSON.stringify({ ok: false, error: err && err.message ? err.message : String(err) });
  }
}

/* ============================================================
 *  Setup (รันครั้งแรกจาก Editor)
 * ============================================================ */

function setup() {
  Object.keys(SCHEMA).forEach(name => headers_(sheet_(name), name));
  if (!readTable_('Templates').length) appendRows_('Templates', defaultTemplates_());
  rootFolder_();
  if (!readTable_('Projects').length) seedDemoData_();

  // ลบชีตว่างเริ่มต้น
  const ss = ss_();
  ['Sheet1', 'ชีต1', 'แผ่นงาน1'].forEach(n => {
    const s = ss.getSheetByName(n);
    if (s && ss.getSheets().length > 1 && s.getLastRow() === 0) ss.deleteSheet(s);
  });
  Logger.log('ติดตั้งเรียบร้อย: ' + ss.getUrl());
  return 'ok';
}

function defaultTemplates_() {
  const rows = [];
  Object.keys(TEMPLATE_DEF).forEach(type => {
    TEMPLATE_DEF[type].forEach((t, i) => rows.push({
      id: newId_('TPL'), unitType: type, seq: i + 1,
      category: t[0], title: t[1], days: t[2], detail: t[3] || '', estCost: ''
    }));
  });
  return rows;
}

/** ข้อมูลตัวอย่างตามโจทย์ (แก้ไข/ลบได้ภายหลังจากหน้าเว็บ) */
/** ค่าแรง+วัสดุต่อวันโดยประมาณ (ใช้เฉพาะข้อมูลตัวอย่าง) */
const DEMO_RATE = { 'คอนโด': 6500, 'อาคารพาณิชย์': 9500, 'บ้านแฝด': 8500 };

function seedDemoData_() {
  const today = startOfDay_(new Date());
  const p1 = upsert_('Projects', { name: 'คอนโด เอเซ่', code: 'ACE', description: 'ห้องชุดพักอาศัย ชั้น 6–7', color: '#E07A7A' }, 'PRJ');
  const p2 = upsert_('Projects', { name: 'โครงการที่ 2', code: 'P2', description: 'อาคารพาณิชย์ 3 หลัง และบ้านแฝด 2 หลัง', color: '#E8A87C' }, 'PRJ');

  // [project, unitNo, type, floor, area(ตร.ม.), landArea(ตร.ว.), เริ่มงาน(วันจากวันนี้), เผื่อวันส่งมอบ, ล่าช้า?]
  const specs = [
    [p1, '85',      'คอนโด',        '6', 32.50, '', -32, 3,  false],
    [p1, '100',     'คอนโด',        '7', 28.75, '', -18, 5,  false],
    [p1, '101',     'คอนโด',        '7', 30.10, '', -12, 0,  true ],
    [p1, '115',     'คอนโด',        '7', 45.60, '', -6,  7,  false],
    [p1, '120',     'คอนโด',        '7', 35.20, '', 3,   10, false],
    [p2, '80',      'อาคารพาณิชย์', '',  160,   16, -25, 5,  false],
    [p2, '81',      'อาคารพาณิชย์', '',  160,   16, -15, -2, true ],
    [p2, '85',      'อาคารพาณิชย์', '',  172,   18, -5,  6,  false],
    [p2, '100/015', 'บ้านแฝด',      '',  120,   35, -40, 4,  false],
    [p2, '100/095', 'บ้านแฝด',      '',  125,   38, -2,  8,  false]
  ];

  const allTasks = [];
  specs.forEach(s => {
    const [proj, unitNo, type, floor, area, landArea, startOff, buffer, delayed] = s;
    const tpl = TEMPLATE_DEF[type];
    let cur = addDays_(today, startOff);
    const tasks = [];
    let lastLateIdx = -1;
    tpl.forEach((t, i) => {
      const start = new Date(cur), due = addDays_(cur, t[2] - 1);
      cur = addDays_(cur, t[2]);
      let progress = 0, finish = '';
      if (due < today) { progress = 100; finish = fmt_(due); lastLateIdx = i; }
      else if (start <= today) {
        const total = t[2], passed = Math.round((today - start) / 864e5) + 1;
        progress = Math.min(90, Math.round((passed / total) * 100 / 10) * 10);
      }
      tasks.push({ seq: i + 1, category: t[0], title: t[1], detail: t[3] || '', estCost: Math.round(t[2] * DEMO_RATE[type] * area / (type === 'คอนโด' ? 32 : 160) / 100) * 100,
        startDate: fmt_(start), dueDate: fmt_(due), finishDate: finish, progress: progress });
    });
    if (delayed && lastLateIdx >= 0) {           // จำลองงานล่าช้า
      tasks[lastLateIdx].progress = 60;
      tasks[lastLateIdx].finishDate = '';
      tasks[lastLateIdx].note = 'รอวัสดุจากผู้ขาย';
    }
    const lastDue = tasks[tasks.length - 1].dueDate;
    const unit = upsert_('Units', {
      projectId: proj.id, unitNo: unitNo, unitType: type, floor: floor,
      area: area, landArea: landArea, customer: '',
      plannedHandover: fmt_(addDays_(parseDate_(lastDue), buffer)), note: ''
    }, 'UNT');
    const now = nowStr_();
    tasks.forEach(t => allTasks.push(Object.assign({
      id: newId_('TSK'), unitId: unit.id, contractor: '', note: '',
      status: taskStatus_(t), createdAt: now, updatedAt: now
    }, t)));
  });
  appendRows_('Tasks', allTasks);
}

/* ============================================================
 *  Business logic
 * ============================================================ */

function bootstrap_() {
  if (!ss_().getSheetByName('Templates')) setup();
  const folder = rootFolder_();
  return {
    projects:  readTable_('Projects'),
    units:     readTable_('Units'),
    tasks:     readTable_('Tasks'),
    photos:    readTable_('Photos').map(decoratePhoto_),
    templates: readTable_('Templates'),
    meta: {
      appName: APP.NAME,
      version: APP.VERSION,
      user: user_(),
      today: today_(),
      sheetUrl: ss_().getUrl(),
      folderUrl: folder.getUrl(),
      unitTypes: UNIT_TYPES,
      stages: PHOTO_STAGES
    }
  };
}

function saveUnit_(p) {
  if (!p.projectId) throw new Error('กรุณาเลือกโครงการ');
  if (!String(p.unitNo || '').trim()) throw new Error('กรุณาระบุเลขที่ห้อง/บ้าน');
  const dup = readTable_('Units').find(u =>
    u.projectId === p.projectId && String(u.unitNo) === String(p.unitNo).trim() && u.id !== p.id);
  if (dup) throw new Error('เลขที่ ' + p.unitNo + ' มีอยู่แล้วในโครงการนี้');
  p.unitNo = String(p.unitNo).trim();
  return upsert_('Units', p, 'UNT');
}

function taskStatus_(t) {
  const p = Number(t.progress) || 0;
  if (p >= 100) return 'done';
  if (t.dueDate && t.dueDate < today_()) return 'late';
  if (p > 0) return 'doing';
  return 'todo';
}

function saveTask_(p) {
  if (!p.unitId) throw new Error('ไม่พบห้อง/บ้าน');
  if (!String(p.title || '').trim()) throw new Error('กรุณาระบุชื่องาน');
  p.progress = Math.max(0, Math.min(100, Number(p.progress) || 0));
  if (p.estCost !== undefined) p.estCost = p.estCost === '' ? '' : Math.max(0, Number(String(p.estCost).replace(/,/g, '')) || 0);
  if (p.progress >= 100 && !p.finishDate) p.finishDate = today_();
  if (p.progress < 100) p.finishDate = '';
  if (p.startDate && p.dueDate && p.dueDate < p.startDate) throw new Error('วันกำหนดเสร็จต้องไม่ก่อนวันเริ่มงาน');
  if (!p.id && !p.seq) {
    const max = readTable_('Tasks').filter(t => t.unitId === p.unitId)
      .reduce((m, t) => Math.max(m, Number(t.seq) || 0), 0);
    p.seq = max + 1;
  }
  p.status = taskStatus_(p);
  return upsert_('Tasks', p, 'TSK');
}

function deleteTask_(p) {
  return withLock_(() => {
    const photos = readTable_('Photos').filter(x => x.taskId === p.id);
    photos.forEach(x => trashFile_(x.fileId));
    deleteWhere_('Photos', r => r.taskId === p.id);
    deleteWhere_('Tasks', r => r.id === p.id);
    log_('delete', 'Tasks', p.id, '');
    return { id: p.id, photoIds: photos.map(x => x.id) };
  });
}

function deleteUnit_(id) {
  return withLock_(() => {
    const photos = readTable_('Photos').filter(x => x.unitId === id);
    photos.forEach(x => trashFile_(x.fileId));
    deleteWhere_('Photos', r => r.unitId === id);
    deleteWhere_('Tasks', r => r.unitId === id);
    deleteWhere_('Units', r => r.id === id);
    log_('delete', 'Units', id, '');
    return { id: id };
  });
}

function deleteProject_(p) {
  return withLock_(() => {
    readTable_('Units').filter(u => u.projectId === p.id).forEach(u => deleteUnit_(u.id));
    deleteWhere_('Projects', r => r.id === p.id);
    log_('delete', 'Projects', p.id, '');
    return { id: p.id };
  });
}

/** สร้างรายการงานจากแม่แบบตามประเภทห้อง/บ้าน เรียงต่อกันตั้งแต่วันเริ่ม */
function applyTemplate_(p) {
  return withLock_(() => {
    const unit = findById_('Units', p.unitId);
    if (!unit) throw new Error('ไม่พบห้อง/บ้าน');
    const tpl = readTable_('Templates').filter(t => t.unitType === unit.unitType)
      .sort((a, b) => a.seq - b.seq);
    if (!tpl.length) throw new Error('ยังไม่มีแม่แบบงานสำหรับประเภท "' + unit.unitType + '" (เพิ่มได้ที่หน้าตั้งค่า)');
    let seq = readTable_('Tasks').filter(t => t.unitId === unit.id)
      .reduce((m, t) => Math.max(m, Number(t.seq) || 0), 0);
    let cur = parseDate_(p.startDate || today_());
    const now = nowStr_();
    const recs = tpl.map(t => {
      const days = Math.max(1, Number(t.days) || 1);
      const rec = {
        id: newId_('TSK'), unitId: unit.id, seq: ++seq, category: t.category, title: t.title,
        detail: t.detail || '', contractor: '', startDate: fmt_(cur),
        dueDate: fmt_(addDays_(cur, days - 1)), finishDate: '', progress: 0, estCost: t.estCost || '', status: '',
        note: '', createdAt: now, updatedAt: now
      };
      rec.status = taskStatus_(rec);
      cur = addDays_(cur, days);
      return rec;
    });
    appendRows_('Tasks', recs);
    log_('applyTemplate', 'Units', unit.id, recs.length + ' งาน');
    return recs;
  });
}

/* ---------------- รูปภาพ (Google Drive) ---------------- */

function uploadPhoto_(p) {
  if (!p.unitId || !p.base64) throw new Error('ข้อมูลรูปภาพไม่ครบ');
  const unit = findById_('Units', p.unitId);
  if (!unit) throw new Error('ไม่พบห้อง/บ้าน');
  const proj = findById_('Projects', unit.projectId) || { name: 'ไม่ระบุโครงการ' };
  const folder = subFolder_(subFolder_(rootFolder_(), proj.name), String(unit.unitNo).replace(/\//g, '-'));
  const stamp = Utilities.formatDate(new Date(), APP.TZ, 'yyyyMMdd_HHmmss');
  const blob = Utilities.newBlob(Utilities.base64Decode(p.base64), p.mimeType || 'image/jpeg',
    (p.stage || 'photo') + '_' + stamp + '_' + (p.fileName || 'img.jpg'));
  const file = folder.createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    try { file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW); } catch (e2) {}
  }
  const rec = upsert_('Photos', {
    unitId: p.unitId, taskId: p.taskId || '', stage: p.stage || PHOTO_STAGES[0],
    fileId: file.getId(), caption: p.caption || '', uploadedBy: user_()
  }, 'PHO');
  return decoratePhoto_(rec);
}

/** บันทึกไฟล์ PDF (แผนงาน) ลงโฟลเดอร์ "รายงาน PDF" ใน Drive */
function savePdf_(p) {
  if (!p.base64) throw new Error('ไม่พบข้อมูลไฟล์ PDF');
  const folder = subFolder_(rootFolder_(), 'รายงาน PDF');
  const blob = Utilities.newBlob(Utilities.base64Decode(p.base64), 'application/pdf', p.fileName || ('แผนงาน_' + today_() + '.pdf'));
  const file = folder.createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  log_('savePdf', 'Reports', file.getId(), file.getName());
  return { id: file.getId(), name: file.getName(), url: file.getUrl() };
}

function deletePhoto_(p) {
  const rec = findById_('Photos', p.id);
  if (rec) trashFile_(rec.fileId);
  deleteWhere_('Photos', r => r.id === p.id);
  return { id: p.id };
}

function decoratePhoto_(p) {
  const id = p.fileId;
  p.thumb = 'https://drive.google.com/thumbnail?id=' + id + '&sz=w480';
  p.url   = 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1600';
  p.view  = 'https://drive.google.com/file/d/' + id + '/view';
  return p;
}

function trashFile_(fileId) {
  if (!fileId) return;
  try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) { console.warn('trash failed', fileId, e); }
}

function rootFolder_() {
  const id = getSetting_('photoFolderId');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const f = DriveApp.createFolder(APP.PHOTO_FOLDER);
  setSetting_('photoFolderId', f.getId());
  return f;
}

function subFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/* ============================================================
 *  Data layer (Google Sheets) — อ่าน/เขียนตามชื่อหัวคอลัมน์
 * ============================================================ */

let _ss = null;
const _hdrCache = {};

function ss_() {
  if (_ss) return _ss;
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  _ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!_ss) throw new Error('ไม่พบ Google Sheet — ให้สร้างสคริปต์จากเมนู ส่วนขยาย > Apps Script ในชีต หรือกำหนด Script Property ชื่อ SPREADSHEET_ID');
  return _ss;
}

function sheet_(name) {
  return ss_().getSheetByName(name) || ss_().insertSheet(name);
}

function typeOf_(name, key) {
  const c = (SCHEMA[name] || []).find(x => x[0] === key);
  return c ? c[1] : 's';
}

/** คืนหัวคอลัมน์ และเติมคอลัมน์ที่ขาด (รองรับการเพิ่มฟิลด์ใน SCHEMA ภายหลัง) */
function headers_(sh, name) {
  if (_hdrCache[name]) return _hdrCache[name];
  const lastCol = sh.getLastColumn();
  let hdr = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
  while (hdr.length && !hdr[hdr.length - 1]) hdr.pop();
  const missing = SCHEMA[name].map(c => c[0]).filter(k => hdr.indexOf(k) < 0);
  if (missing.length) {
    const start = hdr.length + 1;
    sh.getRange(1, start, 1, missing.length).setValues([missing]);
    hdr = hdr.concat(missing);
    sh.getRange(1, 1, 1, hdr.length).setFontWeight('bold').setBackground('#FDE6E4').setFontColor('#8A3B3B');
    sh.setFrozenRows(1);
    missing.forEach((k, i) => {
      const rows = Math.max(sh.getMaxRows() - 1, 1);
      sh.getRange(2, start + i, rows, 1).setNumberFormat(numFmt_(typeOf_(name, k)));
    });
  }
  _hdrCache[name] = hdr;
  return hdr;
}

/** รูปแบบตัวเลขในชีต: n = ตัวเลขทั่วไป, m = จำนวนเงิน (Number), อื่น ๆ = ข้อความล้วน */
function isNum_(type) { return type === 'n' || type === 'm'; }
function numFmt_(type) { return type === 'm' ? '#,##0.00' : type === 'n' ? '0.##' : '@'; }

function toCell_(v, type) {
  if (v === null || v === undefined) return '';
  if (isNum_(type)) return v === '' || isNaN(Number(String(v).replace(/,/g, ''))) ? '' : Number(String(v).replace(/,/g, ''));
  if (v instanceof Date) return type === 't' ? Utilities.formatDate(v, APP.TZ, 'yyyy-MM-dd HH:mm:ss') : fmt_(v);
  return String(v);
}

function fromCell_(v, type) {
  if (v instanceof Date) {
    return type === 't' ? Utilities.formatDate(v, APP.TZ, 'yyyy-MM-dd HH:mm:ss') : fmt_(v);
  }
  if (isNum_(type)) return v === '' ? '' : Number(v);
  return v === null || v === undefined ? '' : String(v);
}

function rowToObj_(name, hdr, row) {
  const o = {};
  hdr.forEach((h, i) => { if (h) o[h] = fromCell_(row[i], typeOf_(name, h)); });
  return o;
}

function readTable_(name) {
  const sh = sheet_(name);
  const hdr = headers_(sh, name);
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  const vals = sh.getRange(2, 1, n, hdr.length).getValues();
  const out = [];
  vals.forEach(r => { if (r.some(v => v !== '')) out.push(rowToObj_(name, hdr, r)); });
  return out;
}

function findById_(name, id) {
  return readTable_(name).find(r => r.id === id) || null;
}

function findRow_(sh, hdr, keyCol, value) {
  const col = hdr.indexOf(keyCol) + 1;
  const n = sh.getLastRow() - 1;
  if (n < 1 || col < 1) return -1;
  const ids = sh.getRange(2, col, n, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(value)) return i + 2;
  return -1;
}

function writeRow_(sh, name, hdr, rowIdx, rec) {
  const row = hdr.map(h => toCell_(rec[h], typeOf_(name, h)));
  const fmts = hdr.map(h => numFmt_(typeOf_(name, h)));
  sh.getRange(rowIdx, 1, 1, hdr.length).setNumberFormats([fmts]).setValues([row]);
  return row;
}

function upsert_(name, obj, prefix) {
  return withLock_(() => {
    const sh = sheet_(name);
    const hdr = headers_(sh, name);
    const now = nowStr_();
    let rowIdx = -1, existing = {};
    if (obj.id) {
      rowIdx = findRow_(sh, hdr, 'id', obj.id);
      if (rowIdx > 0) existing = rowToObj_(name, hdr, sh.getRange(rowIdx, 1, 1, hdr.length).getValues()[0]);
    }
    const clean = {};
    Object.keys(obj).forEach(k => { if (hdr.indexOf(k) >= 0) clean[k] = obj[k]; });
    const rec = Object.assign({}, existing, clean);
    if (!rec.id) rec.id = newId_(prefix);
    if (hdr.indexOf('createdAt') >= 0 && !rec.createdAt) rec.createdAt = now;
    if (hdr.indexOf('updatedAt') >= 0) rec.updatedAt = now;
    const isNew = rowIdx < 0;
    if (isNew) rowIdx = sh.getLastRow() + 1;
    const row = writeRow_(sh, name, hdr, rowIdx, rec);
    if (name !== 'Logs') log_(isNew ? 'create' : 'update', name, rec.id, rec.title || rec.name || rec.unitNo || '');
    return rowToObj_(name, hdr, row);
  });
}

function appendRows_(name, recs) {
  if (!recs.length) return;
  withLock_(() => {
    const sh = sheet_(name);
    const hdr = headers_(sh, name);
    const rows = recs.map(r => hdr.map(h => toCell_(r[h], typeOf_(name, h))));
    const fmts = recs.map(() => hdr.map(h => numFmt_(typeOf_(name, h))));
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, hdr.length).setNumberFormats(fmts).setValues(rows);
  });
}

function deleteWhere_(name, pred) {
  return withLock_(() => {
    const sh = sheet_(name);
    const hdr = headers_(sh, name);
    const n = sh.getLastRow() - 1;
    if (n < 1) return 0;
    const vals = sh.getRange(2, 1, n, hdr.length).getValues();
    let count = 0;
    for (let i = vals.length - 1; i >= 0; i--) {
      if (pred(rowToObj_(name, hdr, vals[i]))) { sh.deleteRow(i + 2); count++; }
    }
    return count;
  });
}

function getSetting_(key) {
  const r = readTable_('Settings').find(x => x.key === key);
  return r ? r.value : '';
}

function setSetting_(key, value) {
  withLock_(() => {
    const sh = sheet_('Settings');
    const hdr = headers_(sh, 'Settings');
    let row = findRow_(sh, hdr, 'key', key);
    if (row < 0) row = sh.getLastRow() + 1;
    writeRow_(sh, 'Settings', hdr, row, { key: key, value: value });
  });
}

function log_(action, entity, id, detail) {
  try {
    appendRows_('Logs', [{ timestamp: nowStr_(), user: user_(), action: action, entity: entity, entityId: id, detail: detail }]);
  } catch (e) { console.warn('log failed', e); }
}

/* ============================================================
 *  Helpers
 * ============================================================ */

let _lockDepth = 0;
function withLock_(fn) {
  if (_lockDepth > 0) { _lockDepth++; try { return fn(); } finally { _lockDepth--; } }
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  _lockDepth = 1;
  try { return fn(); } finally { _lockDepth = 0; SpreadsheetApp.flush(); lock.releaseLock(); }
}

function newId_(prefix) {
  return (prefix || 'ID') + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
}
function user_() {
  try { return Session.getActiveUser().getEmail() || ''; } catch (e) { return ''; }
}
function fmt_(d) { return Utilities.formatDate(d, APP.TZ, 'yyyy-MM-dd'); }
function today_() { return fmt_(new Date()); }
function nowStr_() { return Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd HH:mm:ss'); }
function parseDate_(s) { const p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function addDays_(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfDay_(d) { return parseDate_(fmt_(d)); }
