// ===== หน้าแผนติดตั้ง IoT: ตาราง/ปฏิทิน + ซิงก์ Supabase + dropdown เพิ่มเองได้ + realtime =====
// แยกมาจาก main.js เดิม — ตัวแปร/ฟังก์ชันแชร์ผ่าน window (โค้ดเดิมออกแบบเป็น global scope)


function saveIotPlanToStorage() {
  // ตัดฟิลด์ที่ขึ้นต้นด้วย _ ออก (เป็นสถานะชั่วคราวของเซสชันนี้เท่านั้น เช่น _localTouchedAt)
  // ห้ามให้ค้างใน localStorage เด็ดขาด ไม่งั้นข้อมูลเก่าจากเซสชันก่อนจะไปชนะข้อมูลจริงบนเซิร์ฟเวอร์ตอนโหลดใหม่
  const clean = iotInstallPlan.map(p => {
    const o = {};
    Object.keys(p).forEach(k => { if (k[0] !== '_') o[k] = p[k]; });
    return o;
  });
  localStorage.setItem(IOT_PLAN_STORAGE_KEY, JSON.stringify(clean));
}

/* ===== กันข้อมูล "เด้งกลับ" ระหว่างที่แก้ในเครื่องยังขึ้นเซิร์ฟเวอร์ไม่เสร็จ =====
   ทั้งสองตัวนี้อยู่ในหน่วยความจำอย่างเดียว (ไม่เก็บลง localStorage)
   พอรีเฟรช/ล็อกอินใหม่จะว่างเสมอ = ข้อมูลบนเซิร์ฟเวอร์เป็นความจริงเสมอ */
window.iotPlanPendingLocal = new Set();      // nationalId ที่แก้ในเครื่องแล้วยังไม่ยืนยันว่าขึ้นเซิร์ฟเวอร์
window.iotPlanRecentlyDeleted = new Map();   // nationalId -> เวลาที่กดลบ (กันการ pull ดึงกลับมา)
window.IOT_PLAN_GUARD_MS = 60 * 1000;

/** ประทับว่าแถวนี้เพิ่งถูกแก้ในเครื่อง — เรียกทุกครั้งที่เปลี่ยนค่า entry แล้วจะซิงก์ขึ้นไป */
function markIotPlanLocalEdit(entry) {
  if (!entry) return;
  entry._localTouchedAt = Date.now();
  if (entry.nationalId) {
    iotPlanPendingLocal.add(entry.nationalId);
    iotPlanRecentlyDeleted.delete(entry.nationalId);   // แก้ใหม่ = ไม่ถือว่าถูกลบแล้ว
  }
}

/** ประทับว่าคนนี้ถูกลบออกจากแผน — กันไม่ให้การดึงข้อมูลที่ค้างอยู่เอาชื่อกลับมา */
function markIotPlanDeleted(nid) {
  if (!nid) return;
  iotPlanRecentlyDeleted.set(nid, Date.now());
  iotPlanPendingLocal.delete(nid);
}

// ----- ซิงก์แผนติดตั้ง IoT ขึ้น Supabase (ตาราง iot_install_plan) -----
// ถ้ายังไม่ได้ตั้งค่า Supabase หรือยังไม่ได้สร้างตารางนี้ ฟังก์ชันพวกนี้จะข้ามไปเงียบๆ
// แล้วใช้ข้อมูลใน localStorage ของเบราว์เซอร์นี้ต่อไปตามปกติ (ไม่ทำให้แอปพัง)
function iotPlanEntryToSupabaseRow(entry) {
  return {
    id: entry.id,
    national_id: entry.nationalId || null,
    name: entry.name || null,
    province: entry.province || null,
    district: entry.district || null,
    subdistrict: entry.subdistrict || null,
    phone: entry.phone || null,
    install_date: entry.installDate || null,
    install_time: entry.installTime || null,
    box_type: entry.boxType || null,
    install_team: entry.installTeam || null,
    operator_name: entry.operatorName || null,
    pump_type: entry.pumpType || null,
    pipe_size: entry.pipeSize || null,
    valve_size: entry.valveSize || null,
    water_source: entry.waterSource || null,
    irrigation_type: entry.irrigationType || null,
    scanned_sn: entry.scannedSn || null,
    base_code: entry.baseCode || null,
    payment_status: entry.paymentStatus || null,
    payment_amount: (entry.paymentAmount === '' || entry.paymentAmount === undefined || entry.paymentAmount === null) ? null : Number(entry.paymentAmount),
    map_link: entry.mapLink || null,
    note: entry.note || null,
    status: entry.status || 'pending',
    plan_finalized: !!entry.planFinalized,
    sort_order: entry.sortOrder || 0,
    updated_by: currentUserName || null,
    updated_at: new Date().toISOString()
  };
}

async function syncIotPlanEntriesToSupabase(entries) {
  if (blockIfReadOnly()) return;
  if (!supabaseClient || !entries || !entries.length) return;
  try {
    const rows = entries.map(iotPlanEntryToSupabaseRow);
    const { error } = await supabaseClient.from('iot_install_plan').upsert(rows);
    if (error) throw error;
    // ขึ้นเซิร์ฟเวอร์เรียบร้อยแล้ว เลิกกันข้อมูลเซิร์ฟเวอร์ทับได้
    entries.forEach(e => { if (e && e.nationalId) iotPlanPendingLocal.delete(e.nationalId); });
  } catch (e) {
    showToast('ซิงก์แผนติดตั้ง IoT ขึ้น Supabase ไม่สำเร็จ: ' + e.message, 'error');
  }
}

async function deleteIotPlanEntryFromSupabase(id, nid) {
  if (blockIfReadOnly()) return false;
  if (!supabaseClient) return true;
  try {
    // ลบทั้ง id นี้ และแถวซ้ำ (คนเดียวกัน national_id เดียวกัน แต่ id คนละตัว) เพื่อกันชื่อเด้งกลับหลังรีเฟรช
    // .select('id') ให้คืนแถวที่ลบจริง — เพราะ RLS ที่ไม่อนุญาต Supabase จะคืน "สำเร็จ" แต่ลบ 0 แถว (ไม่มี error) ทำให้ชื่อเด้งกลับ
    let q = supabaseClient.from('iot_install_plan').delete();
    q = (nid ? q.or(`id.eq.${id},national_id.eq.${nid}`) : q.eq('id', id));
    const { data, error } = await q.select('id');
    if (error) throw error;
    if (!data || !data.length) {
      showToast('ลบไม่สำเร็จ (ระบบลบได้ 0 แถว = ไม่มีสิทธิ์ลบใน Supabase) — ต้องรันไฟล์ iot_install_plan_delete_policy.sql ก่อน ไม่งั้นชื่อจะเด้งกลับหลังรีเฟรช', 'warn');
      return false;
    }
    return true;
  } catch (e) {
    showToast('ลบออกจากระบบไม่สำเร็จ: ' + e.message + ' — อาจติดสิทธิ์ หรือยังไม่ได้รัน iot_install_plan_delete_policy.sql', 'error');
    return false;
  }
}

async function deleteAllIotPlanEntriesFromSupabase(ids) {
  if (blockIfReadOnly()) return;
  if (!supabaseClient || !ids || !ids.length) return;
  try {
    const { error } = await supabaseClient.from('iot_install_plan').delete().in('id', ids);
    if (error) throw error;
  } catch (e) {
    showToast('ล้างแผนติดตั้ง IoT บน Supabase ไม่สำเร็จ: ' + e.message, 'error');
  }
}

async function syncIotPlanFromSupabase(opts) {
  opts = opts || {};
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient.from('iot_install_plan').select('*');
    if (error) throw error;

    // เซิร์ฟเวอร์ไม่มีข้อมูลเลย แต่ในเครื่องมี — ต้องแยกให้ออกว่าเป็นกรณีไหน
    // 1) แถวที่ยังไม่เคยขึ้นเซิร์ฟเวอร์ (ไม่มี updatedAt) = ของใหม่ อัปโหลดขึ้นไปให้
    // 2) แถวที่เคยขึ้นไปแล้ว (มี updatedAt) แต่ตอนนี้เซิร์ฟเวอร์ไม่มี = "ถูกลบไปจริงๆ" ต้องลบตามในเครื่องด้วย
    //    (ของเดิมอัปโหลดกลับขึ้นไปหมด ทำให้ชื่อที่ลบไปแล้วฟื้นกลับมาทุกครั้งที่ล็อกอินใหม่)
    if (data && data.length === 0 && iotInstallPlan.length > 0) {
      const neverSynced = iotInstallPlan.filter(p => !p.updatedAt);
      if (neverSynced.length) {
        await syncIotPlanEntriesToSupabase(neverSynced);
        if (opts.showToastOnSuccess) showToast(`อัปโหลดแผนติดตั้ง IoT ${neverSynced.length.toLocaleString()} รายการที่ยังไม่เคยซิงก์ขึ้น Supabase แล้ว`, 'success');
      } else {
        iotInstallPlan = [];
        saveIotPlanToStorage();
        renderIotPlanTable();
        if (iotPlanCurrentView === 'calendar') renderIotPlanCalendar();
        if (opts.showToastOnSuccess) showToast('แผนติดตั้ง IoT บน Supabase ว่างแล้ว — ล้างข้อมูลค้างในเครื่องนี้ตามให้แล้วครับ', 'info');
      }
      return;
    }

    if (data) {
      // จำสิ่งที่แก้ค้างไว้ในเครื่องนี้ก่อนทับด้วยข้อมูลเซิร์ฟเวอร์
      // (realtime ของเราเองยิงกลับมาเร็วกว่าที่ค่าล่าสุดจะขึ้นไปถึง — ถ้าทับดื้อๆ ช่องที่เพิ่งเลือกจะเด้งกลับเป็นว่าง)
      const prevByNid = new Map();
      iotInstallPlan.forEach(p => { if (p && p.nationalId) prevByNid.set(p.nationalId, p); });
      iotInstallPlan = data.map(row => ({
        id: row.id,
        nationalId: row.national_id || '',
        name: row.name || '',
        province: row.province || '',
        district: row.district || '',
        subdistrict: row.subdistrict || '',
        phone: row.phone || '',
        installDate: row.install_date || '',
        installTime: row.install_time || '',
        boxType: row.box_type || '',
        installTeam: row.install_team || '',
        operatorName: row.operator_name || '',
        pumpType: row.pump_type || '',
        pipeSize: row.pipe_size || '',
        valveSize: row.valve_size || '',
        waterSource: row.water_source || '',
        irrigationType: row.irrigation_type || '',
        scannedSn: row.scanned_sn || '',
        baseCode: row.base_code || '',
        paymentStatus: row.payment_status || '',
        paymentAmount: (row.payment_amount === null || row.payment_amount === undefined) ? '' : String(row.payment_amount),
        mapLink: row.map_link || '',
        note: row.note || '',
        status: row.status || 'pending',
        planFinalized: !!row.plan_finalized,
        sortOrder: row.sort_order || 0,
        updatedBy: row.updated_by || '',
        updatedAt: row.updated_at || ''
      }));

      const nowMs = Date.now();

      // คนที่เพิ่งกดลบไปเมื่อกี้ ถ้าข้อมูลชุดนี้ถูกอ่านก่อนที่คำสั่งลบจะถึงเซิร์ฟเวอร์ ต้องไม่ให้ชื่อกลับมา
      iotInstallPlan = iotInstallPlan.filter(e => {
        const t = e.nationalId ? iotPlanRecentlyDeleted.get(e.nationalId) : null;
        return !(t && nowMs - t <= IOT_PLAN_GUARD_MS);
      });

      // ถ้าแถวไหน "ยังแก้ค้างอยู่ในเซสชันนี้" และแก้หลังเวลาที่เซิร์ฟเวอร์บันทึกไว้ = ของในเครื่องใหม่กว่า ให้ใช้ของในเครื่อง
      // ต้องอยู่ใน iotPlanPendingLocal (หน่วยความจำ) ด้วย — พอรีเฟรช/ล็อกอินใหม่ Set นี้ว่าง ข้อมูลเซิร์ฟเวอร์จึงชนะเสมอ
      const seenNids = new Set();
      iotInstallPlan = iotInstallPlan.map(e => {
        if (e.nationalId) seenNids.add(e.nationalId);
        const prev = e.nationalId ? prevByNid.get(e.nationalId) : null;
        if (!prev || !prev._localTouchedAt || !iotPlanPendingLocal.has(e.nationalId)) return e;
        const serverAt = Date.parse(e.updatedAt || '') || 0;
        if (prev._localTouchedAt <= serverAt) return e;
        return { ...prev, id: e.id };   // ของในเครื่องใหม่กว่า — เก็บไว้ แต่ใช้ id ฝั่งเซิร์ฟเวอร์
      });
      // แถวที่เพิ่งสร้าง/แก้ในเซสชันนี้แต่ยัง upsert ไม่ถึงเซิร์ฟเวอร์ ต้องไม่หายไป
      prevByNid.forEach((prev, nid) => {
        if (seenNids.has(nid) || !iotPlanPendingLocal.has(nid)) return;
        iotInstallPlan.push(prev);
      });

      saveIotPlanToStorage();
      renderIotPlanTable();
      if (iotPlanCurrentView === 'calendar') renderIotPlanCalendar();
      if (currentUserRole === 'installer' || installerPreviewTeam) renderInstallerView();
      if (opts.showToastOnSuccess) showToast('ดึงแผนติดตั้ง IoT ล่าสุดจาก Supabase แล้ว', 'success');
    }
  } catch (e) {
    console.warn('ซิงก์แผนติดตั้ง IoT จาก Supabase ไม่สำเร็จ (จะใช้ข้อมูลในเบราว์เซอร์นี้แทน):', e.message);
    if (opts.showToastOnSuccess) showToast('ดึงข้อมูลจาก Supabase ไม่สำเร็จ: ' + e.message, 'error');
  }
}

// เพิ่มคนคนเดียวเข้าแผนติดตั้ง (คืนค่า object รายการที่เพิ่ม ถ้าเพิ่มจริง, null ถ้าซ้ำ/ไม่มีเลขบัตร)
function addPersonToIotPlan(p) {
  if (!p || !p.national_id) return null;
  if (iotInstallPlan.some(e => e.nationalId === p.national_id)) return null;
  const entry = {
    id: 'ip' + Date.now() + Math.random().toString(36).slice(2),
    nationalId: p.national_id,
    name: `${p.prefix||''}${p.first_name||''} ${p.last_name||''}`.trim(),
    province: p[IOT_FIELDS.province] || '',
    district: p[IOT_FIELDS.district] || '',
    subdistrict: p.farm_subdistrict || '',
    phone: p.phone || '',
    installDate: '',
    installTime: '',
    boxType: '',
    installTeam: '',
    operatorName: '',
    pumpType: '',
    pipeSize: '',
    valveSize: '',
    waterSource: '',
    irrigationType: '',
    scannedSn: '',
    baseCode: '',
    paymentStatus: '',
    paymentAmount: '',
    mapLink: '',
    note: '',
    status: 'not_contacted', // เพิ่งเข้าแผน ยังไม่ได้โทรหา -> "ยังไม่ได้ติดต่อ"
    planFinalized: false,
    sortOrder: Date.now()
  };
  iotInstallPlan.push(entry);
  return entry;
}

function addPersonToIotPlanByNid(nid) {
  if (blockIfReadOnly()) return;
  const p = allIotRows.find(r => r.national_id === nid);
  if (!p) return;
  const entry = addPersonToIotPlan(p);
  saveIotPlanToStorage();
  renderIotPlanTable();
  refreshIotPeoplePanel();
  if (entry) {
    syncIotPlanEntriesToSupabase([entry]);
  } else {
    showToast(`${p.prefix || ''}${p.first_name || ''} ${p.last_name || ''} อยู่ในแผนติดตั้ง IoT อยู่แล้วครับ`, 'info');
  }
}

// เพิ่มคนที่ "ยังไม่ติดตั้ง" ทั้งอำเภอที่ระบุเข้าแผน (parametrized เพื่อใช้ได้ทั้งมุมมองทีละอำเภอ และมุมมองทั้งจังหวัด)
function addAllNotInstalledToIotPlanFor(province, district) {
  if (blockIfReadOnly()) return;
  // ไม่รวมคนที่ทำเครื่องหมายว่า "ติดตั้งไม่ได้" ไว้ ให้สอดคล้องกับพาแนลที่แยกหัวข้อคนกลุ่มนี้ออกไปแล้ว
  const people = getIotVisibleRows().filter(r =>
    normName(r[IOT_FIELDS.province]) === normName(province) &&
    normName(r[IOT_FIELDS.district]) === normName(district) &&
    r[IOT_FIELDS.status] === IOT_FIELDS.notDone &&
    !getIotInstallBlockerState(r)
  );
  const addedEntries = [];
  people.forEach(p => { const entry = addPersonToIotPlan(p); if (entry) addedEntries.push(entry); });
  saveIotPlanToStorage();
  renderIotPlanTable();
  refreshIotPeoplePanel();
  if (addedEntries.length) syncIotPlanEntriesToSupabase(addedEntries);
  showToast(addedEntries.length ? `เพิ่ม ${addedEntries.length} คนเข้าแผนติดตั้ง IoT แล้ว` : 'ทุกคนอยู่ในแผนติดตั้งแล้ว', addedEntries.length ? 'success' : 'info');
  return addedEntries;
}

function addAllDistrictNotInstalledToIotPlan() {
  if (blockIfReadOnly()) return;
  if (!currentIotPeoplePanelProvince || !currentIotPeoplePanelDistrict) return;
  addAllNotInstalledToIotPlanFor(currentIotPeoplePanelProvince, currentIotPeoplePanelDistrict);
}

function addSelectedIotPeopleToIotPlan(groupId) {
  if (blockIfReadOnly()) return;
  const container = document.getElementById(groupId + 'Tbody');
  if (!container) return;
  const checked = container.querySelectorAll('.iot-plan-select-checkbox:checked');
  const addedEntries = [];
  checked.forEach(cb => {
    const nid = cb.getAttribute('data-nid');
    const p = allIotRows.find(r => r.national_id === nid);
    if (p) { const entry = addPersonToIotPlan(p); if (entry) addedEntries.push(entry); }
  });
  saveIotPlanToStorage();
  renderIotPlanTable();
  refreshIotPeoplePanel();
  if (addedEntries.length) syncIotPlanEntriesToSupabase(addedEntries);
  if (!checked.length) { showToast('กรุณาเลือกอย่างน้อย 1 คนก่อนครับ', 'warn'); return; }
  showToast(addedEntries.length ? `เพิ่ม ${addedEntries.length} คนเข้าแผนติดตั้ง IoT แล้ว` : 'คนที่เลือกอยู่ในแผนติดตั้งอยู่แล้ว', addedEntries.length ? 'success' : 'info');
}

function toggleSelectAllIotPeople(groupId) {
  const container = document.getElementById(groupId + 'Tbody');
  if (!container) return;
  const boxes = container.querySelectorAll('.iot-plan-select-checkbox:not(:disabled)');
  const allChecked = [...boxes].every(b => b.checked);
  boxes.forEach(b => { b.checked = !allChecked; });
}

window.IOT_PLAN_STATUS_LABELS = { not_contacted: 'ยังไม่ได้ติดต่อ', pending: 'รอติดตั้ง', survey: 'นัดดูหน้างาน', site_not_ready: 'หน้างานไม่พร้อม', ready: 'พร้อมติดตั้ง', done_pending_docs: 'ติดตั้งแล้ว รอยืนยันเอกสาร', done: 'ติดตั้งแล้ว', cancelled: 'สละสิทธิ์' };
// done_pending_docs = ทีมติดตั้งตู้ไปแล้วจริง (ตามชีตเก่า) แต่ระบบ OTOD ยังไม่อนุมัติเอกสารส่งมอบ
// จึงยัง "ไม่นับเป็นติดตั้งแล้ว" ในสถิติ — ต้องรอ OTOD อนุมัติก่อนถึงเปลี่ยนเป็น done
/** ตัวเลือก <option> ของสถานะแผน สร้างจาก IOT_PLAN_STATUS_LABELS ที่เดียว จะได้ไม่ตกหล่นเวลาเพิ่มสถานะใหม่ */
window.iotPlanStatusOptionsHtml = function (cur) {
  return Object.keys(IOT_PLAN_STATUS_LABELS)
    .map(k => `<option value="${k}" ${cur === k ? 'selected' : ''}>${IOT_PLAN_STATUS_LABELS[k]}</option>`).join('');
};
// KPI "ติดตั้งแล้ว" นับเฉพาะ done เท่านั้น · cancelled = สละสิทธิ์ (ไม่นับ) · ที่เหลือทั้งหมด = ยังไม่ติดตั้ง
window.IOT_BOX_TYPE_LABELS = { no_button: 'ตู้ไม่มีปุ่มกด', with_button: 'ตู้มีปุ่มกด' };
window.IOT_INSTALL_TEAMS = ['ทีมโก้', 'ทีมนพดล', 'ทีม Aero'];
window.IOT_PUMP_TYPES = ['ไม่เกิน 5 แรงม้า', 'โซล่าเซลล์', 'เกิน 5 แรงม้า', 'เครื่องยนต์'];
window.IOT_PIPE_SIZES = ['1 นิ้ว', '2 นิ้ว', '3 นิ้ว'];
window.IOT_PAYMENT_STATUSES = ['ชำระแล้ว', 'ยังไม่ชำระ', 'ไม่ต้องชำระ'];
window.IOT_OPERATORS = ['Admin', 'นพดล']; // รายชื่อผู้ดำเนินการสำเร็จรูป แก้/เพิ่มชื่อได้ตรงนี้
window.IOT_VALVE_SIZES = ['1/2 นิ้ว', '1 นิ้ว', '2 นิ้ว']; // ขนาดวาล์วพื้นฐาน (เพิ่มเองได้ผ่านหน้าเว็บ)
window.IOT_WATER_SOURCES = ['บ่อน้ำ', 'ถังเก็บน้ำ', 'บ่อบาดาล', 'ไม่มีแหล่งน้ำ']; // แหล่งน้ำพื้นฐาน (เพิ่มเองได้)
window.IOT_IRRIGATION_TYPES = ['ระบบสปริงเกอร์', 'ระบบน้ำหยด', 'สายยาง', 'ไม่มีระบบน้ำ']; // รูปแบบการให้น้ำพื้นฐาน (เพิ่มเองได้)

// ===== ดรอปดาวน์ที่เพิ่มตัวเลือกเองได้ (เก็บตัวเลือกที่เพิ่มใหม่ลง Supabase ตาราง dropdown_options) =====
// ตัวเลือกพื้นฐาน (default) ยังฝังในโค้ด ตารางฐานข้อมูลเก็บเฉพาะที่แอดมินเพิ่มเข้ามาใหม่ -> รายการที่ใช้จริง = default + ที่เพิ่ม
window.IOT_DROPDOWN_DEFAULTS = {
  pump_type: IOT_PUMP_TYPES,
  pipe_size: IOT_PIPE_SIZES,
  valve_size: IOT_VALVE_SIZES,
  water_source: IOT_WATER_SOURCES,
  irrigation_type: IOT_IRRIGATION_TYPES,
  payment_status: IOT_PAYMENT_STATUSES,
  install_team: IOT_INSTALL_TEAMS,
  operator: IOT_OPERATORS
};
window.IOT_DROPDOWN_CATEGORY_LABELS = {
  pump_type: 'ปั๊มน้ำ', pipe_size: 'ขนาดท่อ', valve_size: 'ขนาดวาล์ว',
  water_source: 'แหล่งน้ำ', irrigation_type: 'รูปแบบการให้น้ำ',
  payment_status: 'การชำระเงิน', install_team: 'ทีมติดตั้ง', operator: 'ผู้ดำเนินการ'
};
window.customDropdownOptions = { pump_type: [], pipe_size: [], valve_size: [], water_source: [], irrigation_type: [], payment_status: [], install_team: [], operator: [] };

// รายการตัวเลือกที่ใช้จริงของหมวดนั้น = ตัวเลือกพื้นฐาน + ที่แอดมินเพิ่ม (ตัดซ้ำ คงลำดับ)
function getIotDropdownOptions(category) {
  const base = IOT_DROPDOWN_DEFAULTS[category] || [];
  const custom = customDropdownOptions[category] || [];
  return [...base, ...custom].filter((v, i, a) => a.indexOf(v) === i);
}

// ===== แหล่งน้ำ / รูปแบบการให้น้ำ: ดึงค่าจากชีต (iot_farmers / iot_farmers_legacy) มาเป็นค่าเริ่มต้น =====
window._iotNidIndex = null;
window._iotNidIndexLen = -1;
function _iotRowByNid(nid) {
  if (typeof allIotRows === 'undefined' || !allIotRows) return null;
  if (!_iotNidIndex || _iotNidIndexLen !== allIotRows.length) {
    _iotNidIndex = new Map();
    allIotRows.forEach(r => { if (r.national_id) _iotNidIndex.set(r.national_id, r); });
    _iotNidIndexLen = allIotRows.length;
  }
  return _iotNidIndex.get(nid) || null;
}
function getPlanWaterDefaults(nid) {
  const r = _iotRowByNid(nid);
  if (!r) return { water: '', irr: '' };
  let w = r.water_source || '', ir = r.irrigation_type || '';
  const rec = (r.reference_id && typeof iotLegacyByRefId !== 'undefined') ? iotLegacyByRefId.get(r.reference_id) : null;
  if (rec) { w = w || rec.water_source || ''; ir = ir || rec.irrigation_type || ''; }
  return { water: w, irr: ir };
}
// ค่าที่จะแสดง/ส่งออก = ค่าที่แอดมินเลือกไว้ในแผน ถ้ายังไม่เลือก ใช้ค่าจากชีต
function planWaterVal(p) { return (p && p.waterSource) ? p.waterSource : getPlanWaterDefaults(p ? p.nationalId : '').water || ''; }
function planIrrigationVal(p) { return (p && p.irrigationType) ? p.irrigationType : getPlanWaterDefaults(p ? p.nationalId : '').irr || ''; }
// สร้าง <option> รายการ + กันกรณีค่าปัจจุบัน (จากชีต) ไม่อยู่ในตัวเลือกพื้นฐาน ให้ยังโชว์ได้
function iotSelectOptionsHtml(category, cur) {
  const list = getIotDropdownOptions(category); const c = cur || ''; let h = '';
  if (c && list.indexOf(c) < 0) h += `<option value="${c.replace(/"/g, '&quot;')}" selected>${c}</option>`;
  h += list.map(t => `<option value="${t.replace(/"/g, '&quot;')}" ${c === t ? 'selected' : ''}>${t}</option>`).join('');
  return h;
}

async function loadDropdownOptions() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient.from('dropdown_options').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true });
    if (error) { console.warn('โหลดตัวเลือกดรอปดาวน์ไม่สำเร็จ:', error.message); return; }
    const next = { pump_type: [], pipe_size: [], valve_size: [], water_source: [], irrigation_type: [], payment_status: [], install_team: [], operator: [] };
    (data || []).forEach(row => {
      if (next[row.category] && row.value && !next[row.category].includes(row.value)) next[row.category].push(row.value);
    });
    customDropdownOptions = next;
  } catch (e) {
    console.warn('โหลดตัวเลือกดรอปดาวน์ไม่สำเร็จ:', e.message);
  }
}

// เพิ่มตัวเลือกใหม่ 1 อันในหมวดที่ระบุ -> บันทึกลง Supabase แล้ววาดใหม่ทุกที่ที่ใช้ดรอปดาวน์นี้
async function addDropdownOption(category) {
  if (blockIfReadOnly()) return;
  const input = document.getElementById('dropdownAddInput_' + category);
  if (!input) return;
  const value = (input.value || '').trim();
  if (!value) { showToast('พิมพ์ตัวเลือกที่จะเพิ่มก่อนครับ', 'warn'); return; }
  if (getIotDropdownOptions(category).includes(value)) { showToast('มีตัวเลือกนี้อยู่แล้วครับ', 'info'); return; }
  customDropdownOptions[category] = [...(customDropdownOptions[category] || []), value];
  input.value = '';
  renderDropdownManager();
  renderIotPlanTable();
  refreshIotPeoplePanel();
  if (supabaseClient) {
    const sortOrder = (IOT_DROPDOWN_DEFAULTS[category] || []).length + customDropdownOptions[category].length;
    const { error } = await supabaseClient.from('dropdown_options').upsert(
      { category, value, sort_order: sortOrder, created_by: currentUserName || null },
      { onConflict: 'category,value' }
    );
    if (error) showToast('บันทึกตัวเลือกขึ้นระบบไม่สำเร็จ: ' + error.message + ' (รันไฟล์ dropdown_options_setup.sql แล้วหรือยัง?)', 'warn');
    else showToast(`เพิ่มตัวเลือก "${value}" ใน "${IOT_DROPDOWN_CATEGORY_LABELS[category]}" แล้วครับ`, 'success');
  }
}

// ลบเฉพาะตัวเลือกที่แอดมินเพิ่มเอง (ตัวเลือกพื้นฐานลบไม่ได้)
async function removeCustomDropdownOption(category, value) {
  if (blockIfReadOnly()) return;
  if ((IOT_DROPDOWN_DEFAULTS[category] || []).includes(value)) { showToast('ตัวเลือกพื้นฐานลบไม่ได้ครับ', 'warn'); return; }
  customDropdownOptions[category] = (customDropdownOptions[category] || []).filter(v => v !== value);
  renderDropdownManager();
  renderIotPlanTable();
  refreshIotPeoplePanel();
  if (supabaseClient) {
    const { error } = await supabaseClient.from('dropdown_options').delete().eq('category', category).eq('value', value);
    if (error) showToast('ลบตัวเลือกออกจากระบบไม่สำเร็จ: ' + error.message, 'warn');
  }
}

function toggleDropdownManager() {
  const body = document.getElementById('iotDropdownManagerBody');
  const chevron = document.getElementById('iotDropdownManagerChevron');
  if (!body) return;
  const show = body.style.display === 'none';
  body.style.display = show ? '' : 'none';
  if (chevron) chevron.classList.toggle('open', show);
  if (show) renderDropdownManager();
}

function renderDropdownManager() {
  const body = document.getElementById('iotDropdownManagerBody');
  if (!body) return;
  body.innerHTML = Object.keys(IOT_DROPDOWN_CATEGORY_LABELS).map(cat => {
    const base = IOT_DROPDOWN_DEFAULTS[cat] || [];
    const custom = customDropdownOptions[cat] || [];
    const chips = [
      ...base.map(v => `<span class="dropdown-chip is-default" title="ตัวเลือกพื้นฐาน (ลบไม่ได้)">${v}</span>`),
      ...custom.map(v => `<span class="dropdown-chip is-custom">${v} <button type="button" onclick="removeCustomDropdownOption('${cat}','${(v||'').replace(/'/g,"\'")}')" title="ลบตัวเลือกนี้"><i data-icon="close" data-size="15"></i></button></span>`)
    ].join('');
    return `
      <div class="dropdown-manager-cat">
        <div class="dropdown-manager-cat-title">${IOT_DROPDOWN_CATEGORY_LABELS[cat]}</div>
        <div class="dropdown-chips">${chips || '<span style="opacity:.5;">— ยังไม่มี —</span>'}</div>
        <div class="dropdown-add-row">
          <input type="text" id="dropdownAddInput_${cat}" placeholder="พิมพ์ตัวเลือกใหม่..." onkeydown="if(event.key==='Enter'){addDropdownOption('${cat}');}">
          <button type="button" class="btn btn-brand btn-xs" onclick="addDropdownOption('${cat}')">+ เพิ่ม</button>
        </div>
      </div>`;
  }).join('');
}

// ===== เพิ่มตัวเลือกดรอปดาวน์ได้จากในช่องเลือกเลย (แบบ Google Sheet) =====
window.ADD_OPT_SENTINEL = '__ADDOPT__';
function canAddDropdownOption() { return !isReadOnlyUser; }

// เติมตัวเลือก "เพิ่มตัวเลือกใหม่…"ท้ายดรอปดาวน์ (เฉพาะ select ที่มี data-dropcat)
function ensureAddOptionItem(sel) {
  if (!sel || sel.dataset.addoptDone === '1') return;
  if (!canAddDropdownOption()) return;
  const o = document.createElement('option');
  o.value = ADD_OPT_SENTINEL;
  o.textContent = 'เพิ่มตัวเลือกใหม่…';
  o.className = 'opt-addnew';
  sel.appendChild(o);
  sel.dataset.addoptDone = '1';
}
function enhanceAddOptionSelects(root) {
  (root || document).querySelectorAll('select[data-dropcat]:not([data-addopt-done="1"])').forEach(ensureAddOptionItem);
}
// วาดตัวเลือกในดรอปดาวน์ตัวนั้นใหม่ (หลังเพิ่มตัวเลือกใหม่) โดยคงตัวเลือกว่างไว้ + เติมปุ่ม  กลับ
function refillDropdownSelect(sel, category) {
  const cur = sel.dataset.prevval || '';
  [...sel.options].forEach(o => { if (o.value !== '') sel.removeChild(o); });
  getIotDropdownOptions(category).forEach(t => {
    const o = document.createElement('option'); o.value = t; o.textContent = t; sel.appendChild(o);
  });
  sel.dataset.addoptDone = '';
  ensureAddOptionItem(sel);
  sel.value = cur;
}

// บันทึกตัวเลือกใหม่ได้หลายตัวพร้อมกัน (คั่นด้วยขึ้นบรรทัดใหม่ หรือ , ) -> คืน array ที่เพิ่มจริง
async function saveNewDropdownOptions(category, raw) {
  const parts = (raw || '').split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
  const seen = {}; const uniq = [];
  parts.forEach(v => { if (!seen[v]) { seen[v] = 1; uniq.push(v); } });
  const existing = getIotDropdownOptions(category);
  const toAdd = uniq.filter(v => !existing.includes(v));
  if (!toAdd.length) { showToast('ไม่มีตัวเลือกใหม่ (ซ้ำหรือว่าง)', 'info'); return []; }
  customDropdownOptions[category] = [...(customDropdownOptions[category] || []), ...toAdd];
  if (supabaseClient) {
    const baseLen = (IOT_DROPDOWN_DEFAULTS[category] || []).length;
    const rows = toAdd.map(v => ({ category, value: v, sort_order: baseLen + customDropdownOptions[category].indexOf(v), created_by: currentUserName || null }));
    const { error } = await supabaseClient.from('dropdown_options').upsert(rows, { onConflict: 'category,value' });
    if (error) showToast('บันทึกขึ้นระบบไม่สำเร็จ: ' + error.message + ' (รัน dropdown_options_setup.sql แล้วหรือยัง?)', 'warn');
    else showToast(`เพิ่ม ${toAdd.length} ตัวเลือกใน "${IOT_DROPDOWN_CATEGORY_LABELS[category] || category}" แล้ว`, 'success');
  }
  return toAdd;
}

// กล่องกรอกตัวเลือกใหม่ (พิมพ์ได้หลายตัว) -> คืน string หรือ null ถ้ายกเลิก
function promptAddDropdownOptions(catLabel) {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;';
    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:14px;max-width:440px;width:100%;padding:20px;box-shadow:0 12px 40px rgba(0,0,0,.25);font-family:inherit;';
    box.innerHTML =
      '<h4 style="margin:0 0 6px;color:#1f6f3d;"><i data-icon="plus" data-size="15"></i> เพิ่มตัวเลือกใหม่ — ' + (catLabel || '') + '</h4>' +
      '<div style="font-size:13px;color:#666;margin-bottom:10px;">พิมพ์ได้หลายตัว — ขึ้นบรรทัดใหม่ หรือคั่นด้วยเครื่องหมายจุลภาค ( , )</div>' +
      '<textarea rows="4" style="width:100%;box-sizing:border-box;border:1px solid #ccc;border-radius:8px;padding:8px;font-family:inherit;font-size:14px;" placeholder="เช่น&#10;ปั๊มซัมเมอร์ส 2 นิ้ว&#10;ปั๊มหอยโข่ง 3 แรง"></textarea>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;"><button type="button" class="btn btn-outline" data-act="cancel">ยกเลิก</button><button type="button" class="btn btn-brand" data-act="save">บันทึก</button></div>';
    ov.appendChild(box); document.body.appendChild(ov);
    const ta = box.querySelector('textarea');
    const done = v => { if (ov.parentNode) ov.parentNode.removeChild(ov); resolve(v); };
    box.querySelector('[data-act="cancel"]').onclick = () => done(null);
    box.querySelector('[data-act="save"]').onclick = () => done(ta.value);
    ov.addEventListener('click', e => { if (e.target === ov) done(null); });
    ta.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); done(null); }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); done(ta.value); }
    });
    setTimeout(() => ta.focus(), 30);
  });
}

async function openAddOptionModal(category, triggerEl) {
  if (!canAddDropdownOption()) { showToast('บัญชีนี้ดูได้อย่างเดียว เพิ่มตัวเลือกไม่ได้ครับ', 'warn'); return; }
  const raw = await promptAddDropdownOptions(IOT_DROPDOWN_CATEGORY_LABELS[category] || category);
  if (raw == null) return;
  const added = await saveNewDropdownOptions(category, raw);
  if (added && added.length && triggerEl && document.contains(triggerEl)) {
    refillDropdownSelect(triggerEl, category);
    triggerEl.value = added[0];
    triggerEl.dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (typeof renderDropdownManager === 'function') renderDropdownManager();
}

// จำค่าก่อนเปลี่ยน + ดักเมื่อผู้ใช้เลือก "เพิ่มตัวเลือกใหม่…"
(function initAddOptionInterceptors() {
  const rememberPrev = e => {
    const el = e.target;
    if (el && el.tagName === 'SELECT' && el.dataset && el.dataset.dropcat) el.dataset.prevval = el.value;
  };
  document.addEventListener('focus', rememberPrev, true);
  document.addEventListener('mousedown', rememberPrev, true);
  document.addEventListener('change', function (e) {
    const el = e.target;
    if (el && el.tagName === 'SELECT' && el.dataset && el.dataset.dropcat && el.value === ADD_OPT_SENTINEL) {
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      const cat = el.dataset.dropcat;
      el.value = el.dataset.prevval || '';
      openAddOptionModal(cat, el);
    }
  }, true);
  try {
    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        (m.addedNodes || []).forEach(n => {
          if (n.nodeType !== 1) return;
          if (n.matches && n.matches('select[data-dropcat]')) ensureAddOptionItem(n);
          if (n.querySelectorAll) n.querySelectorAll('select[data-dropcat]').forEach(ensureAddOptionItem);
        });
      }
    });
    const start = () => { if (document.body) { obs.observe(document.body, { childList: true, subtree: true }); enhanceAddOptionSelects(); } };
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  } catch (e) { console.warn('addopt observer', e); }
})();

window.IOT_TIME_HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
window.IOT_TIME_MINUTES = ['00', '15', '30', '45'];

// ระบบเลือก "สัปดาห์ที่ N ของเดือนนี้" แทนวันที่+เวลาแบบละเอียด (เก็บเป็นวันที่จริงเบื้องหลังเหมือนเดิม แค่เปลี่ยนวิธีเลือก)
// นับสัปดาห์ตามเลขวันที่ในเดือน: 1-7=สัปดาห์1, 8-14=สัปดาห์2, 15-21=สัปดาห์3, 22-28=สัปดาห์4, 29+=สัปดาห์5
window.IOT_WEEK_FIRST_DAY = { 1: 1, 2: 8, 3: 15, 4: 22, 5: 29 };

function getIotMonthYearFromDate(dateStr) {
  if (!dateStr) return '';
  const [y, m] = dateStr.split('-');
  return `${y}-${m}`;
}

function getIotWeekOfMonthFromDate(dateStr) {
  if (!dateStr) return '';
  const day = Number(dateStr.split('-')[2]);
  if (day >= 29) return '5';
  if (day >= 22) return '4';
  if (day >= 15) return '3';
  if (day >= 8) return '2';
  return '1';
}

function buildIotDateFromMonthWeek(monthYear, week) {
  if (!monthYear || !week) return '';
  const [y, m] = monthYear.split('-').map(Number);
  const lastDayOfMonth = new Date(y, m, 0).getDate();
  let day = IOT_WEEK_FIRST_DAY[Number(week)] || 1;
  if (day > lastDayOfMonth) day = lastDayOfMonth; // เดือนสั้นกว่า 29 วัน (เช่น ก.พ.) -> เลื่อนมาวันสุดท้ายของเดือนแทน
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getIotMonthOptionsHtml(selectedValue) {
  const today = new Date();
  const options = [];
  const values = new Set();
  for (let offset = -1; offset <= 12; offset++) {
    const d = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    values.add(val);
    options.push({ val, label: d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }) });
  }
  if (selectedValue && !values.has(selectedValue)) {
    const [y, m] = selectedValue.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    options.unshift({ val: selectedValue, label: d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }) });
  }
  return `<option value="">- เดือน -</option>` + options.map(o => `<option value="${o.val}" ${o.val === selectedValue ? 'selected' : ''}>${o.label}</option>`).join('');
}

// ข้อความสัปดาห์แบบเดียวกับตัวเลือกใน dropdown (ให้ตรงกันทุกที่ที่โชว์ให้ผู้ใช้เห็น)
window.IOT_WEEK_LABELS = {
  1: 'สัปดาห์ที่ 1 (1-7)',
  2: 'สัปดาห์ที่ 2 (8-14)',
  3: 'สัปดาห์ที่ 3 (15-21)',
  4: 'สัปดาห์ที่ 4 (22-28)',
  5: 'สัปดาห์ที่ 5 (29+)'
};

// ตั้งแต่เปลี่ยนมาให้เลือกแค่ "เดือน + สัปดาห์ที่" แทนวันที่จริงแล้ว (ไม่ให้เลือกวันที่ตรงๆ อีกต่อไป)
// รายงาน/ไฟล์ที่ส่งออกก็ต้องบอกเป็น "เดือน + สัปดาห์ที่" ตามไปด้วย ไม่โชว์วันที่จริงแบบเป๊ะๆ ให้สับสน
// (แม้ข้างในจะยังเก็บเป็นวันที่จริงอยู่ก็ตาม เพราะเป็นแค่กลไกภายในไม่ใช่สิ่งที่ผู้ใช้เลือก)
function formatIotPlanWeekLabel(dateStr) {
  if (!dateStr) return '';
  const monthYear = getIotMonthYearFromDate(dateStr);
  const week = getIotWeekOfMonthFromDate(dateStr);
  const [y, m] = monthYear.split('-').map(Number);
  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  return `${monthLabel} ${IOT_WEEK_LABELS[Number(week)] || ''}`;
}

// สรุปช่วงกำหนดติดตั้งจากหลายวันที่ (เรียงแล้ว) ให้เป็นข้อความเดือน/สัปดาห์อ่านง่าย ไม่ใช่ช่วงวันที่จริง
function formatIotPlanWeekRangeLabel(sortedDates) {
  if (!sortedDates.length) return '';
  if (sortedDates.length === 1) return formatIotPlanWeekLabel(sortedDates[0]);
  const firstMonth = getIotMonthYearFromDate(sortedDates[0]);
  const lastMonth = getIotMonthYearFromDate(sortedDates[sortedDates.length - 1]);
  if (firstMonth === lastMonth) {
    const [y, m] = firstMonth.split('-').map(Number);
    const monthLabel = new Date(y, m - 1, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
    const firstWeek = getIotWeekOfMonthFromDate(sortedDates[0]);
    const lastWeek = getIotWeekOfMonthFromDate(sortedDates[sortedDates.length - 1]);
    return firstWeek === lastWeek ? `${monthLabel} สัปดาห์ที่ ${firstWeek}` : `${monthLabel} สัปดาห์ที่ ${firstWeek}–${lastWeek}`;
  }
  return `${formatIotPlanWeekLabel(sortedDates[0])} – ${formatIotPlanWeekLabel(sortedDates[sortedDates.length - 1])}`;
}

// เวอร์ชัน "สัปดาห์นี้"/"สัปดาห์ที่ N" แบบเทียบกับวันนี้ ใช้ในวิดเจ็ต "วันนี้ & กำลังจะมาถึง"/"ย้อนหลัง"
// ของแผนติดตั้ง IoT โดยเฉพาะ (ต่างจาก formatIotPlanWeekLabel เฉยๆ ตรงที่จะบอก "สัปดาห์นี้" แทนชื่อเดือน+เลขสัปดาห์
// ถ้าสัปดาห์นั้นตรงกับสัปดาห์ปัจจุบันจริงๆ อ่านเข้าใจง่ายกว่าในบริบทนี้)
function formatIotPlanWeekLabelRelative(dateStr, today) {
  if (!dateStr) return '';
  const monthYear = getIotMonthYearFromDate(dateStr);
  const week = getIotWeekOfMonthFromDate(dateStr);
  const todayMonthYear = getIotMonthYearFromDate(today);
  const todayWeek = getIotWeekOfMonthFromDate(today);
  if (monthYear === todayMonthYear && week === todayWeek) return `สัปดาห์นี้ (${IOT_WEEK_LABELS[Number(week)] || ''})`;
  return formatIotPlanWeekLabel(dateStr);
}

function updateIotPlanMonthWeek(id, part, value) {
  if (blockIfReadOnly()) return;
  const entry = iotInstallPlan.find(p => p.id === id);
  if (!entry) return;
  let month = getIotMonthYearFromDate(entry.installDate);
  let week = getIotWeekOfMonthFromDate(entry.installDate);
  if (part === 'month') {
    month = value;
    if (month && !week) week = '1'; // เลือกเดือนก่อน ตั้งสัปดาห์เริ่มต้นเป็นสัปดาห์ที่ 1 ให้เลย ไม่ต้องกดซ้ำถ้าไม่สนใจ
  } else {
    week = value;
    if (week && !month) month = getIotMonthYearFromDate(todayDateStr());
  }
  const newDate = (month && week) ? buildIotDateFromMonthWeek(month, week) : '';
  updateIotPlanField(id, 'installDate', newDate);
}

// เหมือนกับ planHighlightEntryId แต่สำหรับตารางแผนติดตั้ง IoT
window.iotPlanHighlightEntryId = null;

function iotPlanRowHtml(p, i) {
  const mapLinkSafe = (p.mapLink || '').replace(/"/g, '&quot;');
  const status = p.status || 'pending';
  const hasDate = !!p.installDate;
  const planMonth = getIotMonthYearFromDate(p.installDate);
  const planWeek = getIotWeekOfMonthFromDate(p.installDate);
  const planBlocker = getIotInstallBlockerStateByNationalId(p.nationalId);
  const planBlockerNidSafe = (p.nationalId || '').replace(/'/g, "\\'");
  const isHighlighted = p.id === iotPlanHighlightEntryId;
  const isOverdueAppConnect = isIotPlanEntryOverdueForAppConnect(p);
  return `
    <tr class="plan-row-${status}${isHighlighted ? ' row-highlight' : ''}" ${isHighlighted ? 'id="highlightedIotPlanTableRow"' : ''}>
      <td><input type="checkbox" class="iot-plan-bulk-checkbox" data-id="${p.id}" onchange="updateIotPlanBulkSelectedCount()"></td>
      <td>${i + 1}</td>
      <td style="text-align:center;">
        ${hasDate
          ? `<span class="stat stat-ok has-ico"><i data-icon="check" data-size="12"></i> นัดแล้ว</span>`
          : `<span class="stat stat-danger">ยังไม่นัด</span>`}
      </td>
      <td>
        <div>
          <select class="plan-month-week-select" onchange="updateIotPlanMonthWeek('${p.id}','month',this.value)">
            ${getIotMonthOptionsHtml(planMonth)}
          </select>
        </div>
        <div style="margin-top:4px;">
          <select class="plan-month-week-select" onchange="updateIotPlanMonthWeek('${p.id}','week',this.value)">
            <option value="">- สัปดาห์ -</option>
            <option value="1" ${planWeek === '1' ? 'selected' : ''}>สัปดาห์ที่ 1 (1-7)</option>
            <option value="2" ${planWeek === '2' ? 'selected' : ''}>สัปดาห์ที่ 2 (8-14)</option>
            <option value="3" ${planWeek === '3' ? 'selected' : ''}>สัปดาห์ที่ 3 (15-21)</option>
            <option value="4" ${planWeek === '4' ? 'selected' : ''}>สัปดาห์ที่ 4 (22-28)</option>
            <option value="5" ${planWeek === '5' ? 'selected' : ''}>สัปดาห์ที่ 5 (29+)</option>
          </select>
        </div>
        <div class="plan-map-actions">
          <button type="button" class="btn-linklike" onclick="applyInstallDateToSubdistrict('${p.id}')">ใช้ทั้งตำบล</button>
        </div>
      </td>
      <td>
        ${p.name || '-'}
        <div class="plan-meta-line" style="${planBlocker ? 'color:var(--red);' : ''}">
          ${planBlocker
            ? `<i data-icon="blocked" data-size="15"></i> ติดตั้งไม่ได้ <button type="button" class="btn-linklike" onclick="openIotInstallBlockerModalByNationalId('${planBlockerNidSafe}')" title="เหตุผล: ${(planBlocker.reason || '').replace(/"/g, '&quot;')}">แก้ไข</button>`
            : `<button type="button" class="btn-linklike" onclick="openIotInstallBlockerModalByNationalId('${planBlockerNidSafe}')"><i data-icon="blocked" data-size="15"></i> ทำเครื่องหมายว่าติดตั้งไม่ได้</button>`}
        </div>
        ${isOverdueAppConnect ? `<div class="plan-meta-line" style="color:var(--red);" title="เลยวันสุดท้ายของสัปดาห์ที่นัดแล้ว แต่ยังไม่เชื่อมต่อแอป — โผล่ในรายชื่อ &quot;กรอกรหัสฐานเอง&quot; ให้แล้ว">⏰ เลยกำหนดเชื่อมแอป</div>` : ''}
      </td>
      <td>${p.nationalId || ''}</td>
      <td>${p.phone || ''}</td>
      <td>${p.province}</td>
      <td>${p.district || '-'}</td>
      <td>${p.subdistrict || '-'}</td>
      <td>
        <select class="plan-status-select status-${status}" onchange="this.className='plan-status-select status-'+this.value; this.closest('tr').className='plan-row-'+this.value; updateIotPlanField('${p.id}','status',this.value)">
          ${iotPlanStatusOptionsHtml(status)}
        </select>
      </td>
      <td>
        <select data-dropcat="install_team" class="plan-status-select" onchange="updateIotPlanField('${p.id}','installTeam',this.value)">
          <option value="" ${!p.installTeam ? 'selected' : ''}>ยังไม่ระบุ</option>
          ${getIotDropdownOptions('install_team').map(t => `<option value="${t}" ${p.installTeam === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </td>
      <td>
        <select data-dropcat="operator" class="plan-status-select" onchange="updateIotPlanField('${p.id}','operatorName',this.value)">
          <option value="" ${!p.operatorName ? 'selected' : ''}>ยังไม่ระบุ</option>
          ${getIotDropdownOptions('operator').map(t => `<option value="${t}" ${p.operatorName === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </td>
      <td>
        <select class="plan-status-select" onchange="updateIotPlanField('${p.id}','boxType',this.value)">
          <option value="" ${!p.boxType ? 'selected' : ''}>ยังไม่ระบุ</option>
          <option value="no_button" ${p.boxType === 'no_button' ? 'selected' : ''}>ตู้ไม่มีปุ่มกด</option>
          <option value="with_button" ${p.boxType === 'with_button' ? 'selected' : ''}>ตู้มีปุ่มกด</option>
        </select>
      </td>
      <td>
        <select data-dropcat="pump_type" class="plan-status-select select-compact" onchange="updateIotPlanField('${p.id}','pumpType',this.value)">
          <option value="" ${!p.pumpType ? 'selected' : ''}>ยังไม่ระบุ</option>
          ${getIotDropdownOptions('pump_type').map(t => `<option value="${t}" ${p.pumpType === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </td>
      <td>
        <select data-dropcat="pipe_size" class="plan-status-select select-compact" onchange="updateIotPlanField('${p.id}','pipeSize',this.value)">
          <option value="" ${!p.pipeSize ? 'selected' : ''}>ยังไม่ระบุ</option>
          ${getIotDropdownOptions('pipe_size').map(t => `<option value="${t}" ${p.pipeSize === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </td>
      <td>
        <select data-dropcat="valve_size" class="plan-status-select select-compact" onchange="updateIotPlanField('${p.id}','valveSize',this.value)">
          <option value="" ${!p.valveSize ? 'selected' : ''}>ยังไม่ระบุ</option>
          ${getIotDropdownOptions('valve_size').map(t => `<option value="${t}" ${p.valveSize === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </td>
      <td>
        <select data-dropcat="water_source" class="plan-status-select select-compact" onchange="updateIotPlanField('${p.id}','waterSource',this.value)">
          <option value="">ยังไม่ระบุ</option>
          ${iotSelectOptionsHtml('water_source', planWaterVal(p))}
        </select>
      </td>
      <td>
        <select data-dropcat="irrigation_type" class="plan-status-select select-compact" onchange="updateIotPlanField('${p.id}','irrigationType',this.value)">
          <option value="">ยังไม่ระบุ</option>
          ${iotSelectOptionsHtml('irrigation_type', planIrrigationVal(p))}
        </select>
      </td>
      <td>
        ${p.boxType === 'no_button'
          ? `<span class="plan-cell-dash" title="ตู้ไม่มีปุ่มกด ไม่ต้องเก็บเงิน">-</span>`
          : `<select data-dropcat="payment_status" class="plan-status-select select-compact" onchange="updateIotPlanField('${p.id}','paymentStatus',this.value)">
              <option value="" ${!p.paymentStatus ? 'selected' : ''}>ยังไม่ระบุ</option>
              ${getIotDropdownOptions('payment_status').map(t => `<option value="${t}" ${p.paymentStatus === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>`}
      </td>
      <td>
        ${p.boxType === 'no_button'
          ? `<span class="plan-cell-dash" title="ตู้ไม่มีปุ่มกด ไม่ต้องเก็บเงิน">-</span>`
          : `<input class="plan-note-input select-compact" type="number" min="0" step="1" inputmode="numeric" value="${p.paymentAmount === '' || p.paymentAmount === undefined || p.paymentAmount === null ? '' : String(p.paymentAmount).replace(/"/g,'&quot;')}" placeholder="บาท" style="width:88px;" oninput="updateIotPlanField('${p.id}','paymentAmount',this.value)">`}
      </td>
      <td>
        <input class="plan-note-input plan-map-input" type="text" value="${mapLinkSafe}" placeholder="วางลิงก์ Google Maps" oninput="updateIotPlanField('${p.id}','mapLink',this.value)">
        ${p.mapLink ? `<div class="plan-map-actions"><a href="${mapLinkSafe}" target="_blank" rel="noopener" class="plan-map-link"><i data-icon="pin" data-size="15"></i> เปิดแผนที่</a></div>` : ''}
      </td>
      <td>
        <input class="plan-note-input${p.note ? ' note-input-filled' : ''}" type="text" value="${(p.note||'').replace(/"/g,'&quot;')}" placeholder="หมายเหตุ" oninput="updateIotPlanField('${p.id}','note',this.value); this.classList.toggle('note-input-filled', !!this.value.trim())">
        ${p.updatedBy ? `<div class="plan-meta-line" title="แก้ไขล่าสุดโดย ${p.updatedBy}${p.updatedAt ? ' · ' + formatDateTimeThai(p.updatedAt) : ''}"><i data-icon="edit" data-size="15"></i> ${p.updatedBy}${p.updatedAt ? ' · ' + formatRelativeTime(p.updatedAt) : ''}</div>` : ''}
      </td>
      <td>
        <button class="plan-remove-btn" onclick="removeIotPlanEntry('${p.id}')" title="ลบ"><i data-icon="close" data-size="15"></i></button>
        ${p.planFinalized ? `<div class="plan-map-actions"><button type="button" class="btn-linklike" onclick="unfinalizeIotPlanEntry('${p.id}')" title="ย้ายกลับไปแท็บแผนติดตั้ง"><i data-icon="undo" data-size="15"></i> ย้ายกลับ</button></div>` : ''}
      </td>
    </tr>
  `;
}

// ทีมติดตั้งมักไปทั้งตำบลในวันเดียวกัน (แม้แต่ละจุดจะมีพิกัด GPS ต่างกัน) จึงให้ซิงก์ "วันที่ติดตั้ง" ทั้งตำบลได้
// (ต่างจากลิงก์ Google Maps ที่ไม่ซิงก์ เพราะแต่ละบ้านมีตำแหน่งติดตั้งจริงไม่เหมือนกัน)
function applyInstallDateToSubdistrict(id) {
  if (blockIfReadOnly()) return;
  const entry = iotInstallPlan.find(p => p.id === id);
  if (!entry || !entry.installDate) { showToast('กรุณาเลือกวันที่ติดตั้งก่อนครับ', 'warn'); return; }
  if (!entry.subdistrict) { showToast('รายการนี้ยังไม่มีข้อมูลตำบลครับ', 'warn'); return; }
  const changed = [];
  iotInstallPlan.forEach(p => {
    if (p.id !== entry.id && p.province === entry.province && p.district === entry.district && p.subdistrict === entry.subdistrict) {
      p.installDate = entry.installDate;
      changed.push(p);
    }
  });
  if (!changed.length) { showToast('ไม่มีคนอื่นในตำบลเดียวกันในแผนตอนนี้', 'info'); return; }
  saveIotPlanToStorage();
  renderIotPlanTable();
  syncIotPlanEntriesToSupabase(changed);
  showToast(`ใช้วันที่ติดตั้งนี้กับอีก ${changed.length} คนในตำบล${entry.subdistrict}แล้ว`, 'success');
}

function getFilteredIotPlan(opts) {
  opts = opts || {};
  const provSel = document.getElementById('iotPlanFilterProvince');
  const distSel = document.getElementById('iotPlanFilterDistrict');
  const subdistSel = document.getElementById('iotPlanFilterSubdistrict');
  const statusSel = document.getElementById('iotPlanFilterStatus');
  const scheduledSel = document.getElementById('iotPlanFilterScheduled');
  const teamSel = document.getElementById('iotPlanFilterTeam');
  const boxTypeSel = document.getElementById('iotPlanFilterBoxType');
  const searchEl = document.getElementById('iotPlanFilterSearch');
  const province = provSel ? provSel.value : '';
  const district = distSel ? distSel.value : '';
  const subdistrict = subdistSel ? subdistSel.value : '';
  const status = statusSel ? statusSel.value : '';
  const scheduled = scheduledSel ? scheduledSel.value : '';
  const team = teamSel ? teamSel.value : '';
  const boxType = boxTypeSel ? boxTypeSel.value : '';
  const q = searchEl ? searchEl.value.trim().toLowerCase() : '';
  return iotInstallPlan.filter(p => {
    if (p.planFinalized) return false; // ย้ายไปแสดงในแท็บ "วางแผนเสร็จแล้ว" แทน ไม่ปนกับตารางแผนหลัก
    if (province && p.province !== province) return false;
    if (district && p.district !== district) return false;
    if (subdistrict && p.subdistrict !== subdistrict) return false;
    if (status && (p.status || 'pending') !== status) return false;
    if (scheduled === 'yes' && !p.installDate) return false;
    if (scheduled === 'no' && p.installDate) return false;
    if (team && p.installTeam !== team) return false;
    if (boxType && p.boxType !== boxType) return false;
    if (!opts.ignoreDateFilter && iotPlanCalendarSelectedDate && p.installDate !== iotPlanCalendarSelectedDate) return false;
    if (q) {
      const hay = `${p.name || ''} ${p.nationalId || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

function populateIotPlanFilterOptions() {
  const provSel = document.getElementById('iotPlanFilterProvince');
  const distSel = document.getElementById('iotPlanFilterDistrict');
  const subdistSel = document.getElementById('iotPlanFilterSubdistrict');
  if (!provSel || !distSel) return;

  const currentProvince = provSel.value;
  const provinces = [...new Set(iotInstallPlan.map(p => p.province).filter(Boolean))].sort();
  provSel.innerHTML = '<option value="">ทุกจังหวัด</option>' + provinces.map(p => `<option value="${p}">${p}</option>`).join('');
  provSel.value = provinces.includes(currentProvince) ? currentProvince : '';

  const selectedProvince = provSel.value;
  const currentDistrict = distSel.value;
  const districts = [...new Set(
    iotInstallPlan.filter(p => !selectedProvince || p.province === selectedProvince).map(p => p.district).filter(Boolean)
  )].sort();
  distSel.innerHTML = '<option value="">ทุกอำเภอ</option>' + districts.map(d => `<option value="${d}">${d}</option>`).join('');
  distSel.value = districts.includes(currentDistrict) ? currentDistrict : '';

  if (subdistSel) {
    const selectedDistrict = distSel.value;
    const currentSubdistrict = subdistSel.value;
    const subdistricts = [...new Set(
      iotInstallPlan
        .filter(p => (!selectedProvince || p.province === selectedProvince) && (!selectedDistrict || p.district === selectedDistrict))
        .map(p => p.subdistrict).filter(Boolean)
    )].sort();
    subdistSel.innerHTML = '<option value="">ทุกตำบล</option>' + subdistricts.map(s => `<option value="${s}">${s}</option>`).join('');
    subdistSel.value = subdistricts.includes(currentSubdistrict) ? currentSubdistrict : '';
  }
}

function applyIotPlanFilters() {
  const tbody = document.getElementById('iotPlanTbody');
  if (!tbody) return;
  // จำตำแหน่ง scroll ของกล่องตารางไว้ก่อนเขียนทับแถวทั้งหมด แล้วคืนกลับหลังวาดเสร็จ
  // (ไม่งั้นทุกครั้งที่แก้ dropdown ในแถวใดแถวหนึ่ง ตารางจะเด้งกลับไปบนสุดเพราะ innerHTML ถูกเขียนทับใหม่ทั้งก้อน)
  const scrollBox = document.getElementById('iotPlanTableView');
  const prevScrollTop = scrollBox ? scrollBox.scrollTop : 0;
  const filtered = getFilteredIotPlan();

  if (filtered.length) {
    tbody.innerHTML = filtered.map((p, i) => iotPlanRowHtml(p, i)).join('');
  } else if (iotInstallPlan.length) {
    tbody.innerHTML = `<tr><td colspan="17" class="empty-state-cell"><span class="empty-icon"><i data-icon="search" data-size="15"></i></span><span class="empty-text">ไม่พบรายการที่ตรงกับตัวกรอง<br>ลองปรับตัวกรองดูใหม่นะครับ</span></td></tr>`;
  } else {
    tbody.innerHTML = `<tr><td colspan="17" class="empty-state-cell"><span class="empty-icon"><i data-icon="inbox" data-size="15"></i></span><span class="empty-text">ยังไม่มีรายการในแผนติดตั้ง IoT เลย<br>ไปที่แท็บ <i data-icon="map" data-size="15"></i> แผนที่ เพื่อเพิ่มคนเข้าแผนได้เลยครับ</span></td></tr>`;
  }
  iotPlanHighlightEntryId = null; // ใช้ครั้งเดียวจบ ไม่ค้างไฮไลท์ซ้ำในการ render รอบถัดไป
  if (scrollBox) scrollBox.scrollTop = prevScrollTop;

  const countInfo = document.getElementById('iotPlanFilterCountInfo');
  if (countInfo) {
    countInfo.textContent = `แสดง ${filtered.length.toLocaleString()} จาก ${iotInstallPlan.length.toLocaleString()} รายการ`;
  }

  const chip = document.getElementById('iotPlanDateFilterChip');
  if (chip) {
    if (iotPlanCalendarSelectedDate) {
      chip.style.display = '';
      chip.innerHTML = `<div class="plan-date-chip"><i data-icon="calendar" data-size="15"></i> กรองเฉพาะวันที่ ${formatThaiDate(iotPlanCalendarSelectedDate)} <button type="button" onclick="clearIotPlanDateFilter()"><i data-icon="close" data-size="15"></i> ล้างตัวกรองวันที่</button></div>`;
    } else {
      chip.style.display = 'none';
      chip.innerHTML = '';
    }
  }
}

function onIotPlanFilterProvinceChange() {
  populateIotPlanFilterOptions();
  applyIotPlanFilters();
}

function onIotPlanFilterDistrictChange() {
  populateIotPlanFilterOptions();
  applyIotPlanFilters();
}

// เติมตัวเลือกใน dropdown "ผู้ดำเนินการ" ของแถบ bulk-assign จาก IOT_OPERATORS (เรียกทุกครั้งที่ render ตารางแผน)
function populateIotPlanBulkOperatorOptions() {
  const sel = document.getElementById('iotPlanBulkOperatorSelect');
  if (!sel) return;
  const current = sel.value;
  const ops = getIotDropdownOptions('operator');
  sel.innerHTML = '<option value="">— เลือกผู้ดำเนินการ —</option>' + ops.map(o => `<option value="${o}">${o}</option>`).join('');
  sel.value = ops.includes(current) ? current : '';
}

// นับจำนวนแถวที่ติ๊กเลือกไว้ตอนนี้ในตารางแผน แล้วอัปเดตข้อความในแถบ bulk-assign
function updateIotPlanBulkSelectedCount() {
  const countEl = document.getElementById('iotPlanBulkSelectedCount');
  if (!countEl) return;
  const checked = document.querySelectorAll('#iotPlanTbody .iot-plan-bulk-checkbox:checked').length;
  countEl.textContent = `เลือกแล้ว ${checked.toLocaleString()} รายการ`;
}

// ติ๊ก/ยกเลิกติ๊กทุกแถวในตารางแผนพร้อมกัน (ใช้จากช่องติ๊กหัวตาราง)
function toggleSelectAllIotPlanRows() {
  const boxes = document.querySelectorAll('#iotPlanTbody .iot-plan-bulk-checkbox');
  const allChecked = boxes.length > 0 && [...boxes].every(b => b.checked);
  boxes.forEach(b => { b.checked = !allChecked; });
  updateIotPlanBulkSelectedCount();
}

// ตั้ง "ผู้ดำเนินการ" ให้ทุกแถวที่ติ๊กเลือกไว้พร้อมกันทีเดียว แล้วซิงก์ขึ้น Supabase ทีเดียว
function applyBulkIotPlanOperator() {
  if (blockIfReadOnly()) return;
  const select = document.getElementById('iotPlanBulkOperatorSelect');
  const operator = select ? select.value : '';
  if (!operator) { showToast('กรุณาเลือกผู้ดำเนินการก่อนครับ', 'warn'); return; }
  const checked = [...document.querySelectorAll('#iotPlanTbody .iot-plan-bulk-checkbox:checked')];
  if (!checked.length) { showToast('กรุณาเลือกอย่างน้อย 1 แถวก่อนครับ', 'warn'); return; }
  const changed = [];
  checked.forEach(cb => {
    const entry = iotInstallPlan.find(p => p.id === cb.getAttribute('data-id'));
    if (entry) { entry.operatorName = operator; changed.push(entry); }
  });
  saveIotPlanToStorage();
  renderIotPlanTable();
  if (changed.length) syncIotPlanEntriesToSupabase(changed);
  showToast(`ตั้งผู้ดำเนินการ "${operator}" ให้ ${changed.length.toLocaleString()} รายการแล้วครับ`, 'success');
}

// ทำเครื่องหมายว่า "วางแผนเสร็จแล้ว"ให้ทุกแถวที่ติ๊กเลือกไว้พร้อมกัน — ย้ายไปแท็บ "วางแผนเสร็จแล้ว"ทันที (ยังแก้ไขข้อมูลได้ตามปกติ)
function applyBulkIotPlanFinalize() {
  if (blockIfReadOnly()) return;
  const checked = [...document.querySelectorAll('#iotPlanTbody .iot-plan-bulk-checkbox:checked')];
  if (!checked.length) { showToast('กรุณาเลือกอย่างน้อย 1 แถวก่อนครับ', 'warn'); return; }
  const changed = [];
  checked.forEach(cb => {
    const entry = iotInstallPlan.find(p => p.id === cb.getAttribute('data-id'));
    if (entry) { entry.planFinalized = true; markIotPlanLocalEdit(entry); changed.push(entry); }
  });
  saveIotPlanToStorage();
  renderIotPlanTable();
  if (changed.length) syncIotPlanEntriesToSupabase(changed);
  showToast(`ย้าย ${changed.length.toLocaleString()} รายการไปแท็บ "วางแผนเสร็จแล้ว" แล้วครับ`, 'success');
}

// ย้ายรายการเดียวกลับจากแท็บ "วางแผนเสร็จแล้ว" ไปแท็บแผนติดตั้งหลัก เผื่อมาร์คผิดหรืออยากแก้แผนใหม่
function unfinalizeIotPlanEntry(id) {
  if (blockIfReadOnly()) return;
  const entry = iotInstallPlan.find(p => p.id === id);
  if (!entry) return;
  entry.planFinalized = false;
  markIotPlanLocalEdit(entry);
  saveIotPlanToStorage();
  renderIotPlanTable();
  syncIotPlanEntriesToSupabase([entry]);
  showToast('ย้ายกลับไปแท็บแผนติดตั้งแล้วครับ', 'success');
}

// ย้ายกลับทั้งกลุ่ม (ทุกรายการในอำเภอเดียว หรือทุกรายการในจังหวัดเดียว ถ้าไม่ระบุ district) จากแท็บ "วางแผนเสร็จแล้ว" กลับไปแท็บแผนติดตั้งหลักทีเดียว
function unfinalizeIotPlanGroup(province, district, evt) {
  if (blockIfReadOnly()) return;
  if (evt) evt.stopPropagation(); // ป้องกันไม่ให้ไปเรียก toggleGroupBody ซ้อนตอนกดปุ่มในหัวกลุ่ม
  const entries = iotInstallPlan.filter(p => {
    if (!p.planFinalized) return false;
    const prov = p.province || 'ไม่ระบุจังหวัด';
    const dist = p.district || 'ไม่ระบุอำเภอ';
    if (prov !== province) return false;
    if (district !== null && dist !== district) return false;
    return true;
  });
  if (!entries.length) return;
  entries.forEach(p => { p.planFinalized = false; markIotPlanLocalEdit(p); });
  saveIotPlanToStorage();
  renderIotPlanTable();
  syncIotPlanEntriesToSupabase(entries);
  const label = district !== null ? `"${district}"` : `จังหวัด "${province}" ทั้งหมด`;
  showToast(`ย้าย ${entries.length.toLocaleString()} รายการใน ${label} กลับไปแท็บแผนติดตั้งแล้วครับ`, 'success');
}

// ตัวกรอง (จังหวัด/อำเภอ/ตำบล/คำค้นหา) เฉพาะแท็บ "วางแผนเสร็จแล้ว" — ใช้ทั้งแสดงผลและกำหนดขอบเขตตอนส่งออก Excel/PDF
function getFilteredIotPlanFinalized() {
  const provSel = document.getElementById('iotPlanFinalizedFilterProvince');
  const distSel = document.getElementById('iotPlanFinalizedFilterDistrict');
  const subdistSel = document.getElementById('iotPlanFinalizedFilterSubdistrict');
  const searchEl = document.getElementById('iotPlanFinalizedFilterSearch');
  const province = provSel ? provSel.value : '';
  const district = distSel ? distSel.value : '';
  const subdistrict = subdistSel ? subdistSel.value : '';
  const q = searchEl ? searchEl.value.trim().toLowerCase() : '';
  return iotInstallPlan.filter(p => {
    if (!p.planFinalized) return false;
    if (province && p.province !== province) return false;
    if (district && p.district !== district) return false;
    if (subdistrict && p.subdistrict !== subdistrict) return false;
    if (q) {
      const hay = `${p.name || ''} ${p.nationalId || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

// เติมตัวเลือกจังหวัด/อำเภอ/ตำบล (ไล่ตามลำดับชั้น) จากรายการที่วางแผนเสร็จแล้วเท่านั้น ไม่ปนกับตารางแผนหลัก
function populateIotPlanFinalizedFilterOptions() {
  const provSel = document.getElementById('iotPlanFinalizedFilterProvince');
  const distSel = document.getElementById('iotPlanFinalizedFilterDistrict');
  const subdistSel = document.getElementById('iotPlanFinalizedFilterSubdistrict');
  if (!provSel || !distSel) return;
  const finalizedList = iotInstallPlan.filter(p => p.planFinalized);

  const currentProvince = provSel.value;
  const provinces = [...new Set(finalizedList.map(p => p.province).filter(Boolean))].sort();
  provSel.innerHTML = '<option value="">ทุกจังหวัด</option>' + provinces.map(p => `<option value="${p}">${p}</option>`).join('');
  provSel.value = provinces.includes(currentProvince) ? currentProvince : '';

  const selectedProvince = provSel.value;
  const currentDistrict = distSel.value;
  const districts = [...new Set(
    finalizedList.filter(p => !selectedProvince || p.province === selectedProvince).map(p => p.district).filter(Boolean)
  )].sort();
  distSel.innerHTML = '<option value="">ทุกอำเภอ</option>' + districts.map(d => `<option value="${d}">${d}</option>`).join('');
  distSel.value = districts.includes(currentDistrict) ? currentDistrict : '';

  if (subdistSel) {
    const selectedDistrict = distSel.value;
    const currentSubdistrict = subdistSel.value;
    const subdistricts = [...new Set(
      finalizedList
        .filter(p => (!selectedProvince || p.province === selectedProvince) && (!selectedDistrict || p.district === selectedDistrict))
        .map(p => p.subdistrict).filter(Boolean)
    )].sort();
    subdistSel.innerHTML = '<option value="">ทุกตำบล</option>' + subdistricts.map(s => `<option value="${s}">${s}</option>`).join('');
    subdistSel.value = subdistricts.includes(currentSubdistrict) ? currentSubdistrict : '';
  }
}

// เลือกจังหวัดใหม่ -> อำเภอ/ตำบลต้องไล่ตัวเลือกใหม่ตามจังหวัดนั้นก่อน แล้วค่อยกรองใหม่
function onIotPlanFinalizedFilterProvinceChange() {
  populateIotPlanFinalizedFilterOptions();
  renderIotPlanFinalizedSection();
}

// เลือกอำเภอใหม่ -> ตำบลต้องไล่ตัวเลือกใหม่ตามอำเภอนั้นก่อน แล้วค่อยกรองใหม่
function onIotPlanFinalizedFilterDistrictChange() {
  populateIotPlanFinalizedFilterOptions();
  renderIotPlanFinalizedSection();
}

// จัดกลุ่มรายการ "วางแผนเสร็จแล้ว" เป็นจังหวัด -> อำเภอ แบบพับ/กางได้ ลดความรกเวลามีหลายพื้นที่ ใช้ template แถวเดียวกับตารางหลัก (แก้ไขได้ปกติ)
function renderIotPlanFinalizedSection() {
  const container = document.getElementById('iotPlanFinalizedGroups');
  const countBadge = document.getElementById('iotPlanFinalizedCountBadge');
  const tabBadge = document.getElementById('iotPlanFinalizedTabBadge');
  const allFinalized = iotInstallPlan.filter(p => p.planFinalized);
  if (countBadge) countBadge.textContent = allFinalized.length.toLocaleString() + ' รายการ';
  if (tabBadge) tabBadge.textContent = allFinalized.length.toLocaleString();
  if (!container) return;

  populateIotPlanFinalizedFilterOptions();
  const finalized = getFilteredIotPlanFinalized();

  const countInfo = document.getElementById('iotPlanFinalizedFilterCountInfo');
  if (countInfo) {
    countInfo.textContent = `แสดง ${finalized.length.toLocaleString()} จาก ${allFinalized.length.toLocaleString()} รายการ`;
  }

  if (!allFinalized.length) {
    container.innerHTML = '<div class="empty-state-cell"><span class="empty-icon"><i data-icon="done" data-size="15"></i></span><span class="empty-text">ยังไม่มีรายการที่วางแผนเสร็จแล้ว — ติ๊กเลือกรายการในแท็บ "<i data-icon="clipboard" data-size="15"></i> แผนติดตั้ง" แล้วกดปุ่ม "<i data-icon="done" data-size="15"></i> ทำเครื่องหมายว่าวางแผนเสร็จแล้ว"</span></div>';
    return;
  }
  if (!finalized.length) {
    container.innerHTML = '<div class="empty-state-cell"><span class="empty-icon"><i data-icon="search" data-size="15"></i></span><span class="empty-text">ไม่พบรายการที่ตรงกับตัวกรอง<br>ลองปรับตัวกรองดูใหม่นะครับ</span></div>';
    return;
  }

  const theadRowHtml = `<tr>
      <th></th>
      <th>ลำดับ</th><th>นัดหมาย</th><th>วันที่ / เวลาติดตั้ง</th><th>ชื่อ-นามสกุล</th><th>เลขบัตรประชาชน</th><th>เบอร์ติดต่อ</th><th>จังหวัด</th><th>อำเภอ</th><th>ตำบล</th>
      <th>สถานะ</th><th>ทีมติดตั้ง</th><th>ผู้ดำเนินการ</th><th>ตู้</th><th>ปั๊มน้ำ</th><th>ขนาดท่อ</th><th>ขนาดวาล์ว</th><th>แหล่งน้ำ</th><th>รูปแบบการให้น้ำ</th><th>การชำระเงิน</th><th>ยอดชำระ</th><th>ตำแหน่ง (Google Maps)</th><th>หมายเหตุ</th><th></th>
    </tr>`;

  // แยกเป็น 2 กลุ่มใหญ่ก่อน: "วางแผนแล้ว" (มีวันนัด + ทีมติดตั้ง) กับ "ยังไม่วางแผน" (ขาดวันนัดหรือทีม) ลดการหลงกัน
  const isFinalizedPlanned = p => !!(p.installDate && p.installTeam);

  function finalizedGroupHtml(list) {
    if (!list.length) return '<div style="padding:8px 12px; color:var(--muted); font-size:13px;">— ไม่มีรายการในกลุ่มนี้ —</div>';
    const byProvince = {};
    list.forEach(p => {
      const prov = p.province || 'ไม่ระบุจังหวัด';
      const dist = p.district || 'ไม่ระบุอำเภอ';
      if (!byProvince[prov]) byProvince[prov] = {};
      if (!byProvince[prov][dist]) byProvince[prov][dist] = [];
      byProvince[prov][dist].push(p);
    });
    const provinces = Object.keys(byProvince).sort((a, b) => a.localeCompare(b, 'th'));
    return provinces.map(prov => {
      const districts = byProvince[prov];
      const districtNames = Object.keys(districts).sort((a, b) => a.localeCompare(b, 'th'));
      const provTotal = districtNames.reduce((sum, d) => sum + districts[d].length, 0);
      const districtHtml = districtNames.map(dist => {
        const rows = districts[dist];
        const rowsHtml = rows.map((p, i) => iotPlanRowHtml(p, i)).join('');
        const distSafe = dist.replace(/'/g, "\\'");
        const provSafeForDist = prov.replace(/'/g, "\\'");
        return `
          <div class="plan-group-header" style="cursor:pointer; display:flex; align-items:center; gap:8px; padding:7px 10px; background:var(--card); border:1px solid var(--border); border-radius:6px; margin-top:8px;" onclick="toggleGroupBody(this)">
            <span class="chevron">▶</span>
            <strong style="font-size:13.5px;">${dist}</strong>
            <span style="font-size:12px; color:var(--muted);">${rows.length.toLocaleString()} รายการ</span>
            <button type="button" class="btn-linklike" style="margin-left:auto;" onclick="unfinalizeIotPlanGroup('${provSafeForDist}','${distSafe}', event)"><i data-icon="undo" data-size="15"></i> ย้ายกลับทั้งอำเภอ</button>
          </div>
          <div style="display:none;">
            <div class="table-wrap" style="margin-top:6px;">
              <table class="detail-table">
                <thead>${theadRowHtml}</thead>
                <tbody>${rowsHtml}</tbody>
              </table>
            </div>
          </div>`;
      }).join('');
      const provSafe = prov.replace(/'/g, "\\'");
      return `
        <div class="plan-group-header" style="cursor:pointer; display:flex; align-items:center; gap:8px; padding:10px 12px; background:var(--card); border:1px solid var(--border); border-radius:8px; margin-top:14px;" onclick="toggleGroupBody(this)">
          <span class="chevron">▶</span>
          <strong><i data-icon="pin" data-size="15"></i> ${prov}</strong>
          <span style="font-size:12.5px; color:var(--muted);">${provTotal.toLocaleString()} รายการ</span>
          <button type="button" class="btn-linklike" style="margin-left:auto;" onclick="unfinalizeIotPlanGroup('${provSafe}', null, event)"><i data-icon="undo" data-size="15"></i> ย้ายกลับทั้งจังหวัด</button>
        </div>
        <div style="display:none; padding-left:14px;">
          ${districtHtml}
        </div>`;
    }).join('');
  }

  const plannedList = finalized.filter(isFinalizedPlanned);
  const notPlannedList = finalized.filter(p => !isFinalizedPlanned(p));

  container.innerHTML = `
    <div class="plan-group-header" style="cursor:pointer; display:flex; align-items:center; gap:8px; padding:11px 13px; background:#e2f5ef; border:1px solid #b7e2d2; border-radius:8px; margin-top:6px;" onclick="toggleGroupBody(this)">
      <span class="chevron open">▶</span>
      <strong style="color:#1f7a54; font-size:14.5px;"><i data-icon="calendar" data-size="15"></i> วางแผนแล้ว</strong>
      <span style="font-size:12.5px; color:var(--muted);">มีวันนัด + ทีมติดตั้งแล้ว · ${plannedList.length.toLocaleString()} รายการ</span>
    </div>
    <div style="padding-left:6px;">${finalizedGroupHtml(plannedList)}</div>

    <div class="plan-group-header" style="cursor:pointer; display:flex; align-items:center; gap:8px; padding:11px 13px; background:#fff4d6; border:1px solid #f0d79a; border-radius:8px; margin-top:18px;" onclick="toggleGroupBody(this)">
      <span class="chevron open">▶</span>
      <strong style="color:#b5650f; font-size:14.5px;">⏳ ยังไม่วางแผน</strong>
      <span style="font-size:12.5px; color:var(--muted);">ยังขาดวันนัดหรือทีมติดตั้ง · ${notPlannedList.length.toLocaleString()} รายการ</span>
    </div>
    <div style="padding-left:6px;">${finalizedGroupHtml(notPlannedList)}</div>
  `;
}

function renderIotPlanTable() {
  const tbody = document.getElementById('iotPlanTbody');
  if (!tbody) return;
  document.getElementById('iotPlanCountBadge').textContent = iotInstallPlan.length.toLocaleString() + ' รายการ';
  populateIotPlanFilterOptions();
  populateIotPlanBulkOperatorOptions();
  applyIotPlanFilters();
  renderIotPlanDashboard();
  renderIotPlanFinalizedSection();
  if (iotPlanCurrentView === 'calendar') renderIotPlanCalendar();
}

window.iotPlanSyncDebounceTimers = {};

// ---- ซิงก์แบบเรียลไทม์ (แผนติดตั้ง IoT): เหมือนแผนอบรม แต่สำหรับตาราง iot_install_plan
window.iotPlanRealtimeChannel = null;
window.iotPlanRealtimeRefreshTimer = null;

function scheduleRealtimeIotPlanRefresh() {
  if (iotPlanRealtimeRefreshTimer) clearTimeout(iotPlanRealtimeRefreshTimer);
  iotPlanRealtimeRefreshTimer = setTimeout(() => {
    iotPlanRealtimeRefreshTimer = null;
    // เลื่อนการดึงข้อมูลออกไปก่อน ถ้ายังกรอกอยู่ หรือยังมีของที่แก้ไว้แต่ยังส่งขึ้นไม่เสร็จ
    // (โหมดโทรนัดวาดฟอร์มใหม่ทุกครั้งที่เลือก โฟกัสเลยหลุด เช็ค activeElement อย่างเดียวไม่พอ)
    if (isEditingInContainer(['iotPlanTbody', 'iotPlanCalendarView', 'iotCallFormPane']) ||
        (typeof iotCallHasUnsyncedWrites === 'function' && iotCallHasUnsyncedWrites())) {
      scheduleRealtimeIotPlanRefresh();
      return;
    }
    syncIotPlanFromSupabase();
  }, 1200);
}

function setupIotPlanRealtimeSync() {
  if (!supabaseClient || iotPlanRealtimeChannel) return;
  iotPlanRealtimeChannel = supabaseClient
    .channel('iot_install_plan_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'iot_install_plan' }, (payload) => {
      notifyRealtimeChange(payload, 'แผนติดตั้ง IoT');
      scheduleRealtimeIotPlanRefresh();
    })
    .subscribe();
}

function scheduleIotPlanEntrySync(entry, immediate) {
  const key = entry.id;
  if (iotPlanSyncDebounceTimers[key]) clearTimeout(iotPlanSyncDebounceTimers[key]);
  if (immediate) {
    syncIotPlanEntriesToSupabase([entry]);
    return;
  }
  iotPlanSyncDebounceTimers[key] = setTimeout(() => {
    syncIotPlanEntriesToSupabase([entry]);
    delete iotPlanSyncDebounceTimers[key];
  }, 800);
}

function updateIotPlanTimePart(id, part, value) {
  if (blockIfReadOnly()) return;
  const entry = iotInstallPlan.find(p => p.id === id);
  if (!entry) return;
  const [curH, curM] = (entry.installTime || '').split(':');
  const h = part === 'h' ? value : (curH || '');
  let m = part === 'm' ? value : (curM || '');
  if (part === 'h' && value && !m) m = '00'; // เลือกชั่วโมงก่อน ตั้งนาทีเริ่มต้นเป็น 00 ให้เลย ไม่ต้องกดนาทีซ้ำถ้าไม่สนใจนาที
  const newTime = (h && m) ? `${h}:${m}` : '';
  updateIotPlanField(id, 'installTime', newTime);
}

function updateIotPlanField(id, field, value) {
  if (blockIfReadOnly()) return;
  const entry = iotInstallPlan.find(p => p.id === id);
  if (!entry) return;
  entry[field] = value;
  if (field === 'boxType' && value === 'no_button') {
    entry.paymentStatus = ''; // ตู้ไม่มีปุ่มกด ไม่ต้องเก็บเงิน เลยล้างค่าที่เคยเลือกไว้ (ถ้ามี)
  }
  markIotPlanLocalEdit(entry);   // กันข้อมูลจากเซิร์ฟเวอร์ที่ยังเก่ากว่ามาทับ (ดู syncIotPlanFromSupabase)
  saveIotPlanToStorage();
  if (field === 'status' || field === 'installDate' || field === 'installTime' || field === 'boxType') {
    // สถานะ/วันที่เปลี่ยนอาจทำให้แถวนี้หลุดจากตัวกรองที่เลือกอยู่ และวันที่ติดตั้งเปลี่ยนต้องอัปเดตเครื่องหมาย /− ในแถวทันที
    // เวลาเปลี่ยนต้อง re-render เพื่อให้ select นาทีที่ตั้งอัตโนมัติ (00) แสดงค่าล่าสุดถูกต้อง
    // ตู้เปลี่ยนต้อง re-render เพื่อให้ช่องการชำระเงินสลับเป็น "-" ทันทีเมื่อเลือกตู้ไม่มีปุ่มกด
    applyIotPlanFilters();
  }
  renderIotPlanDashboard();
  scheduleIotPlanEntrySync(entry, field === 'installDate' || field === 'status');
}

async function removeIotPlanEntry(id) {
  if (blockIfReadOnly()) return;
  const entry = iotInstallPlan.find(p => p.id === id);
  if (entry && entry.installDate && entry.installDate >= todayDateStr()) {
    const confirmed = await showConfirmModal(`${entry.name || 'คนนี้'} มีนัดติดตั้ง IoT วันที่ ${formatThaiDate(entry.installDate)} อยู่ ต้องการลบออกจากแผนหรือไม่?`);
    if (!confirmed) return;
  }
  const nid = entry ? entry.nationalId : '';
  // เก็บ id ของทุกแถวที่จะลบ (คนเดียวกัน) ก่อน — เพื่อยกเลิก "ตัวจับเวลาซิงก์ที่ค้างอยู่" ของแต่ละแถว
  // (สำคัญมาก: ถ้าเพิ่งแก้ช่องแล้วกดลบเลย ตัวจับเวลา debounce 800ms จะ upsert แถวกลับเข้ามาใหม่หลังเราลบ ทำให้ชื่อเด้งกลับ)
  const removedIds = iotInstallPlan.filter(p => p.id === id || (nid && p.nationalId === nid)).map(p => p.id);
  removedIds.forEach(rid => {
    if (iotPlanSyncDebounceTimers[rid]) { clearTimeout(iotPlanSyncDebounceTimers[rid]); delete iotPlanSyncDebounceTimers[rid]; }
  });
  // ลบทุกแถวที่เป็นคนเดียวกัน (กันกรณีมีแถวซ้ำ id ต่างกัน ที่ทำให้ชื่อเด้งกลับหลังรีเฟรช)
  iotInstallPlan = iotInstallPlan.filter(p => !(p.id === id || (nid && p.nationalId === nid)));
  markIotPlanDeleted(nid);
  saveIotPlanToStorage();
  renderIotPlanTable();
  refreshIotPeoplePanel();
  await deleteIotPlanEntryFromSupabase(id, nid);
}

// ยกเลิกการเพิ่มคนเข้าแผนติดตั้ง IoT โดยหาแถวแผนจากเลขบัตรประชาชน (ใช้จากปุ่ม "ยกเลิก" ในพาแนลเลือกคน)
async function removePersonFromIotPlanByNid(nationalId) {
  if (blockIfReadOnly()) return;
  const entry = iotInstallPlan.find(e => e.nationalId === nationalId);
  if (!entry) return;
  await removeIotPlanEntry(entry.id);
}

async function clearIotPlan() {
  if (blockIfReadOnly()) return;
  if (!iotInstallPlan.length) return;
  const confirmed = await showConfirmModal('ต้องการล้างรายการแผนติดตั้ง IoT ทั้งหมดหรือไม่? ข้อมูลจะหายจากเบราว์เซอร์นี้ทันที');
  if (!confirmed) return;
  const idsToDelete = iotInstallPlan.map(p => p.id);
  iotInstallPlan.forEach(p => markIotPlanDeleted(p.nationalId));
  iotInstallPlan = [];
  saveIotPlanToStorage();
  renderIotPlanTable();
  if (currentIotPeoplePanelProvince && currentIotPeoplePanelDistrict) {
    showIotDistrictPeople(currentIotPeoplePanelProvince, currentIotPeoplePanelDistrict);
  }
  deleteAllIotPlanEntriesFromSupabase(idsToDelete);
  showToast('ล้างรายการแผนติดตั้ง IoT ทั้งหมดแล้ว', 'success');
}

function filterIotPlanByScheduled(value) {
  // มุมมองตารางถูกตัดออกแล้ว — คนที่ยังไม่นัดคือคิวของโหมดโทรนัดโดยตรง
  switchIotPlanView('call');
  const callSection = document.getElementById('iotPlanCallView');
  if (callSection) callSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function switchIotPlanView(view) {
  iotPlanCurrentView = view;
  document.querySelectorAll('#tab-iot-plan .view-toggle-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
  });
  const tableView = document.getElementById('iotPlanTableView');
  const calendarView = document.getElementById('iotPlanCalendarView');
  const callView = document.getElementById('iotPlanCallView');
  const controls = document.getElementById('iotPlanTableControls');
  if (tableView) tableView.style.display = view === 'table' ? '' : 'none';
  if (calendarView) calendarView.style.display = view === 'calendar' ? '' : 'none';
  if (callView) callView.style.display = view === 'call' ? '' : 'none';
  if (controls) controls.style.display = view === 'call' ? 'none' : '';
  if (view === 'calendar') {
    renderIotPlanCalendar();
  } else if (view === 'call') {
    renderIotCallView();
  } else {
    applyIotPlanFilters();
  }
}

// ===================== โหมดโทรนัด (แอดมินบนคอม): ซ้าย=คิวคนยังไม่นัด · ขวา=ฟอร์มถามครบทุกหัวข้อ =====================
window.iotCallSelectedNid = null;
window.iotCallFilter = { province: '', district: '', subdistrict: '', search: '' };
window.IOT_CALL_DOT = { pending: '#C9A227', not_contacted: '#B4B2A9', survey: '#378ADD', site_not_ready: '#EF9F27', ready: '#1D9E75', done_pending_docs: '#8FA83C', done: '#639922', cancelled: '#E24B4A' };
function _callEsc(s) { return (s || '').replace(/"/g, '&quot;'); }

// expose ฟังก์ชันของโมดูลนี้ให้ inline handlers และโมดูลอื่นเรียกผ่าน window ได้
Object.assign(window, {
  saveIotPlanToStorage, iotPlanEntryToSupabaseRow, syncIotPlanEntriesToSupabase, deleteIotPlanEntryFromSupabase, deleteAllIotPlanEntriesFromSupabase, syncIotPlanFromSupabase,
  addPersonToIotPlan, addPersonToIotPlanByNid, addAllNotInstalledToIotPlanFor, addAllDistrictNotInstalledToIotPlan, addSelectedIotPeopleToIotPlan, toggleSelectAllIotPeople,
  getIotDropdownOptions, _iotRowByNid, getPlanWaterDefaults, planWaterVal, planIrrigationVal, iotSelectOptionsHtml,
  loadDropdownOptions, addDropdownOption, removeCustomDropdownOption, toggleDropdownManager, renderDropdownManager, canAddDropdownOption,
  ensureAddOptionItem, enhanceAddOptionSelects, refillDropdownSelect, saveNewDropdownOptions, promptAddDropdownOptions, openAddOptionModal,
  getIotMonthYearFromDate, getIotWeekOfMonthFromDate, buildIotDateFromMonthWeek, getIotMonthOptionsHtml, formatIotPlanWeekLabel, formatIotPlanWeekRangeLabel,
  formatIotPlanWeekLabelRelative, updateIotPlanMonthWeek, iotPlanRowHtml, applyInstallDateToSubdistrict, getFilteredIotPlan, populateIotPlanFilterOptions,
  applyIotPlanFilters, onIotPlanFilterProvinceChange, onIotPlanFilterDistrictChange, populateIotPlanBulkOperatorOptions, updateIotPlanBulkSelectedCount, toggleSelectAllIotPlanRows,
  applyBulkIotPlanOperator, applyBulkIotPlanFinalize, unfinalizeIotPlanEntry, unfinalizeIotPlanGroup, getFilteredIotPlanFinalized, populateIotPlanFinalizedFilterOptions,
  onIotPlanFinalizedFilterProvinceChange, onIotPlanFinalizedFilterDistrictChange, renderIotPlanFinalizedSection, renderIotPlanTable, scheduleRealtimeIotPlanRefresh, setupIotPlanRealtimeSync,
  markIotPlanLocalEdit, markIotPlanDeleted,
  scheduleIotPlanEntrySync, updateIotPlanTimePart, updateIotPlanField, removeIotPlanEntry, removePersonFromIotPlanByNid, clearIotPlan,
  filterIotPlanByScheduled, switchIotPlanView, _callEsc,
});
