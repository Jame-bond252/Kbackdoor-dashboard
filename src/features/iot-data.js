// ===== ข้อมูล IoT ชุดเก่า: legacy / serial ตู้ / รหัสฐาน manual / เช็คลิสต์เอกสาร / ติดตั้งไม่ได้ =====
// แยกมาจาก main.js เดิม — ตัวแปร/ฟังก์ชันแชร์ผ่าน window (โค้ดเดิมออกแบบเป็น global scope)
   // "ชื่อ|นามสกุล" (normalize แล้ว) -> รหัสฐาน

async function loadIotLegacyPendingMap() {
  if (!supabaseClient) return;
  let rows = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseClient
      .from('iot_farmers_legacy')
      .select('reference_id, base_code, base_code_no, first_name, last_name, phone, water_pump, pipe_size, water_source, irrigation_type, payment_status, document_status, photo1_status, photo2_status, photo3_status, photo4_status, handover_video_status, plot_location')
      .not('base_code', 'is', null)
      .range(from, from + pageSize - 1);
    if (error) {
      console.warn('โหลดข้อมูลเกษตรกร IoT ชุดเก่าไม่สำเร็จ:', error.message);
      return;
    }
    rows = rows.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  iotLegacyByRefId = new Map();
  iotLegacyByPhone = new Map();
  iotLegacyByName = new Map();
  rows.forEach(r => {
    const rec = {
      base_code: r.base_code || '',
      base_code_no: (r.base_code_no === null || r.base_code_no === undefined) ? null : r.base_code_no,
      water_pump: r.water_pump || '',
      pipe_size: r.pipe_size || '',
      water_source: r.water_source || '',
      irrigation_type: r.irrigation_type || '',
      payment_status: r.payment_status || '',
      document_status: r.document_status || '',
      photo1_status: r.photo1_status || '',
      photo2_status: r.photo2_status || '',
      photo3_status: r.photo3_status || '',
      photo4_status: r.photo4_status || '',
      handover_video_status: r.handover_video_status || '',
      plot_location: r.plot_location || '',
    };
    if (r.reference_id) iotLegacyByRefId.set(r.reference_id, rec);
    const phone = (r.phone || '').trim();
    if (phone) iotLegacyByPhone.set(phone, rec);
    const nameKey = buildNameKey(r.first_name, r.last_name);
    if (nameKey) iotLegacyByName.set(nameKey, rec);
  });
}

/* ===== หมายเหตุจาก master plan (ชีต) — คอลัมน์ note ของ iot_farmers_legacy =====
   โหลดแยกจาก loadIotLegacyPendingMap เพราะตัวนั้นกรองเฉพาะแถวที่มี base_code
   แต่คนที่ถูกกรอกหมายเหตุไว้ส่วนใหญ่ยังไม่มีรหัสฐาน (ยังไม่ได้ติดตั้ง) จึงต้องดึงทั้งหมด */
window.iotSheetNoteByRefId = new Map();
window.iotSheetNoteByPhone = new Map();
window.iotSheetNoteByName = new Map();

async function loadIotSheetNotes() {
  if (!supabaseClient) return;
  let rows = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseClient
      .from('iot_farmers_legacy')
      .select('reference_id, first_name, last_name, phone, note')
      .not('note', 'is', null)
      .range(from, from + pageSize - 1);
    if (error) {
      console.warn('โหลดหมายเหตุจากชีตไม่สำเร็จ:', error.message);
      return;
    }
    rows = rows.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  iotSheetNoteByRefId = new Map();
  iotSheetNoteByPhone = new Map();
  iotSheetNoteByName = new Map();
  rows.forEach(r => {
    const note = String(r.note || '').trim();
    if (!note) return;
    if (r.reference_id) iotSheetNoteByRefId.set(r.reference_id, note);
    const phone = (r.phone || '').trim();
    if (phone) iotSheetNoteByPhone.set(phone, note);
    const nameKey = buildNameKey(r.first_name, r.last_name);
    if (nameKey) iotSheetNoteByName.set(nameKey, note);
  });
}

/** หมายเหตุที่ทีมกรอกไว้ในชีต master plan ของเกษตรกรคนนี้ ('' ถ้าไม่มี)
 *  จับคู่ตามลำดับ: รหัสอ้างอิง -> เบอร์โทร -> ชื่อ-นามสกุล (เหมือน findIotLegacyRecord) */
function getIotSheetNote(r) {
  if (!r) return '';
  if (r.reference_id && iotSheetNoteByRefId.has(r.reference_id)) return iotSheetNoteByRefId.get(r.reference_id);
  const phone = (r.phone || '').trim();
  if (phone && iotSheetNoteByPhone.has(phone)) return iotSheetNoteByPhone.get(phone);
  const nameKey = buildNameKey(r.first_name, r.last_name);
  if (nameKey && iotSheetNoteByName.has(nameKey)) return iotSheetNoteByName.get(nameKey);
  return '';
}

/** หมายเหตุจากชีต โดยอ้างอิงจากเลขบัตรประชาชน (ใช้ในโหมดโทรนัดที่มีแค่ nid) */
function getIotSheetNoteByNationalId(nid) {
  if (!nid || typeof allIotRows === 'undefined') return '';
  const row = allIotRows.find(r => r.national_id === nid);
  return row ? getIotSheetNote(row) : '';
}

// หา record ข้อมูลเก่า (รหัสฐาน + base_code_no) ถ้าเกษตรกรคนนี้ (r = แถวจาก iot_farmers ปัจจุบัน) ตรงกับข้อมูลเก่าข้อใดข้อหนึ่ง:
// รหัสอ้างอิง / เบอร์โทร / ชื่อ-นามสกุล — เจอข้อใดข้อหนึ่งถือว่าเป็นคนเดียวกัน คืนค่า null ถ้าไม่เจอเลย
function findIotLegacyRecord(r) {
  if (r.reference_id && iotLegacyByRefId.has(r.reference_id)) return iotLegacyByRefId.get(r.reference_id);
  const phone = (r.phone || '').trim();
  if (phone && iotLegacyByPhone.has(phone)) return iotLegacyByPhone.get(phone);
  const nameKey = buildNameKey(r.first_name, r.last_name);
  if (nameKey && iotLegacyByName.has(nameKey)) return iotLegacyByName.get(nameKey);
  return null;
}

// หา "รหัสฐาน" จากข้อมูลเก่า (string) — คืนค่า null ถ้าไม่เจอเลย ใช้ในจุดที่ต้องการแค่รหัสฐาน (เช่น mutation สถานะติดตั้ง)
function findIotLegacyBaseCode(r) {
  const rec = findIotLegacyRecord(r);
  return rec ? rec.base_code : null;
}

// หาข้อมูลเตรียมติดตั้งจากข้อมูลเก่า (ปั๊มน้ำ / ขนาดท่อ / การชำระเงิน) เพื่อให้ทีมติดตั้งรู้ล่วงหน้าว่าต้องเตรียมอะไรบ้าง
// คืนค่าฟิลด์ว่าง ('') ทั้งหมดถ้าจับคู่กับข้อมูลเก่าไม่เจอเลย (ไม่ error)
function findIotLegacyInstallInfo(r) {
  const rec = findIotLegacyRecord(r);
  return {
    waterPump: rec ? (rec.water_pump || '') : '',
    pipeSize: rec ? (rec.pipe_size || '') : '',
    paymentStatus: rec ? (rec.payment_status || '') : '',
  };
}

// ===== ข้อมูลตู้/Serial Board ชุดเก่า (iot_cabinet_serials) — ใช้หา "SN ตู้จากข้อมูลเก่า" ให้คนที่ยังไม่เชื่อมแอป =====
window.iotCabinetSerialByNo = new Map(); // เลขฐาน (base_code_no) -> serial_board

async function loadIotCabinetSerials() {
  if (!supabaseClient) return;
  let rows = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseClient
      .from('iot_cabinet_serials')
      .select('no, serial_board')
      .range(from, from + pageSize - 1);
    if (error) {
      console.warn('โหลดข้อมูลตู้/Serial Board ชุดเก่าไม่สำเร็จ:', error.message);
      return;
    }
    rows = rows.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  iotCabinetSerialByNo = new Map();
  rows.forEach(r => { if ((r.no !== null && r.no !== undefined) && r.serial_board) iotCabinetSerialByNo.set(r.no, r.serial_board); });
}

// หา SN ตู้จากข้อมูลเก่า (ชีตติดตามตู้/Serial Board) ผ่านรหัสฐานที่จับคู่ได้ — ใช้เป็นข้อมูลอ้างอิงเสริมสำหรับคนที่ยังไม่เชื่อมแอปจริง
// (ยังไม่ยืนยันผ่านแอป จึงต้องแยกคอลัมน์จาก "SN ตู้ (จากแอป)" เสมอ ห้ามเอามาปนกัน)
function findIotLegacySerial(r) {
  const rec = findIotLegacyRecord(r);
  if (!rec || rec.base_code_no === null) return null;
  return iotCabinetSerialByNo.get(rec.base_code_no) || null;
}

// ===== รหัสฐานที่ admin กรอกเองด้วยมือ (iot_manual_base_codes) — ใช้เมื่อจับคู่อัตโนมัติกับข้อมูลแอปไม่เจอ =====
// (เช่น บัญชีแอปที่เชื่อมมาชื่อไม่ตรงกับคนที่ได้รับตู้จริง) จับคู่ด้วย reference_id ตรงๆ เพราะ admin เลือกคนที่ถูกต้องเองแล้วตอนกรอก
window.iotManualBaseCodes = [];               // แถวดิบทั้งหมดจาก Supabase
window.iotManualBaseCodeByRefId = new Map();  // reference_id -> แถว

async function loadIotManualBaseCodes() {
  if (!supabaseClient) return;
  let rows = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseClient
      .from('iot_manual_base_codes')
      .select('*')
      .range(from, from + pageSize - 1);
    if (error) {
      console.warn('โหลดรายการรหัสฐานที่กรอกเองไม่สำเร็จ:', error.message);
      return;
    }
    rows = rows.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  iotManualBaseCodes = rows;
  iotManualBaseCodeByRefId = new Map();
  rows.forEach(rec => { if (rec.reference_id) iotManualBaseCodeByRefId.set(rec.reference_id, rec); });
}

// แปลงข้อความที่ admin พิมพ์ (เช่น "AR_0008", "ar 8", "8") ให้เป็นเลขฐาน + รูปแบบมาตรฐาน "AR_0008"
// คืนค่า null ถ้าไม่มีตัวเลขในข้อความเลย (กรอกผิด)
function parseManualBaseCodeInput(input) {
  const match = (input || '').match(/\d+/);
  if (!match) return null;
  const no = parseInt(match[0], 10);
  if (!Number.isFinite(no)) return null;
  return { no, formatted: 'AR_' + String(no).padStart(4, '0') };
}

// จัดรูปแบบเลขฐาน (base_code_no ที่เชื่อถือได้ ตัวเลขล้วน จับคู่กับ iot_cabinet_serials.no ได้เป๊ะ) ให้เป็น "AR_XXXX" เสมอ
// ไม่ใช้ข้อความ base_code ดิบจากชีตเก่าตรงๆ เพราะบางแถวมีชื่อจังหวัด/หมายเหตุต่อท้ายมาแบบไม่คงที่ (เช่น "AR_0023_สระแก้ว", "AR_0000_สระแก้ว ไม่มีรูป")
function formatIotArCode(no) {
  return (no === null || no === undefined) ? null : 'AR_' + String(no).padStart(4, '0');
}

function findIotManualBaseCode(r) {
  if (!r.reference_id) return null;
  const rec = iotManualBaseCodeByRefId.get(r.reference_id);
  if (!rec) return null;
  return { base_code: rec.base_code, base_code_no: rec.base_code_no };
}

// คนนี้มี "รหัสฐาน" อยู่แล้วไหม (กรอกเอง หรือมีในชีต Master Plan) — ถ้ามีแล้วไม่ต้องเอาไปขึ้นลิสต์กรอกรหัสฐานเองซ้ำ
function iotHasKnownBaseCode(r) {
  if (!r) return false;
  if (findIotManualBaseCode(r)) return true;
  const rec = findIotLegacyRecord(r);
  return !!(rec && rec.base_code);
}

// ===== เช็คลิสต์เอกสาร/ภาพ/วีดีโอ (iot_document_checklist) — ค่าที่ admin ยืนยันเองผ่านเว็บ =====
// ตอนแรกโชว์ค่าเริ่มต้นจากชีตเก่า (document_status/photo1-4_status/handover_video_status) ให้ดูก่อนเฉยๆ
// แต่พอ admin ติ๊ก/แก้ในเว็บนี้ครั้งแรก ค่าที่กรอกในตารางนี้จะกลายเป็นค่าหลักตลอดไป (ไม่อิงชีตเก่าอีก)
window.IOT_DOC_CHECKLIST_ITEMS = [
  { key: 'document', label: 'เอกสาร' },
  { key: 'photo1', label: 'ภาพ 1 คู่สวนทุเรียน' },
  { key: 'photo2', label: 'ภาพ 2 คู่ IOT' },
  { key: 'photo3', label: 'ภาพ 3 การอบรม (2 คน)' },
  { key: 'photo4', label: 'ภาพ 4 ตู้ (เห็นสติ๊กเกอร์)' },
  { key: 'video', label: 'วีดีโอส่งมอบงาน' },
];

window.iotDocChecklistByRefId = new Map(); // reference_id -> แถวจาก iot_document_checklist

async function loadIotDocChecklist() {
  if (!supabaseClient) return;
  let rows = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseClient
      .from('iot_document_checklist')
      .select('*')
      .range(from, from + pageSize - 1);
    if (error) {
      console.warn('โหลดเช็คลิสต์เอกสารไม่สำเร็จ:', error.message);
      return;
    }
    rows = rows.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  iotDocChecklistByRefId = new Map();
  rows.forEach(rec => { if (rec.reference_id) iotDocChecklistByRefId.set(rec.reference_id, rec); });
}

// คืนค่าสถานะเช็คลิสต์ปัจจุบันของคนนี้ทีละรายการ (ครบ 6 อย่างเสมอ) — ใช้ค่าที่ admin กรอกเองก่อน
// ถ้ายังไม่เคยกรอกเลยสักอย่าง (ไม่มีแถวใน iot_document_checklist) ใช้ค่าเริ่มต้นจากชีตเก่าเป็นจุดตั้งต้น
function getIotDocChecklistState(r) {
  const saved = r.reference_id ? iotDocChecklistByRefId.get(r.reference_id) : null;
  const legacyRec = findIotLegacyRecord(r);
  const legacyValueByKey = {
    document: legacyRec ? legacyRec.document_status : '',
    photo1: legacyRec ? legacyRec.photo1_status : '',
    photo2: legacyRec ? legacyRec.photo2_status : '',
    photo3: legacyRec ? legacyRec.photo3_status : '',
    photo4: legacyRec ? legacyRec.photo4_status : '',
    video: legacyRec ? legacyRec.handover_video_status : '',
  };
  return IOT_DOC_CHECKLIST_ITEMS.map(item => {
    const savedField = saved ? saved[item.key + '_ok'] : null;
    if (savedField !== null && savedField !== undefined) {
      return { key: item.key, label: item.label, ok: !!savedField, source: 'admin' };
    }
    const legacyVal = legacyValueByKey[item.key];
    return { key: item.key, label: item.label, ok: !!(legacyVal && legacyVal.includes('เรียบร้อย')), source: legacyVal ? 'legacy' : 'none' };
  });
}

window.iotDocChecklistModalRefId = null;

// รับข้อความตำแหน่งแปลงจากชีตเก่า (อาจเป็นลิงก์เต็มอยู่แล้ว หรือแค่ข้อความพิกัด) แปลงให้เป็นลิงก์ Google Maps ที่กดได้เสมอ
// ===== สถานะ "ติดตั้งไม่ได้" (iot_install_blockers) — ค่าที่ admin ทำเครื่องหมายเองผ่านเว็บ =====
// แยกอิสระจากสถานะในแผนติดตั้งโดยตั้งใจ: ทำเครื่องหมายได้ทั้งก่อนเข้าแผนหรือระหว่างอยู่ในแผน และยกเลิกเครื่องหมายเมื่อไหร่ก็ได้
window.iotInstallBlockersByRefId = new Map();

async function loadIotInstallBlockers() {
  if (!supabaseClient) return;
  let rows = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseClient
      .from('iot_install_blockers')
      .select('*')
      .range(from, from + pageSize - 1);
    if (error) {
      console.warn('โหลดรายชื่อติดตั้งไม่ได้ไม่สำเร็จ:', error.message);
      return;
    }
    rows = rows.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  iotInstallBlockersByRefId = new Map();
  rows.forEach(rec => { if (rec.reference_id) iotInstallBlockersByRefId.set(rec.reference_id, rec); });
}

function getIotInstallBlockerState(r) {
  if (!r || !r.reference_id) return null;
  return iotInstallBlockersByRefId.get(r.reference_id) || null;
}

// ใช้จากแถวในแผนติดตั้ง ซึ่งเก็บแค่เลขบัตรประชาชน ไม่ได้เก็บ reference_id ตรงๆ เลยต้องย้อนไปหาแถวเกษตรกรก่อน
function getIotInstallBlockerStateByNationalId(nid) {
  if (!nid || !iotDataLoaded) return null;
  const r = allIotRows.find(row => row.national_id === nid);
  return r ? getIotInstallBlockerState(r) : null;
}

window.iotInstallBlockerModalRefId = null;

function isInstallBlockerReasonPreset(reason) {
  const select = document.getElementById('installBlockerReasonSelect');
  if (!select) return false;
  return [...select.options].some(o => o.value === reason);
}

function openIotInstallBlockerModal(referenceId) {
  const r = allIotRows.find(row => row.reference_id === referenceId);
  if (!r) return;
  iotInstallBlockerModalRefId = referenceId;
  const fullName = `${r.prefix || ''}${r.first_name || ''} ${r.last_name || ''}`.trim();
  const nameEl = document.getElementById('installBlockerModalName');
  if (nameEl) nameEl.textContent = `ทำเครื่องหมายว่าติดตั้งไม่ได้ — ${fullName || 'ไม่ทราบชื่อ'}`;
  const existing = getIotInstallBlockerState(r);
  const select = document.getElementById('installBlockerReasonSelect');
  const customInput = document.getElementById('installBlockerReasonCustom');
  if (select) {
    const isPreset = existing && isInstallBlockerReasonPreset(existing.reason);
    select.value = existing ? (isPreset ? existing.reason : '__custom__') : '';
    if (customInput) {
      customInput.style.display = (select.value === '__custom__') ? '' : 'none';
      customInput.value = (existing && !isPreset) ? (existing.reason || '') : '';
    }
  }
  const removeBtn = document.getElementById('installBlockerModalRemove');
  if (removeBtn) removeBtn.style.display = existing ? '' : 'none';
  const overlay = document.getElementById('installBlockerModalOverlay');
  if (overlay) overlay.style.display = 'flex';
}

// เปิดโมดัลจากแถวในแผนติดตั้ง (มีแค่เลขบัตรประชาชน ไม่มี reference_id ตรงๆ)
function openIotInstallBlockerModalByNationalId(nid) {
  const r = allIotRows.find(row => row.national_id === nid);
  if (!r || !r.reference_id) {
    showToast('ไม่พบข้อมูลอ้างอิงของคนนี้ในระบบ ลองไปที่แท็บ "ติดตั้งไม่ได้"แทนครับ', 'warn');
    return;
  }
  openIotInstallBlockerModal(r.reference_id);
}

function onInstallBlockerReasonChange() {
  const select = document.getElementById('installBlockerReasonSelect');
  const customInput = document.getElementById('installBlockerReasonCustom');
  if (!select || !customInput) return;
  customInput.style.display = select.value === '__custom__' ? '' : 'none';
}

function closeIotInstallBlockerModal() {
  const overlay = document.getElementById('installBlockerModalOverlay');
  if (overlay) overlay.style.display = 'none';
  iotInstallBlockerModalRefId = null;
  if (typeof iotCallDeclineNid !== 'undefined') iotCallDeclineNid = null;
}

function refreshAfterIotInstallBlockerChange() {
  renderIotBlockerSearchResults();
  renderIotBlockerList();
  renderIotCancelledLegacyList();
  if (iotDataLoaded) applyIotPlanFilters();
  // คิวโทรนัดกรองคนที่ "ติดตั้งไม่ได้" ออก -> วาดใหม่ให้ตรงกันเสมอ
  const callView = document.getElementById('iotPlanCallView');
  if (callView && getComputedStyle(callView).display !== 'none' && typeof renderIotCallView === 'function') renderIotCallView();
}

async function saveIotInstallBlockerModal() {
  if (blockIfReadOnly()) return;
  if (!iotInstallBlockerModalRefId) return;
  if (!supabaseClient) { showToast('ยังไม่ได้เชื่อมต่อ Supabase', 'warn'); return; }
  const referenceId = iotInstallBlockerModalRefId;
  const r = allIotRows.find(row => row.reference_id === referenceId);
  const select = document.getElementById('installBlockerReasonSelect');
  const customInput = document.getElementById('installBlockerReasonCustom');
  let reason = select ? select.value : '';
  if (reason === '__custom__') reason = customInput ? customInput.value.trim() : '';
  if (!reason) { showToast('กรุณาเลือกหรือพิมพ์เหตุผลก่อนครับ', 'warn'); return; }
  const payload = { reference_id: referenceId, reason, marked_by: currentUserName || null, marked_at: new Date().toISOString() };
  const { error } = await supabaseClient.from('iot_install_blockers').upsert(payload, { onConflict: 'reference_id' });
  if (error) {
    showToast('บันทึกไม่สำเร็จ: ' + error.message, 'warn');
    return;
  }
  iotInstallBlockersByRefId.set(referenceId, payload);
  closeIotInstallBlockerModal();
  refreshAfterIotInstallBlockerChange();
  // ถ้าสั่งมาจากโหมดโทรนัด: ปิดงานคนนี้ในคิวแล้วเลื่อนไปคนถัดไปให้เลย
  if (typeof iotCallDeclineNid !== 'undefined' && iotCallDeclineNid && r && r.national_id === iotCallDeclineNid) {
    const nid = iotCallDeclineNid;
    iotCallDeclineNid = null;
    if (typeof iotCallAfterDecline === 'function') iotCallAfterDecline(nid);
  }
  showToast(`ทำเครื่องหมาย ${r && r.first_name ? r.first_name : 'คนนี้'} ว่าติดตั้งไม่ได้แล้วครับ`, 'success');
}

async function removeIotInstallBlockerModal() {
  if (blockIfReadOnly()) return;
  if (!iotInstallBlockerModalRefId) return;
  if (!supabaseClient) { showToast('ยังไม่ได้เชื่อมต่อ Supabase', 'warn'); return; }
  const referenceId = iotInstallBlockerModalRefId;
  const r = allIotRows.find(row => row.reference_id === referenceId);
  const { error } = await supabaseClient.from('iot_install_blockers').delete().eq('reference_id', referenceId);
  if (error) {
    showToast('ยกเลิกเครื่องหมายไม่สำเร็จ: ' + error.message, 'warn');
    return;
  }
  iotInstallBlockersByRefId.delete(referenceId);
  closeIotInstallBlockerModal();
  refreshAfterIotInstallBlockerChange();
  showToast(`ยกเลิกเครื่องหมายติดตั้งไม่ได้ให้ ${r && r.first_name ? r.first_name : 'คนนี้'} แล้วครับ`, 'success');
}

// ค้นหาใครก็ได้ในระบบ (ไม่ว่าจะติดสถานะนี้อยู่แล้วหรือไม่) เพื่อทำเครื่องหมาย/แก้ไขเหตุผล
function renderIotBlockerSearchResults() {
  const input = document.getElementById('iotBlockerSearchInput');
  const tbody = document.getElementById('iotBlockerSearchTbody');
  if (!input || !tbody) return;
  const term = input.value.trim();
  if (!term) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state-cell"><span class="empty-text">พิมพ์ชื่อ/เลขบัตร/เบอร์ด้านบนเพื่อค้นหาคนที่จะทำเครื่องหมายครับ</span></td></tr>`;
    return;
  }
  const rows = getIotVisibleRows().filter(r => matchesIotFarmerSearch(r, term)).slice(0, 30);
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state-cell"><span class="empty-icon"><i data-icon="search" data-size="15"></i></span><span class="empty-text">ไม่พบคนที่ตรงกับคำค้นหาครับ</span></td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r => {
    const fullName = `${r.prefix || ''}${r.first_name || ''} ${r.last_name || ''}`.trim();
    const blocker = getIotInstallBlockerState(r);
    const refIdSafe = (r.reference_id || '').replace(/'/g, "\\'");
    return `
      <tr>
        <td>${fullName || '-'}</td>
        <td>${r.national_id || '-'}</td>
        <td>${r.phone || '-'}</td>
        <td>${getIotStatusDisplayHtml(r)}</td>
        <td style="white-space:nowrap;">
          <button type="button" class="btn-linklike" onclick="openIotInstallBlockerModal('${refIdSafe}')" ${r.reference_id ? '' : 'disabled'}>${blocker ? '<i data-icon="edit" data-size="15"></i> แก้ไขเหตุผล' : '<i data-icon="blocked" data-size="15"></i> ทำเครื่องหมาย'}</button>
        </td>
      </tr>
    `;
  }).join('');
}

// รายชื่อทุกคนที่ติดสถานะ "ติดตั้งไม่ได้" อยู่ตอนนี้ ค้นหาต่อในรายการนี้ได้
// คนที่ถูกกด "สละสิทธิ์" ในแผนติดตั้งไว้ แต่ยังไม่มีเหตุผลในตาราง iot_install_blockers
// (เคสเก่าก่อนเปลี่ยนปุ่มให้บังคับเลือกเหตุผล) — โชว์ไว้เพื่อไม่ให้รายชื่อหายไปจากระบบ
function getIotCancelledWithoutBlocker() {
  if (typeof iotInstallPlan === 'undefined' || !iotDataLoaded) return [];
  const out = [];
  iotInstallPlan.forEach(p => {
    if (p.status !== 'cancelled') return;
    const r = allIotRows.find(row => row.national_id === p.nationalId);
    if (!r) return;
    if (getIotInstallBlockerState(r)) return; // มีเหตุผลแล้ว อยู่ในรายการหลักด้านล่าง
    out.push({ entry: p, row: r });
  });
  return out;
}

function renderIotCancelledLegacyList() {
  const section = document.getElementById('iotCancelledLegacySection');
  const tbody = document.getElementById('iotCancelledLegacyTbody');
  if (!section || !tbody) return;
  const list = getIotCancelledWithoutBlocker();
  section.style.display = list.length ? '' : 'none';
  const badge = document.getElementById('iotCancelledLegacyBadge');
  if (badge) badge.textContent = `${list.length.toLocaleString()} รายการ`;
  if (!list.length) { tbody.innerHTML = ''; return; }

  tbody.innerHTML = list.map(({ entry, row }) => {
    const fullName = `${row.prefix || ''}${row.first_name || ''} ${row.last_name || ''}`.trim();
    const refIdSafe = (row.reference_id || '').replace(/'/g, "\\'");
    const nidSafe = (row.national_id || '').replace(/'/g, "\\'");
    return `
      <tr>
        <td class="cell-strong">${fullName || '-'}</td>
        <td>${row.national_id || '-'}</td>
        <td>${row.phone || '-'}</td>
        <td>${row[IOT_FIELDS.province] || '-'}</td>
        <td>${row[IOT_FIELDS.district] || '-'}</td>
        <td style="white-space:nowrap;">
          <button type="button" class="btn btn-outline btn-sm" onclick="openIotInstallBlockerModal('${refIdSafe}')">${icon('blocked', 14)} ใส่เหตุผล</button>
          <button type="button" class="btn btn-brand btn-sm" onclick="restoreIotCancelledToQueue('${nidSafe}')" title="ล้างสถานะสละสิทธิ์ แล้วกลับเข้าคิวโทรนัด">${icon('undo', 14)} ดึงกลับเข้าคิว</button>
        </td>
      </tr>
    `;
  }).join('');
}

// ดึงคนที่เคยกดสละสิทธิ์กลับเข้าคิวโทรนัด (ล้างสถานะ + ยกเลิกการยืนยันแผน)
async function restoreIotCancelledToQueue(nid) {
  if (blockIfReadOnly()) return;
  const entry = iotInstallPlan.find(p => p.nationalId === nid);
  if (!entry) return;
  const row = allIotRows.find(r => r.national_id === nid) || {};
  const name = `${row.prefix || ''}${row.first_name || ''} ${row.last_name || ''}`.trim() || 'คนนี้';
  const ok = await showConfirmModal(`ดึง ${name} กลับเข้าคิวโทรนัดใหม่ใช่ไหมครับ? (สถานะจะกลับเป็น "รอติดตั้ง")`);
  if (!ok) return;
  entry.status = 'pending';
  entry.planFinalized = false;
  saveIotPlanToStorage();
  syncIotPlanEntriesToSupabase([entry]);
  renderIotCancelledLegacyList();
  if (typeof applyIotPlanFilters === 'function') applyIotPlanFilters();
  const callView = document.getElementById('iotPlanCallView');
  if (callView && getComputedStyle(callView).display !== 'none' && typeof renderIotCallView === 'function') renderIotCallView();
  showToast(`ดึง ${name} กลับเข้าคิวโทรนัดแล้วครับ`, 'success');
}

function renderIotBlockerList() {
  const searchEl = document.getElementById('iotBlockerListSearch');
  const tbody = document.getElementById('iotBlockerListTbody');
  if (!tbody) return;
  const term = searchEl ? searchEl.value.trim() : '';
  const countBadge = document.getElementById('iotBlockerListCountBadge');
  if (countBadge) countBadge.textContent = `${iotInstallBlockersByRefId.size.toLocaleString()} รายการ`;

  let rows = getIotVisibleRows().filter(r => getIotInstallBlockerState(r));
  if (term) rows = rows.filter(r => matchesIotFarmerSearch(r, term));

  if (!rows.length) {
    const msg = iotInstallBlockersByRefId.size ? 'ไม่พบรายการที่ตรงกับคำค้นหา' : 'ยังไม่มีใครติดสถานะนี้เลยครับ';
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state-cell"><span class="empty-icon"><i data-icon="sparkles" data-size="15"></i></span><span class="empty-text">${msg}</span></td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const fullName = `${r.prefix || ''}${r.first_name || ''} ${r.last_name || ''}`.trim();
    const blocker = getIotInstallBlockerState(r);
    const refIdSafe = (r.reference_id || '').replace(/'/g, "\\'");
    return `
      <tr>
        <td>${fullName || '-'}</td>
        <td>${r.national_id || '-'}</td>
        <td>${r.phone || '-'}</td>
        <td>${blocker.reason || '-'}</td>
        <td>${blocker.marked_by || '-'}</td>
        <td>${blocker.marked_at ? formatRelativeTime(blocker.marked_at) : '-'}</td>
        <td style="white-space:nowrap;">
          <button type="button" class="btn-linklike" onclick="openIotInstallBlockerModal('${refIdSafe}')"><i data-icon="edit" data-size="15"></i> แก้ไข</button>
        </td>
      </tr>
    `;
  }).join('');
}

function getIotPlotLocationLinkHtml(value) {
  const v = (value || '').trim();
  if (!v) return '-';
  const url = v.startsWith('http') ? v : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v)}`;
  const urlSafe = url.replace(/"/g, '&quot;');
  const labelSafe = v.replace(/</g, '&lt;');
  return `<a href="${urlSafe}" target="_blank" rel="noopener">${labelSafe}</a>`;
}

// คืนค่า "ตำแหน่งแปลง" ปัจจุบันของคนนี้ — ใช้ค่าที่ admin กรอกเองในเว็บก่อนเสมอ (แม้จะกรอกเป็นค่าว่างก็ถือว่าตั้งใจแล้ว ไม่ย้อนไปใช้ชีตเก่า)
// ถ้ายังไม่เคยกรอกเลย (ไม่มี key นี้ในแถวที่บันทึกไว้) ใช้ค่าเริ่มต้นจากชีตเก่าเป็นจุดตั้งต้น
function getIotPlotLocationState(r) {
  const saved = r.reference_id ? iotDocChecklistByRefId.get(r.reference_id) : null;
  if (saved && saved.plot_location !== null && saved.plot_location !== undefined) {
    return { value: saved.plot_location, source: 'admin' };
  }
  const legacyRec = findIotLegacyRecord(r);
  const legacyVal = legacyRec ? legacyRec.plot_location : '';
  return { value: legacyVal || '', source: legacyVal ? 'legacy' : 'none' };
}

// อัปเดตปุ่ม "เปิดแผนที่" ในโมดัลเช็คลิสต์ให้ตรงกับค่าที่พิมพ์ล่าสุด (รองรับทั้งลิงก์เต็มและพิกัด/คำอธิบายธรรมดา)
function updateIotDocChecklistPlotLink(value) {
  const linkEl = document.getElementById('docChecklistModalPlotLocationLink');
  if (!linkEl) return;
  const v = (value || '').trim();
  if (!v) { linkEl.style.display = 'none'; return; }
  const url = v.startsWith('http') ? v : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v)}`;
  linkEl.href = url;
  linkEl.style.display = 'inline-block';
}

function openIotDocChecklistModal(referenceId) {
  const r = allIotRows.find(row => row.reference_id === referenceId);
  if (!r) return;
  iotDocChecklistModalRefId = referenceId;
  const nameEl = document.getElementById('docChecklistModalName');
  const fullName = `${r.prefix || ''}${r.first_name || ''} ${r.last_name || ''}`.trim();
  if (nameEl) nameEl.textContent = `เช็คลิสต์เอกสาร — ${fullName || 'ไม่ทราบชื่อ'}`;
  const plotState = getIotPlotLocationState(r);
  const plotInputEl = document.getElementById('docChecklistModalPlotLocationInput');
  if (plotInputEl) plotInputEl.value = plotState.value;
  updateIotDocChecklistPlotLink(plotState.value);
  const plotSourceEl = document.getElementById('docChecklistModalPlotLocationSource');
  if (plotSourceEl) plotSourceEl.textContent = plotState.source === 'admin' ? '(แก้ไขแล้ว)' : plotState.source === 'legacy' ? '(จากข้อมูลเก่า)' : '(ยังไม่มีข้อมูล)';
  const items = getIotDocChecklistState(r);
  const itemsEl = document.getElementById('docChecklistModalItems');
  if (itemsEl) {
    itemsEl.innerHTML = items.map(it => `
      <div class="doc-checklist-item">
        <input type="checkbox" id="docChecklistItem_${it.key}" ${it.ok ? 'checked' : ''}>
        <label for="docChecklistItem_${it.key}">${it.label}</label>
        <span class="doc-checklist-source">${it.source === 'admin' ? '(แก้ไขแล้ว)' : it.source === 'legacy' ? '(จากข้อมูลเก่า)' : '(ยังไม่มีข้อมูล)'}</span>
      </div>
    `).join('');
  }
  const overlay = document.getElementById('docChecklistModalOverlay');
  if (overlay) overlay.style.display = 'flex';
}

function closeIotDocChecklistModal() {
  const overlay = document.getElementById('docChecklistModalOverlay');
  if (overlay) overlay.style.display = 'none';
  iotDocChecklistModalRefId = null;
}

// บันทึกเช็คลิสต์ทั้ง 6 รายการทีเดียว (upsert ด้วย reference_id) แล้วอัปเดตแคชในหน่วยความจำ + รีเฟรชตารางทันที
async function saveIotDocChecklistModal() {
  if (blockIfReadOnly()) return;
  if (!iotDocChecklistModalRefId) return;
  if (!supabaseClient) { showToast('ยังไม่ได้เชื่อมต่อ Supabase', 'warn'); return; }
  const referenceId = iotDocChecklistModalRefId;
  const r = allIotRows.find(row => row.reference_id === referenceId);
  const payload = { reference_id: referenceId, updated_by: currentUserName || null, updated_at: new Date().toISOString() };
  IOT_DOC_CHECKLIST_ITEMS.forEach(item => {
    const checkbox = document.getElementById('docChecklistItem_' + item.key);
    payload[item.key + '_ok'] = checkbox ? checkbox.checked : false;
  });
  const plotInputForSave = document.getElementById('docChecklistModalPlotLocationInput');
  payload.plot_location = plotInputForSave ? plotInputForSave.value.trim() : '';
  const { error } = await supabaseClient.from('iot_document_checklist').upsert(payload, { onConflict: 'reference_id' });
  if (error) {
    showToast('บันทึกเช็คลิสต์ไม่สำเร็จ: ' + error.message, 'warn');
    return;
  }
  iotDocChecklistByRefId.set(referenceId, payload);
  closeIotDocChecklistModal();
  applyIotMatchPendingDocSearch();
  showToast(`บันทึกเช็คลิสต์เอกสารให้ ${r && r.first_name ? r.first_name : 'คนนี้'} แล้วครับ`, 'success');
}

// หารายชื่อ "คนที่น่าจะรอกรอกรหัสฐาน" ให้ขึ้นมาอัตโนมัติ (ไม่ต้องรู้ชื่อมาค้นหาเองก่อน) แบ่ง 2 กลุ่ม (ไม่ซ้ำคนกัน เจอกลุ่ม 1 ก่อนก็ไม่ต้องเช็คกลุ่ม 2 ซ้ำ):
//   1) แผนติดตั้ง (iotInstallPlan) บอกว่า "ติดตั้งแล้ว" ไปแล้ว แต่ระบบ OTOD ยังไม่อัปเดตสถานะ (จับคู่ด้วยเลขบัตรประชาชน)
//   2) ติดตั้งแล้วในระบบเรา (ไม่ว่า OTOD ยืนยันเองหรือระบบอนุมานให้จากหลักฐานอื่น) แต่ไม่มี SN เลยสักทาง (ทั้งจากแอปและชีตเก่า)
// วันสุดท้ายของสัปดาห์ที่นัด (ใช้เช็คว่า "เลยกำหนด" หรือยัง) — installDate เก็บเป็นวันแรกของสัปดาห์เสมอ (1/8/15/22/29)
// สัปดาห์ 1-4 จบก่อนวันที่สัปดาห์ถัดไปเริ่ม 1 วัน (7/14/21/28) ส่วนสัปดาห์ 5 จบวันสุดท้ายของเดือนนั้นๆ
function getIotWeekEndDate(dateStr) {
  if (!dateStr) return '';
  const monthYear = getIotMonthYearFromDate(dateStr);
  const week = Number(getIotWeekOfMonthFromDate(dateStr));
  const [y, m] = monthYear.split('-').map(Number);
  const lastDayOfMonth = new Date(y, m, 0).getDate();
  const nextFirstDay = IOT_WEEK_FIRST_DAY[week + 1];
  const day = nextFirstDay ? Math.min(nextFirstDay - 1, lastDayOfMonth) : lastDayOfMonth;
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// เช็คว่ารายการนี้ "เลยกำหนดเชื่อมต่อแอป" หรือยัง: มีนัดวันแล้ว + วันนี้เลยวันสุดท้ายของสัปดาห์ที่นัดแล้ว + สถานะไม่ใช่สละสิทธิ์ + ยังไม่เชื่อมต่อแอป
// เป็นการคำนวณสดทุกครั้ง ไม่มีการบันทึกสถานะค้างไว้ที่ไหน — พอเชื่อมต่อแอปสำเร็จเมื่อไหร่ก็หลุดออกจากเงื่อนไขนี้ทันทีในรอบคำนวณถัดไปเอง
function isIotPlanEntryOverdueForAppConnect(p, today) {
  if (!p.installDate) return false;
  if (p.status === 'cancelled') return false;
  const deadline = getIotWeekEndDate(p.installDate);
  if (!deadline || (today || todayDateStr()) <= deadline) return false;
  return !getAppConfirmForPlanEntry(p);
}

function getIotManualCodeCandidates() {
  if (!iotDataLoaded) return [];
  const rows = getIotVisibleRows();
  const donePlanNids = new Set(
    iotInstallPlan.filter(p => p.status === 'done' && p.nationalId).map(p => p.nationalId)
  );
  const seen = new Set();
  const result = [];

  rows.forEach(r => {
    if (r[IOT_FIELDS.status] === IOT_FIELDS.notDone && r.national_id && donePlanNids.has(r.national_id) && !iotHasKnownBaseCode(r)) {
      if (seen.has(r.reference_id)) return;
      seen.add(r.reference_id);
      result.push({ row: r, reason: 'แผนบอกว่าติดตั้งแล้ว รอระบบอัปเดต' });
    }
  });

  rows.forEach(r => {
    if (r[IOT_FIELDS.status] === IOT_FIELDS.done && !r.matched_sn && !r.legacySerial && !iotHasKnownBaseCode(r)) {
      if (seen.has(r.reference_id)) return;
      seen.add(r.reference_id);
      result.push({ row: r, reason: 'ติดตั้งแล้ว แต่ไม่มี SN' });
    }
  });

  // กลุ่มที่ 3: คนในแผนที่เลยกำหนดสัปดาห์นัดแล้วแต่ยังไม่เชื่อมต่อแอป — ต้องเปลี่ยนมากรอกรหัสฐานเองแทนที่จะรอแอปต่อไป
  const today = todayDateStr();
  iotInstallPlan.forEach(p => {
    if (!p.nationalId || !isIotPlanEntryOverdueForAppConnect(p, today)) return;
    const r = rows.find(row => row.national_id === p.nationalId);
    if (!r || seen.has(r.reference_id) || iotHasKnownBaseCode(r)) return;
    seen.add(r.reference_id);
    result.push({ row: r, reason: `⏰ เลยกำหนดเชื่อมแอป (${formatIotPlanWeekLabel(p.installDate)})` });
  });

  return result;
}

// ถ้าไม่ได้พิมพ์ค้นหา -> โชว์รายชื่อที่น่าจะรอกรอกรหัสฐาน (getIotManualCodeCandidates) ให้อัตโนมัติ
// ถ้าพิมพ์ค้นหา -> ค้นทุกคนจาก allIotRows เหมือนเดิม (ใช้ matchesIotFarmerSearch ตัวเดียวกับตารางตรวจสอบเชื่อมต่อแอป)
function renderIotManualCodeSearchResults() {
  const input = document.getElementById('iotManualCodeSearchInput');
  const tbody = document.getElementById('iotManualCodeSearchTbody');
  if (!input || !tbody) return;
  const term = input.value.trim();

  const candidateBadge = document.getElementById('iotManualCodeCandidateBadge');
  if (candidateBadge) candidateBadge.textContent = `${getIotManualCodeCandidates().length.toLocaleString()} รายการรอ`;

  let items;
  if (!term) {
    items = getIotManualCodeCandidates();
    if (!items.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state-cell"><span class="empty-icon"><i data-icon="sparkles" data-size="15"></i></span><span class="empty-text">ตอนนี้ไม่มีใครรอกรอกรหัสฐานเลยครับ ถ้าอยากหาคนอื่นเพิ่มเติม พิมพ์ค้นหาชื่อ/เลขบัตร/เบอร์ด้านบนได้เลย</span></td></tr>`;
      return;
    }
  } else {
    items = getIotVisibleRows().filter(r => matchesIotFarmerSearch(r, term)).slice(0, 30).map(r => ({ row: r, reason: '' }));
    if (!items.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state-cell"><span class="empty-icon"><i data-icon="search" data-size="15"></i></span><span class="empty-text">ไม่พบคนที่ตรงกับคำค้นหาครับ</span></td></tr>`;
      return;
    }
  }

  tbody.innerHTML = items.map(({ row: r, reason }) => {
    const existing = r.reference_id ? iotManualBaseCodeByRefId.get(r.reference_id) : null;
    const currentValue = existing ? existing.base_code : '';
    const fullName = `${r.prefix || ''}${r.first_name || ''} ${r.last_name || ''}`.trim();
    const refIdSafe = (r.reference_id || '').replace(/'/g, "\\'");
    return `
      <tr>
        <td>${fullName || '-'}</td>
        <td>${r.national_id || '-'}</td>
        <td>${r.phone || '-'}</td>
        <td>${getIotStatusDisplayHtml(r)}</td>
        <td>${reason ? `<span class="badge">${reason}</span>` : '-'}</td>
        <td>
          <input type="text" class="plan-week-input" id="iotManualCodeInput_${r.reference_id}" value="${currentValue}" placeholder="เช่น AR_0008" style="width:120px;" ${r.reference_id ? '' : 'disabled title="คนนี้ไม่มีรหัสอ้างอิง กรอกให้ไม่ได้"'}>
        </td>
        <td style="white-space:nowrap;">
          <button type="button" class="btn-linklike" onclick="saveIotManualBaseCode('${refIdSafe}')" ${r.reference_id ? '' : 'disabled'}><i data-icon="save" data-size="15"></i> บันทึก</button>
          ${existing ? `<button type="button" class="btn-linklike" style="color:var(--red);" onclick="removeIotManualBaseCode('${refIdSafe}')">ลบ</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

// บันทึกรหัสฐานที่ admin กรอกเองขึ้น Supabase (upsert ด้วย reference_id) แล้วโหลดข้อมูล IoT ใหม่ทั้งหมด
// (ต้องโหลดใหม่ทั้งหมด ไม่ใช่แค่แก้ค่าในหน่วยความจำ เพราะ mutation สถานะติดตั้งเป็นการคำนวณทางเดียวจากข้อมูลดิบทุกครั้งที่โหลด)
async function saveIotManualBaseCode(referenceId) {
  if (blockIfReadOnly()) return;
  if (!supabaseClient) { showToast('ยังไม่ได้เชื่อมต่อ Supabase', 'warn'); return; }
  const input = document.getElementById('iotManualCodeInput_' + referenceId);
  if (!input) return;
  const parsed = parseManualBaseCodeInput(input.value);
  if (!parsed) {
    showToast('กรอกรหัสฐานไม่ถูกต้อง ลองพิมพ์แบบ AR_0008 หรือแค่ตัวเลข เช่น 8 ครับ', 'warn');
    return;
  }
  const r = allIotRows.find(row => row.reference_id === referenceId);
  const farmerName = r ? `${r.prefix || ''}${r.first_name || ''} ${r.last_name || ''}`.trim() : '';
  const payload = {
    reference_id: referenceId,
    national_id: r ? (r.national_id || null) : null,
    farmer_name: farmerName || null,
    phone: r ? (r.phone || null) : null,
    base_code_no: parsed.no,
    base_code: parsed.formatted,
    created_by: currentUserName || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseClient.from('iot_manual_base_codes').upsert(payload, { onConflict: 'reference_id' });
  if (error) {
    showToast('บันทึกรหัสฐานไม่สำเร็จ: ' + error.message, 'warn');
    return;
  }
  await loadIotData();
  renderIotManualCodeSearchResults();
  renderIotManualCodeList();
  showToast(`บันทึกรหัสฐาน ${parsed.formatted} ให้ ${farmerName || 'คนนี้'} แล้วครับ — อัปเดตสถานะเป็น "ได้ตู้แล้ว" ให้อัตโนมัติ`, 'success');
}

// ลบรหัสฐานที่กรอกเอง แล้วโหลดข้อมูล IoT ใหม่ทั้งหมด เพื่อคำนวณสถานะย้อนกลับให้ถูกต้อง
async function removeIotManualBaseCode(referenceId) {
  if (blockIfReadOnly()) return;
  if (!supabaseClient) return;
  const confirmed = await showConfirmModal('ยืนยันลบรหัสฐานที่กรอกเองของคนนี้?');
  if (!confirmed) return;
  const { error } = await supabaseClient.from('iot_manual_base_codes').delete().eq('reference_id', referenceId);
  if (error) {
    showToast('ลบไม่สำเร็จ: ' + error.message, 'warn');
    return;
  }
  await loadIotData();
  renderIotManualCodeSearchResults();
  renderIotManualCodeList();
  showToast('ลบรหัสฐานแล้วครับ', 'success');
}

// ตารางรายชื่อทั้งหมดที่กรอกรหัสฐานเองไว้แล้ว (ไว้ตรวจสอบ/ค้นหา/ลบทีหลัง)
function renderIotManualCodeList() {
  const tbody = document.getElementById('iotManualCodeListTbody');
  const badge = document.getElementById('iotManualCodeListCountBadge');
  if (!tbody) return;
  if (badge) badge.textContent = `${iotManualBaseCodes.length.toLocaleString()} รายการ`;

  const searchInput = document.getElementById('iotManualCodeListSearch');
  const term = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const filtered = iotManualBaseCodes.filter(rec => {
    if (!term) return true;
    const hay = [rec.farmer_name, rec.national_id, rec.phone, rec.base_code].map(v => (v || '').toString().toLowerCase()).join(' ');
    return hay.includes(term);
  }).sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''));

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state-cell"><span class="empty-text">${iotManualBaseCodes.length ? 'ไม่พบรายการที่ตรงกับคำค้นหา' : 'ยังไม่มีรายการที่กรอกรหัสฐานเองเลยครับ'}</span></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(rec => {
    const sn = iotCabinetSerialByNo.get(rec.base_code_no) || '-';
    const when = rec.updated_at || rec.created_at;
    const whenLabel = when ? formatThaiDate(when.slice(0, 10)) : '-';
    const refIdSafe = (rec.reference_id || '').replace(/'/g, "\\'");
    // จังหวัดเอาจากข้อมูลส่วนบุคคลของเกษตรกรเอง (allIotRows) ไม่ใช้ข้อความอื่นปน กันมั่ว
    const farmerRow = rec.reference_id ? allIotRows.find(r => r.reference_id === rec.reference_id) : null;
    const province = (farmerRow && farmerRow.farm_province) ? farmerRow.farm_province : '-';
    return `
      <tr>
        <td>${rec.farmer_name || '-'}</td>
        <td>${rec.national_id || '-'}</td>
        <td>${rec.phone || '-'}</td>
        <td>${rec.base_code}</td>
        <td>${sn}</td>
        <td>${province}</td>
        <td>${rec.created_by || '-'}</td>
        <td>${whenLabel}</td>
        <td><button type="button" class="btn-linklike" style="color:var(--red);" onclick="removeIotManualBaseCode('${refIdSafe}')">ลบ</button></td>
      </tr>
    `;
  }).join('');
}

// ต่อท้ายข้อความสถานะ (r.status ข้อความไทยจาก Durian) ด้วยป้าย "รอยืนยันเอกสาร" ถ้าแถวนี้ถูกมาร์คว่า
// ติดตั้งแล้วจากข้อมูลเก่า (isLegacyPending) แต่ระบบ OTOD ปัจจุบันยังไม่อัปเดตอย่างเป็นทางการ
function getIotStatusDisplayHtml(r) {
  const base = r.status || '';
  if (!r.isLegacyPending) return base;
  let title;
  if (r.legacyBaseCode) {
    const snPart = r.legacySerial ? ` รหัสตู้ ${r.legacySerial}` : '';
    const sourceLabel = r.manualBaseCodeEntry ? ' (admin กรอกยืนยันเอง)' : ' (จากข้อมูลเก่า)';
    title = `ได้รับตู้แล้ว รหัสฐาน ${r.legacyBaseCode}${snPart}${sourceLabel} รอเอกสารยืนยันจาก OTOD`;
  } else if (r.legacyPendingViaApp) {
    title = `เชื่อมต่อแอปแล้ว (SN ${r.matched_sn || '-'}) รอเอกสารยืนยันจาก OTOD`;
  } else {
    title = 'มีตู้แล้ว รอเอกสารยืนยันจาก OTOD';
  }
  return `${base} <span class="pdf-status-badge status-pending" title="${title}"> รอยืนยันเอกสาร</span>`;
}

// ===== ข้อมูล "เชื่อมต่อแอปแล้ว" (จาก API แอป Kasetkorn เทียบกับตาราง OTOD ด้วยเลขบัตร/เบอร์โทร/ชื่อ-นามสกุล) =====
// เก็บเป็นระดับ "ตู้ 1 เครื่อง" (SN ขึ้นต้นด้วย KS) เพราะเกษตรกร 1 คน อาจมีหลายตู้ได้
window.appConnections = [];
window.appConnByNationalId = new Map(); // national_id -> [records]
window.appConnByPhone = new Map();      // phone -> [records]
window.appConnByName = new Map();

// expose ฟังก์ชันของโมดูลนี้ให้ inline handlers และโมดูลอื่นเรียกผ่าน window ได้
Object.assign(window, {
  getIotCancelledWithoutBlocker, renderIotCancelledLegacyList, restoreIotCancelledToQueue,
  loadIotLegacyPendingMap, findIotLegacyRecord, findIotLegacyBaseCode, findIotLegacyInstallInfo, loadIotCabinetSerials, findIotLegacySerial,
  loadIotSheetNotes, getIotSheetNote, getIotSheetNoteByNationalId,
  loadIotManualBaseCodes, parseManualBaseCodeInput, formatIotArCode, findIotManualBaseCode, iotHasKnownBaseCode, loadIotDocChecklist,
  getIotDocChecklistState, loadIotInstallBlockers, getIotInstallBlockerState, getIotInstallBlockerStateByNationalId, isInstallBlockerReasonPreset, openIotInstallBlockerModal,
  openIotInstallBlockerModalByNationalId, onInstallBlockerReasonChange, closeIotInstallBlockerModal, refreshAfterIotInstallBlockerChange, saveIotInstallBlockerModal, removeIotInstallBlockerModal,
  renderIotBlockerSearchResults, renderIotBlockerList, getIotPlotLocationLinkHtml, getIotPlotLocationState, updateIotDocChecklistPlotLink, openIotDocChecklistModal,
  closeIotDocChecklistModal, saveIotDocChecklistModal, getIotWeekEndDate, isIotPlanEntryOverdueForAppConnect, getIotManualCodeCandidates, renderIotManualCodeSearchResults,
  saveIotManualBaseCode, removeIotManualBaseCode, renderIotManualCodeList, getIotStatusDisplayHtml,
});
