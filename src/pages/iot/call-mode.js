// ===== โหมดโทรนัด (แอดมิน): คิวคนยังไม่นัด + ฟอร์มบันทึกการโทร =====
// แยกมาจาก main.js เดิม — ตัวแปร/ฟังก์ชันแชร์ผ่าน window (โค้ดเดิมออกแบบเป็น global scope)


// คนที่ต้อง "โทรนัด" = ยังไม่ติดตั้ง (N) + ไม่ติดบล็อก + ยังไม่นัด (ยังไม่มีทั้งวันและทีม) — เก็บคนที่กำลังเลือกอยู่ไว้เสมอ
function iotCallBaseRows() {
  if (typeof allIotRows === 'undefined') return [];
  return getIotVisibleRows().filter(r =>
    r && r.national_id &&
    r[IOT_FIELDS.status] === IOT_FIELDS.notDone &&
    !getIotInstallBlockerState(r)
  );
}
function iotCallIsScheduled(nid) {
  const e = iotInstallPlan.find(p => p.nationalId === nid);
  return !!(e && e.installDate && e.installTeam);
}
function iotCallQueue() {
  const f = iotCallFilter;
  return iotCallBaseRows().filter(r => {
    if (iotCallIsScheduled(r.national_id) && r.national_id !== iotCallSelectedNid) return false;
    const _e = iotInstallPlan.find(p => p.nationalId === r.national_id);
    if (_e && _e.status === 'cancelled' && r.national_id !== iotCallSelectedNid) return false;
    if (f.province && normName(r[IOT_FIELDS.province]) !== normName(f.province)) return false;
    if (f.district && normName(r[IOT_FIELDS.district]) !== normName(f.district)) return false;
    if (f.subdistrict && normName(r.farm_subdistrict) !== normName(f.subdistrict)) return false;
    if (f.search) {
      const hay = `${r.prefix || ''}${r.first_name || ''} ${r.last_name || ''} ${r.national_id || ''} ${r.phone || ''}`.toLowerCase();
      if (!hay.includes(f.search.toLowerCase())) return false;
    }
    return true;
  }).sort((a, b) =>
    normName(a[IOT_FIELDS.province]).localeCompare(normName(b[IOT_FIELDS.province]), 'th') ||
    normName(a[IOT_FIELDS.district]).localeCompare(normName(b[IOT_FIELDS.district]), 'th') ||
    normName(a.farm_subdistrict || '').localeCompare(normName(b.farm_subdistrict || ''), 'th') ||
    `${a.first_name || ''}`.localeCompare(`${b.first_name || ''}`, 'th')
  );
}
/** คนที่ "ยังไม่ได้นัด" จริงๆ ทั้งหมด (ไม่สนตัวกรอง) — ใช้ทั้งหัวคิวโทรนัดและ KPI แดชบอร์ด
 *  จะได้ไม่มีทางขัดกันเอง (เดิม KPI นับจากแถวใน iotInstallPlan อย่างเดียว เลยได้เลขน้อยกว่าคิวจริงมาก) */
function iotCallPendingRows() {
  return iotCallBaseRows().filter(r => {
    if (iotCallIsScheduled(r.national_id)) return false;         // นัดแล้ว (มีทั้งวันและทีม)
    const e = iotInstallPlan.find(p => p.nationalId === r.national_id);
    if (e && e.status === 'cancelled') return false;             // สละสิทธิ์แบบเก่า (ยังไม่มีเหตุผลบันทึกไว้)
    return true;
  });
}

/* ===== ทางลัดจากหน้าแผนที่ -> เมนูโทรนัด =====
   หน้าแผนที่ไม่ให้นัดตรงนั้นแล้ว กดชื่อคน/อำเภอ = เด้งมาที่เมนูโทรนัดพร้อมตัวกรองให้เสร็จ */
function iotCallJumpToView() {
  if (typeof switchTab === 'function') switchTab('iot-plan');
  if (typeof switchIotPlanView === 'function') switchIotPlanView('call');
  else renderIotCallView();
  const box = document.getElementById('iotPlanCallView');
  if (box) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** กดทั้งอำเภอ (หรือทั้งจังหวัด ถ้าไม่ส่ง district) -> ไปเมนูโทรนัด พร้อมกรองพื้นที่นั้นให้เลย */
function goToIotCallArea(province, district) {
  iotCallFilter.province = province || '';
  iotCallFilter.district = district || '';
  iotCallFilter.subdistrict = '';
  iotCallFilter.search = '';
  iotCallSelectedNid = null;                       // ให้เลือกคนแรกของคิวในพื้นที่นั้นเอง
  iotCallJumpToView();
  const n = iotCallPendingRows().filter(r =>
    (!province || normName(r[IOT_FIELDS.province]) === normName(province)) &&
    (!district || normName(r[IOT_FIELDS.district]) === normName(district))
  ).length;
  const where = district ? `อำเภอ${district}` : `จังหวัด${province}`;
  showToast(n ? `โทรนัด ${where} — ยังไม่ได้นัด ${n.toLocaleString()} คน` : `${where} นัดครบแล้ว ไม่มีคิวค้าง`, n ? 'info' : 'success');
}

/** กดชื่อคนบนแผนที่ -> ไปเมนูโทรนัด แล้วเปิดคนนั้นให้เลย (กรองเหลือแค่อำเภอของเขา จะได้โทรต่อในพื้นที่เดียวกันได้) */
function goToIotCallPerson(nid) {
  const row = (typeof allIotRows !== 'undefined') ? allIotRows.find(r => r.national_id === nid) : null;
  iotCallFilter.province = row ? (row[IOT_FIELDS.province] || '') : '';
  iotCallFilter.district = row ? (row[IOT_FIELDS.district] || '') : '';
  iotCallFilter.subdistrict = '';
  iotCallFilter.search = '';
  iotCallSelectedNid = nid;
  iotCallJumpToView();
}

// ===== การบันทึกในโหมดโทรนัด =====
// ข้อมูลที่กรอก "บันทึกอัตโนมัติ" ทุกครั้งที่เปลี่ยนค่า (ไม่มีทางกรอกแล้วหาย)
// แต่ "แผนสำเร็จ" (planFinalized -> ไปแท็บ "วางแผนเสร็จแล้ว") เกิดขึ้นเมื่อแอดมินกดปุ่มยืนยันเท่านั้น
window.iotCallSnapshot = null;
window.iotCallDirty = false;
window.iotCallSavedAt = 0;      // เวลาบันทึกอัตโนมัติล่าสุด (ไว้โชว์ว่าบันทึกแล้ว)

let _iotCallSyncTimer = null;
const _iotCallSyncPending = new Set();
/** บันทึกอัตโนมัติ: ลงเครื่องทันที + ส่งขึ้น Supabase แบบหน่วงสั้นๆ (กันยิงรัวตอนกรอกติดกัน) */
function iotCallAutoSave(nid) {
  const e = iotInstallPlan.find(p => p.nationalId === nid);
  // ประทับเวลาที่แก้ในเครื่อง — syncIotPlanFromSupabase จะไม่เอาข้อมูลเก่ากว่านี้มาทับ
  if (e && typeof markIotPlanLocalEdit === 'function') markIotPlanLocalEdit(e);
  saveIotPlanToStorage();
  iotCallSavedAt = Date.now();
  _iotCallSyncPending.add(nid);
  clearTimeout(_iotCallSyncTimer);
  _iotCallSyncTimer = setTimeout(() => {
    _iotCallSyncTimer = null;
    const list = iotInstallPlan.filter(p => _iotCallSyncPending.has(p.nationalId));
    _iotCallSyncPending.clear();
    if (list.length && typeof syncIotPlanEntriesToSupabase === 'function') syncIotPlanEntriesToSupabase(list);
  }, 700);
}

/** ยังมีของที่แก้ไว้แต่ยังส่งขึ้น Supabase ไม่เสร็จไหม — ใช้กัน realtime ดึงข้อมูลเก่ามาทับกลางคัน */
function iotCallHasUnsyncedWrites() {
  return _iotCallSyncPending.size > 0 || !!_iotCallSyncTimer;
}

function iotCallTakeSnapshot(nid) {
  const e = iotInstallPlan.find(p => p.nationalId === nid);
  iotCallSnapshot = { nid, existed: !!e, data: e ? JSON.parse(JSON.stringify(e)) : null };
  iotCallDirty = false;
}
function iotCallRevertDraft() {
  if (!iotCallSnapshot) { iotCallDirty = false; return; }
  const { nid, existed, data } = iotCallSnapshot;
  const idx = iotInstallPlan.findIndex(p => p.nationalId === nid);
  if (idx >= 0) {
    if (existed) iotInstallPlan[idx] = data;
    else iotInstallPlan.splice(idx, 1); // แถวนี้เพิ่งถูกสร้างตอนกรอก ยังไม่ได้บันทึก -> เอาออก
  }
  iotCallDirty = false;
}

// หา (หรือสร้าง) แถวในแผนติดตั้งของคนนี้ — สร้างไว้ในหน่วยความจำเท่านั้น ยังไม่บันทึก
function iotCallEnsureEntry(nid) {
  let e = iotInstallPlan.find(p => p.nationalId === nid);
  if (e) return e;
  const row = allIotRows.find(r => r.national_id === nid);
  if (!row) return null;
  e = addPersonToIotPlan(row);
  return e || iotInstallPlan.find(p => p.nationalId === nid);
}
function iotCallSetField(nid, field, value) {
  if (blockIfReadOnly()) return;
  if (!iotCallSnapshot || iotCallSnapshot.nid !== nid) iotCallTakeSnapshot(nid);
  const e = iotCallEnsureEntry(nid); if (!e) return;
  e[field] = value;
  if (field === 'boxType' && value === 'no_button') e.paymentStatus = '';
  iotCallAutoSave(nid);          // บันทึกให้เลย — แต่ยังไม่ใช่ "แผนสำเร็จ"
  renderIotCallForm();
  renderIotCallRowDot(nid);
}
function iotCallSetSchedule(nid, part, value) {
  if (blockIfReadOnly()) return;
  if (!iotCallSnapshot || iotCallSnapshot.nid !== nid) iotCallTakeSnapshot(nid);
  const e = iotCallEnsureEntry(nid); if (!e) return;
  updateIotPlanMonthWeek(e.id, part, value);
  iotCallAutoSave(nid);
  renderIotCallForm();
}
function iotCallSetFilter(key, value) {
  iotCallFilter[key] = value;
  if (key === 'province') { iotCallFilter.district = ''; iotCallFilter.subdistrict = ''; }
  if (key === 'district') { iotCallFilter.subdistrict = ''; }
  renderIotCallView();
}
function iotCallOnSearch(v) { iotCallFilter.search = (v || '').trim(); renderIotCallRows(); }
function iotCallSelect(nid) {
  if (nid === iotCallSelectedNid) return;
  // ข้อมูลบันทึกอัตโนมัติไปแล้ว เปลี่ยนคนได้เลย ไม่ต้องถามซ้ำ
  iotCallSelectedNid = nid;
  iotCallTakeSnapshot(nid);
  // แค่เปลี่ยนคนที่เลือก — ไม่ต้องวาดคิวใหม่ทั้งแถบ ไม่งั้นสกรอลล์เด้งกลับขึ้นบนสุดทุกครั้ง
  iotCallSyncSelection();
}

/** ย้ายไฮไลท์ในคิวซ้ายไปคนที่เลือก แล้ววาดเฉพาะฟอร์มฝั่งขวาใหม่ (คงตำแหน่งสกรอลล์เดิมไว้) */
function iotCallSyncSelection() {
  const rows = document.getElementById('iotCallRows');
  if (!rows) { renderIotCallView(); return; }   // ยังไม่เคยวาดคิว -> วาดทั้งหน้า
  rows.querySelectorAll('.call-row').forEach((el) => {
    el.classList.toggle('on', el.id === 'iotCallRow_' + iotCallSelectedNid);
  });
  const row = document.getElementById('iotCallRow_' + iotCallSelectedNid);
  // block:'nearest' = เลื่อนเฉพาะตอนแถวหลุดจอจริงๆ (กดแถวที่เห็นอยู่แล้วจะไม่ขยับเลย)
  if (row) row.scrollIntoView({ block: 'nearest' });
  renderIotCallForm();
}
function iotCallGoRelative(delta) {
  const q = iotCallQueue();
  const idx = q.findIndex(r => r.national_id === iotCallSelectedNid);
  const ni = Math.max(0, Math.min(q.length - 1, (idx < 0 ? 0 : idx) + delta));
  if (q[ni]) iotCallSelect(q[ni].national_id);
}
// "ไม่รับ / สละสิทธิ์" = ทำเครื่องหมายว่าติดตั้งไม่ได้ พร้อมเลือกเหตุผล (ไปโผล่ในแท็บ "ติดตั้งไม่ได้")
function iotCallDecline(nid) {
  if (blockIfReadOnly()) return;
  iotCallDeclineNid = nid;   // จำไว้ว่าสั่งมาจากโหมดโทรนัด เพื่อไปคนถัดไปหลังบันทึกเหตุผล
  openIotInstallBlockerModalByNationalId(nid);
}
window.iotCallDeclineNid = null;

// เรียกหลังบันทึกเหตุผล "ติดตั้งไม่ได้" สำเร็จ — ปิดงานคนนี้ในคิวโทรนัดแล้วไปคนถัดไป
function iotCallAfterDecline(nid) {
  const e = iotInstallPlan.find(p => p.nationalId === nid);
  if (e) {
    e.status = 'cancelled';
    e.planFinalized = false;
    if (typeof markIotPlanLocalEdit === 'function') markIotPlanLocalEdit(e);
    saveIotPlanToStorage();
    syncIotPlanEntriesToSupabase([e]);
  }
  iotCallDirty = false;
  iotCallSnapshot = null;
  const next = iotCallQueue().find(r => r.national_id !== nid);
  iotCallSelectedNid = next ? next.national_id : null;
  if (iotCallSelectedNid) iotCallTakeSnapshot(iotCallSelectedNid);
  renderIotCallView();
}
function iotCallSaveNext() {
  const cur = iotCallSelectedNid;
  // ข้อมูลบันทึกอัตโนมัติไปตั้งแต่ตอนกรอกแล้ว — ปุ่มนี้คือ "ยืนยันว่าแผนสำเร็จ" เท่านั้น
  // แอดมินกดเองเท่านั้นถึงจะย้ายเข้าแท็บ "วางแผนเสร็จแล้ว" (ยกเว้นคนสละสิทธิ์ ไม่นับเป็นแผนสำเร็จ)
  const e = cur ? iotInstallPlan.find(p => p.nationalId === cur) : null;
  if (!e) { showToast('ยังไม่ได้กรอกอะไรเลยครับ', 'warn'); return; }
  if (e.status !== 'cancelled') e.planFinalized = true;
  if (typeof markIotPlanLocalEdit === 'function') markIotPlanLocalEdit(e);
  saveIotPlanToStorage();
  syncIotPlanEntriesToSupabase([e]);
  iotCallSnapshot = null;

  const next = iotCallQueue().find(r => r.national_id !== cur && !iotCallIsScheduled(r.national_id));
  iotCallSelectedNid = next ? next.national_id : null;
  if (iotCallSelectedNid) iotCallTakeSnapshot(iotCallSelectedNid);
  renderIotCallView();
  showToast(iotCallSelectedNid ? 'ยืนยันแผนสำเร็จแล้ว → คนถัดไป' : 'ยืนยันแผนสำเร็จแล้ว — หมดคิวในตัวกรองนี้แล้วครับ', 'success');
}

function renderIotCallView() {
  const box = document.getElementById('iotPlanCallView');
  if (!box) return;
  const q = iotCallQueue();
  if (!iotCallSelectedNid && q.length) iotCallSelectedNid = q[0].national_id;
  // จำตำแหน่งสกรอลล์ของคิวไว้ก่อนวาดใหม่ (เช่น หลังกดบันทึก) จะได้ไม่เด้งกลับขึ้นบนสุด
  const prevPane = document.getElementById('iotCallRows');
  const prevScroll = prevPane ? prevPane.scrollTop : 0;
  const savedW = Number(localStorage.getItem('otod_call_list_w')) || 320;
  box.innerHTML = `<div class="call-wrap" id="iotCallWrap" style="--call-list-w:${Math.min(Math.max(savedW, 240), 640)}px;">
    <div class="call-list" id="iotCallListPane"></div>
    <div class="call-resizer" id="iotCallResizer" title="ลากเพื่อปรับความกว้างคิว (ดับเบิลคลิกเพื่อรีเซ็ต)"></div>
    <div id="iotCallFormPane"></div>
  </div>`;
  renderIotCallListShell();
  renderIotCallForm();
  attachIotCallResizer();
  const pane = document.getElementById('iotCallRows');
  if (pane && prevScroll) {
    pane.scrollTop = prevScroll;
    const row = document.getElementById('iotCallRow_' + iotCallSelectedNid);
    if (row) row.scrollIntoView({ block: 'nearest' });
  }
}

// ลากเส้นกลางเพื่อยืด/หดแถบคิวได้ตามใจ — จำความกว้างไว้ใช้ครั้งหน้า
function attachIotCallResizer() {
  const bar = document.getElementById('iotCallResizer');
  const wrap = document.getElementById('iotCallWrap');
  if (!bar || !wrap || bar.dataset.on) return;
  bar.dataset.on = '1';
  const setW = (w) => {
    const v = Math.min(Math.max(Math.round(w), 240), 640);
    wrap.style.setProperty('--call-list-w', v + 'px');
    localStorage.setItem('otod_call_list_w', String(v));
  };
  bar.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = document.getElementById('iotCallListPane').getBoundingClientRect().width;
    bar.classList.add('is-dragging');
    document.body.classList.add('is-col-resizing');
    const move = (ev) => setW(startW + (ev.clientX - startX));
    const up = () => {
      bar.classList.remove('is-dragging');
      document.body.classList.remove('is-col-resizing');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
  bar.addEventListener('dblclick', () => setW(320));
}
function renderIotCallListShell() {
  const pane = document.getElementById('iotCallListPane'); if (!pane) return;
  // นับเฉพาะคนที่ยังไม่ได้นัด (= คนที่ยังต้องโทรจริงๆ) เพื่อโชว์จำนวนในทุกตัวเลือกของตัวกรอง
  const pool = iotCallPendingRows();
  const inProv = (r) => !iotCallFilter.province || normName(r[IOT_FIELDS.province]) === normName(iotCallFilter.province);
  const inDist = (r) => !iotCallFilter.district || normName(r[IOT_FIELDS.district]) === normName(iotCallFilter.district);
  const countBy = (rows, key) => {
    const m = new Map();
    rows.forEach(r => { const v = r[key]; if (v) m.set(v, (m.get(v) || 0) + 1); });
    return m;
  };
  const provCount = countBy(pool, IOT_FIELDS.province);
  const distCount = countBy(pool.filter(inProv), IOT_FIELDS.district);
  const subCount = countBy(pool.filter(r => inProv(r) && inDist(r)), 'farm_subdistrict');
  const provinces = [...provCount.keys()].sort((a, b) => a.localeCompare(b, 'th'));
  const districts = [...distCount.keys()].sort((a, b) => a.localeCompare(b, 'th'));
  const subs = [...subCount.keys()].sort((a, b) => a.localeCompare(b, 'th'));
  const opt = (v, cur, n) => `<option value="${_callEsc(v)}" ${normName(cur) === normName(v) ? 'selected' : ''}>${v}${n !== undefined ? ` (${n.toLocaleString()})` : ''}</option>`;
  const remain = iotCallQueue().length;         // จำนวนตามตัวกรองที่เลือกอยู่ตอนนี้
  const remainAll = pool.length;                // จำนวนทั้งหมดที่ยังต้องโทร
  // หัวคิว + ปุ่มส่งออก + ช่องค้นหา + ตัวกรอง ตรึงไว้ด้านบน มีแต่ #iotCallRows ที่เลื่อน
  pane.innerHTML = `
    <div class="call-list-fixed">
    <div class="call-list-head">
      <span><i data-icon="phone" data-size="15"></i> คิวโทรนัด</span>
      <span class="call-remain">${remain.toLocaleString()} คน${remain !== remainAll ? ` <span class="call-remain-all">/ ${remainAll.toLocaleString()}</span>` : ''}</span>
    </div>
    <div class="call-export">
      <button class="btn btn-outline btn-sm" onclick="exportIotCallQueueExcel()" title="ส่งออกรายชื่อในคิวตามตัวกรองที่เลือกอยู่">${icon('download', 14)} Excel</button>
      <button class="btn btn-outline btn-sm" onclick="exportIotCallQueuePdf()" title="พิมพ์/บันทึกเป็น PDF ตามตัวกรองที่เลือกอยู่">${icon('print', 14)} PDF</button>
    </div>
    <input type="text" id="iotCallSearch" value="${_callEsc(iotCallFilter.search)}" placeholder="ค้นหาชื่อ / เบอร์ / เลขบัตร" style="width:100%; margin-bottom:6px;" oninput="iotCallOnSearch(this.value)">
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:5px; margin-bottom:6px;">
      <select onchange="iotCallSetFilter('province',this.value)"><option value="">ทุกจังหวัด (${pool.length.toLocaleString()})</option>${provinces.map(p => opt(p, iotCallFilter.province, provCount.get(p))).join('')}</select>
      <select onchange="iotCallSetFilter('district',this.value)"><option value="">ทุกอำเภอ (${pool.filter(inProv).length.toLocaleString()})</option>${districts.map(d => opt(d, iotCallFilter.district, distCount.get(d))).join('')}</select>
    </div>
    <select style="width:100%; margin-bottom:8px;" onchange="iotCallSetFilter('subdistrict',this.value)"><option value="">ทุกตำบล (${pool.filter(r => inProv(r) && inDist(r)).length.toLocaleString()})</option>${subs.map(s => opt(s, iotCallFilter.subdistrict, subCount.get(s))).join('')}</select>
    </div>
    <div id="iotCallRows"></div>`;
  renderIotCallRows();
}
function renderIotCallRows() {
  const wrap = document.getElementById('iotCallRows'); if (!wrap) return;
  const q = iotCallQueue();
  if (!q.length) { wrap.innerHTML = '<div style="text-align:center; color:var(--muted); padding:20px 6px; font-size:13px;"><i data-icon="sparkles" data-size="15"></i> ไม่มีใครค้างต้องนัดในตัวกรองนี้</div>'; return; }
  wrap.innerHTML = q.map((r, i) => {
    const nid = r.national_id;
    const e = iotInstallPlan.find(p => p.nationalId === nid);
    const st = (e && e.status) ? e.status : 'not_contacted';
    const nameTxt = `${r.prefix || ''}${r.first_name || ''} ${r.last_name || ''}`.trim();
    const phone = r.phone || (e && e.phone) || '';
    const sheetNote = (typeof getIotSheetNote === 'function') ? getIotSheetNote(r) : '';
    return `<div class="call-row ${nid === iotCallSelectedNid ? 'on' : ''}" id="iotCallRow_${nid}" onclick="iotCallSelect('${nid}')">
      <span class="call-row-no">${i + 1}</span>
      <span class="call-row-main">
        <span class="call-row-top">
          <span class="call-row-name">${nameTxt || '-'}</span>
          <span class="call-dot" style="background:${IOT_CALL_DOT[st] || '#B4B2A9'}" title="${IOT_PLAN_STATUS_LABELS[st] || ''}"></span>
          ${sheetNote ? `<span class="call-note-flag" title="${_callEsc(sheetNote)}">${icon('note', 12)}</span>` : ''}
        </span>
        <span class="call-row-phone">${phone ? icon('phone', 12) + ' ' + formatThaiPhone(phone) : '<span class="call-row-nophone">ไม่มีเบอร์</span>'}</span>
        <span class="call-row-area">${r[IOT_FIELDS.province] || '-'} · ${r[IOT_FIELDS.district] || '-'} · ${r.farm_subdistrict || '-'}</span>
      </span>
    </div>`;
  }).join('');
}
function renderIotCallRowDot(nid) {
  const row = document.getElementById('iotCallRow_' + nid); if (!row) return;
  const e = iotInstallPlan.find(p => p.nationalId === nid);
  const st = (e && e.status) ? e.status : 'not_contacted';
  const dot = row.querySelector('.call-dot');
  if (dot) { dot.style.background = IOT_CALL_DOT[st] || '#B4B2A9'; dot.title = IOT_PLAN_STATUS_LABELS[st] || ''; }
}
// 0812345678 -> 081-234-5678 (อ่านง่ายตอนกดโทรจากเครื่องโต๊ะ)
function formatThaiPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length === 10) return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
  if (d.length === 9) return d.slice(0, 2) + '-' + d.slice(2, 5) + '-' + d.slice(5);
  return p || '';
}
function iotCallCopyPhone(p) {
  const txt = String(p || '').replace(/\D/g, '');
  if (!txt) return;
  const done = () => showToast('คัดลอกเบอร์ ' + formatThaiPhone(txt) + ' แล้ว', 'success', 1800);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(done, () => fallbackCopy(txt, done));
  } else fallbackCopy(txt, done);
}
function fallbackCopy(txt, done) {
  const ta = document.createElement('textarea');
  ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); done(); } catch (err) { showToast('คัดลอกไม่สำเร็จ ลองเลือกเลขแล้วกด Ctrl+C ครับ', 'warn'); }
  ta.remove();
}

function renderIotCallForm() {
  const pane = document.getElementById('iotCallFormPane'); if (!pane) return;
  const nid = iotCallSelectedNid;
  if (!nid) { pane.innerHTML = '<div class="call-form-card"><div class="call-empty">เลือกคนจากคิวทางซ้ายเพื่อเริ่มโทรนัด</div></div>'; return; }
  const row = allIotRows.find(r => r.national_id === nid) || {};
  const e = iotInstallPlan.find(p => p.nationalId === nid) || {};
  const dis = isReadOnlyUser ? 'disabled' : '';
  const boxType = e.boxType || '', pumpType = e.pumpType || '', pipeSize = e.pipeSize || '', valveSize = e.valveSize || '';
  const wd = getPlanWaterDefaults(nid);
  const waterCur = e.waterSource || wd.water || '', irrCur = e.irrigationType || wd.irr || '';
  const paymentStatus = e.paymentStatus || '', operatorName = e.operatorName || '', installTeam = e.installTeam || '';
  const status = e.status || 'not_contacted', note = e.note || '';
  const sheetNote = (typeof getIotSheetNote === 'function') ? getIotSheetNote(row) : '';
  const amount = (e.paymentAmount === '' || e.paymentAmount === undefined || e.paymentAmount === null) ? '' : String(e.paymentAmount);
  const planMonth = getIotMonthYearFromDate(e.installDate), planWeek = getIotWeekOfMonthFromDate(e.installDate);
  const nameTxt = `${row.prefix || ''}${row.first_name || ''} ${row.last_name || ''}`.trim() || (e.name || '-');
  const phoneSafe = (row.phone || e.phone || '').replace(/[^0-9+]/g, '');
  const provinceTxt = row[IOT_FIELDS.province] || e.province || '-';
  const districtTxt = row[IOT_FIELDS.district] || e.district || '-';
  const subTxt = row.farm_subdistrict || e.subdistrict || '-';
  const projectTxt = ((typeof IOT_FIELDS !== 'undefined' && IOT_FIELDS.project) ? row[IOT_FIELDS.project] : '') || row.otod_project || '-';
  const approvalTxt = row.approval_round || '-';
  const readinessTxt = row.readiness_status || '';
  const arTxt = (typeof getIotArCodeDisplay === 'function') ? (getIotArCodeDisplay(row) || '') : '';

  const dd = (fieldJs, cat, cur, label) => {
    const miss = !cur;
    return `<label class="${miss ? 'call-field-miss' : ''}"><span>${label}${miss ? '<span class="call-ask">ต้องถาม</span>' : ''}</span>
      <select data-dropcat="${cat}" ${dis} onchange="iotCallSetField('${nid}','${fieldJs}',this.value)"><option value="">— เลือก —</option>${iotSelectOptionsHtml(cat, cur)}</select></label>`;
  };
  const topics = [boxType, pumpType, pipeSize, valveSize, waterCur, irrCur]
    .concat(boxType === 'no_button' ? [] : [amount !== '' ? 'x' : ''])
    .concat([e.installDate || '', installTeam, operatorName]);
  const done = topics.filter(Boolean).length, total = topics.length;
  const pct = total ? Math.round(done / total * 100) : 0;

  const weekOpts = ['1', '2', '3', '4', '5'].map(w => `<option value="${w}" ${planWeek === w ? 'selected' : ''}>สัปดาห์ที่ ${w}</option>`).join('');
  const statusOpts = Object.keys(IOT_PLAN_STATUS_LABELS).map(k => `<option value="${k}" ${status === k ? 'selected' : ''}>${IOT_PLAN_STATUS_LABELS[k]}</option>`).join('');

  const phoneShown = row.phone || e.phone || '';
  pane.innerHTML = `<div class="call-form-card">
    <div class="call-head">
      <div class="call-head-info">
        <div class="call-head-topline">
          <div class="call-head-name">${nameTxt}</div>
          ${sheetNote ? `<span class="call-note-badge" title="${_callEsc(sheetNote)}">
            <span class="call-note-tag">${icon('note', 12)} หมายเหตุจากชีต</span>
            <span class="call-note-text">${_callEsc(sheetNote)}</span>
          </span>` : ''}
        </div>
        <div class="call-head-loc">${icon('pin', 13)} ${provinceTxt} · ${districtTxt} · ${subTxt}</div>
      </div>
      <div class="call-nav">
        <button class="btn btn-outline btn-sm" onclick="iotCallGoRelative(-1)">${icon('left', 14)} ก่อนหน้า</button>
        <button class="btn btn-outline btn-sm" onclick="iotCallGoRelative(1)">ถัดไป ${icon('right', 14)}</button>
      </div>
    </div>

    <div class="call-phone-bar">
      ${phoneShown ? `
        <span class="call-phone-label">${icon('phone', 16)} เบอร์โทร</span>
        <span class="call-phone-num" id="iotCallPhoneNum">${formatThaiPhone(phoneShown)}</span>
        <button class="btn btn-brand btn-sm" onclick="iotCallCopyPhone('${phoneSafe}')">${icon('copy', 14)} คัดลอก</button>
        <a class="btn btn-outline btn-sm" style="text-decoration:none;" href="tel:${phoneSafe}">${icon('phone', 14)} โทรจากมือถือ</a>
      ` : `<span class="call-phone-none">${icon('alert', 15)} ไม่มีเบอร์ติดต่อในระบบ</span>`}
      <span class="call-phone-nid">เลขบัตร <b>${row.national_id || '-'}</b></span>
    </div>

    <div class="call-chips">
      <span class="call-chip is-key"><b>โครงการ</b> ${projectTxt}</span>
      <span class="call-chip is-key"><b>รอบอนุมัติ</b> ${approvalTxt}</span>
      ${readinessTxt ? `<span class="call-chip"><b>ความพร้อม</b> ${readinessTxt}</span>` : ''}
      ${arTxt ? `<span class="call-chip"><b>เลข AR</b> ${arTxt}</span>` : ''}
    </div>
    <div class="call-meter">
      <span>ถามครบ ${done} / ${total} หัวข้อ</span>
      <span class="call-meter-bar"><span class="call-meter-fill" style="width:${pct}%;"></span></span>
      <span style="font-weight:400; font-size:12px;">${done === total ? 'ครบแล้ว <i data-icon="check" data-size="15"></i>' : 'เหลืออีก ' + (total - done)}</span>
    </div>

    <div class="call-sec"><i data-icon="wrench" data-size="15"></i> อุปกรณ์ (ถามเกษตรกร)</div>
    <div class="call-fields">
      <label class="${!boxType ? 'call-field-miss' : ''}"><span>ตู้${!boxType ? '<span class="call-ask">ต้องถาม</span>' : ''}</span>
        <select ${dis} onchange="iotCallSetField('${nid}','boxType',this.value)"><option value="">— เลือก —</option><option value="no_button" ${boxType === 'no_button' ? 'selected' : ''}>ตู้ไม่มีปุ่มกด</option><option value="with_button" ${boxType === 'with_button' ? 'selected' : ''}>ตู้มีปุ่มกด</option></select></label>
      ${dd('pumpType', 'pump_type', pumpType, 'ปั๊มน้ำ')}
      ${dd('pipeSize', 'pipe_size', pipeSize, 'ขนาดท่อ')}
      ${dd('valveSize', 'valve_size', valveSize, 'ขนาดวาล์ว')}
      ${dd('waterSource', 'water_source', waterCur, 'แหล่งน้ำ')}
      ${dd('irrigationType', 'irrigation_type', irrCur, 'รูปแบบการให้น้ำ')}
    </div>

    ${boxType === 'no_button' ? '' : `<div class="call-sec"> การชำระเงิน</div>
    <div class="call-fields">
      ${dd('paymentStatus', 'payment_status', paymentStatus, 'การชำระเงิน')}
      <label><span>ยอดชำระ (บาท)</span><input type="number" min="0" step="1" inputmode="numeric" value="${_callEsc(amount)}" placeholder="บาท" ${dis} onchange="iotCallSetField('${nid}','paymentAmount',this.value)"></label>
    </div>`}

    <div class="call-sec"><i data-icon="calendar" data-size="15"></i> ลงนัดหมาย</div>
    <div class="call-fields">
      <label class="${!e.installDate ? 'call-field-miss' : ''}"><span>เดือนที่นัด${!e.installDate ? '<span class="call-ask">ต้องนัด</span>' : ''}</span>
        <select ${dis} onchange="iotCallSetSchedule('${nid}','month',this.value)">${getIotMonthOptionsHtml(planMonth)}</select></label>
      <label class="${!e.installDate ? 'call-field-miss' : ''}"><span>สัปดาห์</span>
        <select ${dis} onchange="iotCallSetSchedule('${nid}','week',this.value)"><option value="">— เลือก —</option>${weekOpts}</select></label>
      <label class="${!installTeam ? 'call-field-miss' : ''}"><span>ทีมติดตั้ง${!installTeam ? '<span class="call-ask">ต้องเลือก</span>' : ''}</span>
        <select data-dropcat="install_team" ${dis} onchange="iotCallSetField('${nid}','installTeam',this.value)"><option value="">— เลือกทีม —</option>${iotSelectOptionsHtml('install_team', installTeam)}</select></label>
      ${dd('operatorName', 'operator', operatorName, 'ผู้ดำเนินการ')}
    </div>

    <div class="call-sec"> สถานะ &amp; หมายเหตุ</div>
    <div class="call-fields">
      <label><span>สถานะ</span><select ${dis} onchange="iotCallSetField('${nid}','status',this.value)">${statusOpts}</select></label>
      <label style="grid-column:1 / -1;"><span>หมายเหตุ (ที่อยู่สวน/สิ่งที่ต้องเตรียม ฯลฯ)</span><input type="text" class="${note ? 'note-input-filled' : ''}" value="${_callEsc(note)}" placeholder="เช่น ที่อยู่สวนไม่ตรง / สะดวกช่วงบ่าย" ${dis} onchange="iotCallSetField('${nid}','note',this.value)"></label>
    </div>

    ${isReadOnlyUser ? '' : `<div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px;">
      <span class="call-save-hint"><span class="call-autosaved">${icon('save', 13)} บันทึกอัตโนมัติทุกช่องที่กรอก</span> — กด "ยืนยันแผน" เมื่อนัดเรียบร้อยแล้ว ถึงจะขึ้นเป็นแผนสำเร็จ</span>
      <button class="btn btn-outline" onclick="iotCallDecline('${nid}')" title="เลือกเหตุผล แล้วย้ายไปแท็บ &quot;ติดตั้งไม่ได้&quot;">${icon('blocked', 14)} ไม่รับ / ติดตั้งไม่ได้</button>
      <button class="btn btn-brand" onclick="iotCallSaveNext()" title="ยืนยันว่านัดเสร็จแล้ว — ย้ายไปแท็บ &quot;วางแผนเสร็จแล้ว&quot; แล้วไปคนถัดไป">${icon('check', 14)} ยืนยันแผน + คนถัดไป →</button>
    </div>`}
  </div>`;
  fitCallNoteBadge();
}

/* หมายเหตุจากชีตต้องอยู่บรรทัดเดียว — ถ้ายาวเกินก็ค่อยๆ ลดขนาดตัวอักษรลงแทนการขึ้นบรรทัดใหม่ */
function fitCallNoteBadge() {
  requestAnimationFrame(() => {
    document.querySelectorAll('.call-note-badge').forEach((badge) => {
      const txt = badge.querySelector('.call-note-text');
      if (!txt) return;
      // ลดขนาดตัวอักษรลงทีละนิดจนพอดีความกว้าง (ไม่ต่ำกว่า 9px จะอ่านไม่ออก)
      const fit = () => {
        let fs = 13;
        txt.style.fontSize = fs + 'px';
        let guard = 0;
        while (txt.scrollWidth > txt.clientWidth + 1 && fs > 9 && guard++ < 40) {
          fs -= 0.25;
          txt.style.fontSize = fs + 'px';
        }
        return txt.scrollWidth <= txt.clientWidth + 1;
      };
      // ปกติอยู่ข้างชื่อ — ถ้าหมายเหตุยาวจนย่อแล้วยังไม่พอ ค่อยขยายเต็มบรรทัดใต้ชื่อ (ยังเป็นบรรทัดเดียวอยู่)
      badge.classList.remove('is-block');
      if (!fit()) { badge.classList.add('is-block'); fit(); }
    });
  });
}
if (!window._callNoteFitBound) {
  window._callNoteFitBound = true;
  window.addEventListener('resize', () => fitCallNoteBadge());
}

function changeIotPlanCalendarMonth(delta) {
  if (!iotPlanCalendarMonth) {
    const now = new Date();
    iotPlanCalendarMonth = { year: now.getFullYear(), month: now.getMonth() };
  }
  iotPlanCalendarMonth.month += delta;
  if (iotPlanCalendarMonth.month < 0) { iotPlanCalendarMonth.month = 11; iotPlanCalendarMonth.year--; }
  if (iotPlanCalendarMonth.month > 11) { iotPlanCalendarMonth.month = 0; iotPlanCalendarMonth.year++; }
  renderIotPlanCalendar();
}

function goToCurrentIotPlanCalendarMonth() {
  iotPlanCalendarMonth = null;
  renderIotPlanCalendar();
}

function selectIotPlanCalendarDate(dateStr) {
  iotPlanCalendarSelectedDate = (iotPlanCalendarSelectedDate === dateStr) ? null : dateStr;
  switchIotPlanView('table');
}

function clearIotPlanDateFilter() {
  iotPlanCalendarSelectedDate = null;
  applyIotPlanFilters();
  if (iotPlanCurrentView === 'calendar') renderIotPlanCalendar();
}

function renderIotPlanCalendar() {
  const container = document.getElementById('iotPlanCalendarView');
  if (!container) return;
  if (!iotPlanCalendarMonth) {
    const now = new Date();
    iotPlanCalendarMonth = { year: now.getFullYear(), month: now.getMonth() };
  }
  const { year, month } = iotPlanCalendarMonth;
  const today = todayDateStr();

  // ใช้ iotInstallPlan ทั้งหมดเสมอ (ไม่ใช้ getFilteredIotPlan) เพราะปฏิทินควรโชว์ภาพรวมทั้งแผน
  const scoped = iotInstallPlan;
  const countByDate = {};
  const cancelledByDate = {};
  scoped.forEach(p => {
    if (!p.installDate) return;
    countByDate[p.installDate] = (countByDate[p.installDate] || 0) + 1;
    if (p.status === 'cancelled') cancelledByDate[p.installDate] = (cancelledByDate[p.installDate] || 0) + 1;
  });

  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let cells = '';
  for (let i = 0; i < startWeekday; i++) {
    cells += `<div class="plan-calendar-day empty"></div>`;
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = toDateStr(new Date(year, month, d));
    const count = countByDate[dateStr] || 0;
    const allCancelled = count > 0 && (cancelledByDate[dateStr] || 0) === count;
    const isToday = dateStr === today;
    const isSelected = dateStr === iotPlanCalendarSelectedDate;
    cells += `
      <div class="plan-calendar-day ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}" onclick="selectIotPlanCalendarDate('${dateStr}')">
        <span class="day-num">${d}</span>
        ${count ? `<span class="day-badge ${allCancelled ? 'has-cancelled' : ''}">${count} คน</span>` : ''}
      </div>
    `;
  }

  container.innerHTML = `
    <div class="plan-calendar-header">
      <h3>${PLAN_THAI_MONTH_NAMES[month]} ${year + 543}</h3>
      <div class="plan-calendar-nav">
        <button type="button" onclick="changeIotPlanCalendarMonth(-1)">← เดือนก่อน</button>
        <button type="button" onclick="goToCurrentIotPlanCalendarMonth()">วันนี้</button>
        <button type="button" onclick="changeIotPlanCalendarMonth(1)">เดือนถัดไป →</button>
      </div>
    </div>
    <div class="plan-calendar-grid">
      ${PLAN_THAI_DOW_SHORT.map(d => `<div class="plan-calendar-dow">${d}</div>`).join('')}
      ${cells}
    </div>
  `;
}

// ----- จัดเรียงลำดับเส้นทางอัตโนมัติสำหรับแผนติดตั้ง IoT (ใช้ centroid/haversine ร่วมกับแผนอบรม) -----
async function optimizeIotPlanRoute() {
  if (blockIfReadOnly()) return;
  const scoped = getFilteredIotPlan();
  if (scoped.length < 2) {
    showToast('ต้องมีอย่างน้อย 2 รายการ (ตามตัวกรองปัจจุบัน) ถึงจะจัดเรียงเส้นทางได้ครับ', 'warn');
    return;
  }

  await ensureMapDataLoaded();
  if (!geoDistricts || !geoProvinces) {
    showToast('โหลดข้อมูลแผนที่ไม่สำเร็จ ลองใหม่อีกครั้งครับ (ต้องมีอินเทอร์เน็ต)', 'error');
    return;
  }

  const withCoord = [];
  const withoutCoord = [];
  scoped.forEach(p => {
    const c = getDistrictCentroid(p.province, p.district);
    if (c) withCoord.push({ entry: p, coord: c });
    else withoutCoord.push(p);
  });

  if (withCoord.length < 2) {
    showToast('หาพิกัดอำเภอไม่พอสำหรับจัดเรียงเส้นทาง (ต้องมีอย่างน้อย 2 รายการที่จับคู่พิกัดได้)', 'warn');
    return;
  }

  const remaining = withCoord.slice();
  const ordered = [remaining.shift()];
  while (remaining.length) {
    const last = ordered[ordered.length - 1];
    let bestIdx = 0;
    let bestDist = Infinity;
    remaining.forEach((item, idx) => {
      const d = haversineDistanceKm(last.coord, item.coord);
      if (d < bestDist) { bestDist = d; bestIdx = idx; }
    });
    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }

  let order = 0;
  ordered.forEach(item => { item.entry.sortOrder = order++; });
  withoutCoord.forEach(p => { p.sortOrder = order++; });

  saveIotPlanToStorage();
  renderIotPlanTable();
  if (iotPlanCurrentView === 'calendar') renderIotPlanCalendar();
  syncIotPlanEntriesToSupabase([...ordered.map(item => item.entry), ...withoutCoord]);

  const msg = withoutCoord.length
    ? `จัดเรียงลำดับเสร็จแล้ว (${withCoord.length} รายการ) — หาพิกัดไม่เจอ ${withoutCoord.length} รายการ เลยจัดไว้ท้ายสุด`
    : `จัดเรียงลำดับเส้นทางเสร็จแล้ว (${ordered.length} รายการ) ตามความใกล้ของพื้นที่`;
  showToast(msg, withoutCoord.length ? 'warn' : 'success');
}

// expose ฟังก์ชันของโมดูลนี้ให้ inline handlers และโมดูลอื่นเรียกผ่าน window ได้


// ===== ส่งออกรายชื่อในคิวโทรนัด (ตามตัวกรองจังหวัด/อำเภอ/ตำบล/คำค้นที่เลือกอยู่) =====
// ป้ายกำกับตัวกรองปัจจุบัน ใช้ทั้งชื่อไฟล์และหัวรายงาน
function iotCallFilterLabel() {
  const f = iotCallFilter;
  const parts = [f.province, f.district, f.subdistrict].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'ทุกพื้นที่';
}
function iotCallQueueExportRows() {
  return iotCallQueue().map((r, i) => {
    const e = iotInstallPlan.find(p => p.nationalId === r.national_id);
    return {
      'ลำดับ': i + 1,
      'ชื่อ-นามสกุล': `${r.prefix || ''}${r.first_name || ''} ${r.last_name || ''}`.trim(),
      'เบอร์ติดต่อ': r.phone || '',
      'เลขบัตรประชาชน': r.national_id || '',
      'จังหวัด': r[IOT_FIELDS.province] || '',
      'อำเภอ': r[IOT_FIELDS.district] || '',
      'ตำบล': r.farm_subdistrict || '',
      'สถานะในแผน': IOT_PLAN_STATUS_LABELS[(e && e.status) || 'not_contacted'] || '',
      'นัดหมาย': (e && e.installDate) ? (formatIotPlanWeekLabel(e.installDate) || e.installDate) : 'ยังไม่นัด',
      'ทีมติดตั้ง': (e && e.installTeam) || '',
      'โครงการ': r[IOT_FIELDS.project] || '',
      'รอบการอนุมัติ': r.approval_round || '',
      'หมายเหตุจากชีต': (typeof getIotSheetNote === 'function') ? getIotSheetNote(r) : '',
      'หมายเหตุ (จากการโทร)': (e && e.note) || '',
    };
  });
}

function exportIotCallQueueExcel() {
  const data = iotCallQueueExportRows();
  if (!data.length) { showToast('ไม่มีรายชื่อในคิวตามตัวกรองนี้ครับ', 'warn'); return; }
  const ws = XLSX.utils.json_to_sheet(data);
  if (typeof prettifyExcelSheet === 'function') prettifyExcelSheet(ws, data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'คิวโทรนัด');
  const safe = iotCallFilterLabel().replace(/[\\/:*?"<>|·]/g, '_').replace(/\s+/g, '');
  XLSX.writeFile(wb, `คิวโทรนัด_${safe}.xlsx`);
  showToast(`ส่งออก ${data.length.toLocaleString()} รายชื่อเป็น Excel แล้วครับ`, 'success');
}

function exportIotCallQueuePdf() {
  const data = iotCallQueueExportRows();
  if (!data.length) { showToast('ไม่มีรายชื่อในคิวตามตัวกรองนี้ครับ', 'warn'); return; }
  const generatedAt = new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  const scope = iotCallFilterLabel();
  const noPhone = data.filter(d => !d['เบอร์ติดต่อ']).length;

  const rowsHtml = data.map(d => `
    <tr>
      <td>${d['ลำดับ']}</td>
      <td>${d['ชื่อ-นามสกุล'] || '-'}</td>
      <td><b>${d['เบอร์ติดต่อ'] || '-'}</b></td>
      <td>${d['เลขบัตรประชาชน'] || '-'}</td>
      <td>${d['จังหวัด'] || '-'}</td>
      <td>${d['อำเภอ'] || '-'}</td>
      <td>${d['ตำบล'] || '-'}</td>
      <td>${d['สถานะในแผน'] || '-'}</td>
      <td class="pdf-note-cell">${d['หมายเหตุจากชีต'] || ''}</td>
      <td></td>
    </tr>`).join('');

  const root = document.createElement('div');
  root.className = 'pdf-report';
  root.innerHTML = `
    <div class="pdf-topbar"></div>
    <div class="pdf-header">
      <img src="${PDF_LOGO_DATA_URI}" class="pdf-logo" alt="Kasetkorn">
      <div class="pdf-header-text">
        <div class="pdf-header-eyebrow">ใบรายชื่อสำหรับโทรนัดติดตั้ง IoT</div>
        <h1>คิวโทรนัด — ${scope}</h1>
        <div class="pdf-header-sub">รายชื่อที่ยังไม่ได้นัดหมาย ตามตัวกรองที่เลือก</div>
      </div>
      <div class="pdf-header-meta">
        <div>พิมพ์เมื่อ ${generatedAt}</div>
        ${currentUserName ? `<div>โดย ${currentUserName}</div>` : ''}
      </div>
    </div>
    <div class="pdf-kpi-grid">
      <div class="pdf-kpi-card"><div class="pdf-kpi-num">${data.length}</div><div class="pdf-kpi-label">รายชื่อที่ต้องโทร</div></div>
      <div class="pdf-kpi-card pending"><div class="pdf-kpi-num">${data.length - noPhone}</div><div class="pdf-kpi-label">มีเบอร์ติดต่อ</div></div>
      <div class="pdf-kpi-card cancelled"><div class="pdf-kpi-num">${noPhone}</div><div class="pdf-kpi-label">ไม่มีเบอร์</div></div>
    </div>
    <table class="pdf-table">
      <thead><tr>
        <th style="width:34px;">#</th><th>ชื่อ-นามสกุล</th><th style="width:96px;">เบอร์ติดต่อ</th>
        <th style="width:112px;">เลขบัตรประชาชน</th><th>จังหวัด</th><th>อำเภอ</th><th>ตำบล</th>
        <th style="width:86px;">สถานะ</th><th style="width:150px;">หมายเหตุจากชีต</th><th style="width:130px;">บันทึกผลการโทร</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div class="pdf-signoff">
      <div class="pdf-signoff-box"><div class="pdf-signoff-line"></div><div class="pdf-signoff-label">ผู้โทรนัด</div></div>
      <div class="pdf-signoff-box"><div class="pdf-signoff-line"></div><div class="pdf-signoff-label">ผู้ตรวจสอบ</div></div>
    </div>
    <div class="pdf-footer">สร้างโดย Dashboard เกษตรกร — คิวโทรนัดติดตั้ง IoT (OTOD)</div>`;
  document.body.appendChild(root);
  enableLandscapePrint();

  const cleanup = () => {
    window.removeEventListener('afterprint', cleanup);
    if (root.parentNode) document.body.removeChild(root);
    disableLandscapePrint();
  };
  window.addEventListener('afterprint', cleanup);
  showToast('เปิดหน้าต่างพิมพ์แล้ว — เลือก "บันทึกเป็น PDF" ได้เลยครับ', 'info');
  requestAnimationFrame(() => window.print());
}

Object.assign(window, {
  iotCallFilterLabel, iotCallQueueExportRows, exportIotCallQueueExcel, exportIotCallQueuePdf,
  fitCallNoteBadge,
  iotCallTakeSnapshot, iotCallRevertDraft, iotCallAfterDecline, attachIotCallResizer, formatThaiPhone, iotCallCopyPhone, fallbackCopy,
  iotCallBaseRows, iotCallIsScheduled, iotCallPendingRows, iotCallQueue, iotCallEnsureEntry, iotCallAutoSave,
  iotCallJumpToView, goToIotCallArea, goToIotCallPerson, iotCallHasUnsyncedWrites, iotCallSetField, iotCallSetSchedule,
  iotCallSetFilter, iotCallOnSearch, iotCallSelect, iotCallSyncSelection, iotCallGoRelative, iotCallDecline, iotCallSaveNext,
  renderIotCallView, renderIotCallListShell, renderIotCallRows, renderIotCallRowDot, renderIotCallForm, changeIotPlanCalendarMonth,
  goToCurrentIotPlanCalendarMonth, selectIotPlanCalendarDate, clearIotPlanDateFilter, renderIotPlanCalendar, optimizeIotPlanRoute,
});
