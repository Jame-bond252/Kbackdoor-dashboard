// ===== หน้าแดชบอร์ดอบรม: KPI + sparkline + มาร์ค "อบรมแล้ว" + ตัวกรอง + ตาราง =====
// แยกมาจาก main.js เดิม — ตัวแปร/ฟังก์ชันแชร์ผ่าน window (โค้ดเดิมออกแบบเป็น global scope)


// สีสำหรับกราฟ Chart.js — อ่านจากธีมปัจจุบัน (สว่าง/มืด)
function chartTone() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  return dark
    ? { border: '#262b31', muted: '#98a3ae', tip: 'rgba(20,24,28,.95)' }
    : { border: '#eef0f3', muted: '#98a2ad', tip: 'rgba(20,23,26,.92)' };
}

function buildSparklinePath(values, width, height) {
  if (!values.length) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = (max - min) || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  return values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function renderSparklineSvg(values) {
  const width = 100, height = 28;
  if (values.length < 3) return ''; // ข้อมูลน้อยเกินไป ยังไม่คุ้มโชว์กราฟ
  const path = buildSparklinePath(values, width, height);
  return `<svg class="kpi-sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
    <path d="${path}" fill="none" stroke="var(--brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.55"/>
  </svg>`;
}

function renderKpiSparklines() {
  const trainEl = document.getElementById('kpiYSparkline');
  if (trainEl) {
    const pctValues = progressSnapshots
      .filter(s => s.training_total > 0)
      .map(s => Math.round((s.training_passed / s.training_total) * 100));
    trainEl.innerHTML = renderSparklineSvg(pctValues);
  }
  const iotEl = document.getElementById('iotKpiYSparkline');
  if (iotEl) {
    const pctValues = progressSnapshots
      .filter(s => s.iot_total > 0)
      .map(s => Math.round((s.iot_installed / s.iot_total) * 100));
    iotEl.innerHTML = renderSparklineSvg(pctValues);
  }
}

// ===== "อบรมแล้ว (มาร์คเอง)" — override ฝั่งเว็บทับข้อมูลซิงก์ (training_completion) =====
// เก็บเป็นตารางแยกใน Supabase คีย์ด้วย national_id ไม่ไปยุ่งกับตาราง farmers ที่ซิงก์มา (อ่านอย่างเดียว)
// วิธีทำงาน: หลังโหลด allRows แล้ว เราจะ "แพตช์" training_status ของคนที่ถูกมาร์คให้เป็น 'Y' ในหน่วยความจำ
// -> ทุกหน้าที่อ่าน training_status (แดชบอร์ด/แผนที่/สกอร์บอร์ด/แผน) จะเห็นเป็น "อบรมแล้ว" อัตโนมัติ โดยไม่ต้องแก้ทีละจุด
window.trainingCompletionByNid = new Map();

async function loadTrainingCompletion() {
  if (!supabaseClient) return;
  let rows = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseClient
      .from('training_completion')
      .select('*')
      .range(from, from + pageSize - 1);
    if (error) {
      // ยังไม่ได้รัน training_completion_setup.sql ก็ไม่เป็นไร ถือว่ายังไม่มีใครถูกมาร์ค เว็บทำงานต่อได้ปกติ
      console.warn('โหลดรายชื่ออบรมแล้ว (มาร์คเอง) ไม่สำเร็จ:', error.message);
      return;
    }
    rows = rows.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  trainingCompletionByNid = new Map();
  rows.forEach(rec => { if (rec.national_id) trainingCompletionByNid.set(rec.national_id, rec); });
}

// แพตช์ training_status ในหน่วยความจำ: เก็บค่าดั้งเดิมไว้ครั้งแรก (_origTrainingStatus) แล้วคำนวณค่าที่ใช้แสดงจาก
// (ค่าดั้งเดิม === 'Y') หรือ (ถูกแอดมินมาร์คไว้) -> 'Y' ถ้าไม่ใช่ก็คงค่าดั้งเดิม เรียกได้ซ้ำๆ ไม่เพี้ยน (idempotent)
function applyTrainingOverrides() {
  allRows.forEach(r => {
    if (r._origTrainingStatus === undefined) r._origTrainingStatus = r.training_status;
    const marked = r.national_id && trainingCompletionByNid.has(r.national_id);
    r.training_status = (r._origTrainingStatus === 'Y' || marked) ? 'Y' : r._origTrainingStatus;
  });
}

// จำแนกสถานะของแต่ละคนสำหรับตารางในแท็บนี้: 'trained_sync' | 'trained_manual' | 'untrained'
function getTrainingConfirmState(r) {
  if (r.national_id && trainingCompletionByNid.has(r.national_id)) return 'trained_manual';
  if (r._origTrainingStatus === 'Y') return 'trained_sync';
  return 'untrained';
}

// ----- ตัวกรองของแท็บนี้ (จังหวัด/อำเภอ/ตำบล/สถานะ/ค้นหา) -----
function getFilteredTrainingConfirmRows() {
  const provSel = document.getElementById('trainingConfirmFilterProvince');
  const distSel = document.getElementById('trainingConfirmFilterDistrict');
  const subdistSel = document.getElementById('trainingConfirmFilterSubdistrict');
  const statusSel = document.getElementById('trainingConfirmFilterStatus');
  const searchEl = document.getElementById('trainingConfirmFilterSearch');
  const province = provSel ? provSel.value : '';
  const district = distSel ? distSel.value : '';
  const subdistrict = subdistSel ? subdistSel.value : '';
  const status = statusSel ? statusSel.value : '';
  const q = searchEl ? searchEl.value.trim().toLowerCase() : '';
  return allRows.filter(r => {
    if (province && normName(r.province) !== normName(province)) return false;
    if (district && normName(r.district) !== normName(district)) return false;
    if (subdistrict && normName(r.subdistrict) !== normName(subdistrict)) return false;
    if (status && getTrainingConfirmState(r) !== status) return false;
    if (q) {
      const hay = `${r.prefix || ''}${r.first_name || ''} ${r.last_name || ''} ${r.national_id || ''} ${r.phone || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function populateTrainingConfirmFilterOptions() {
  const provSel = document.getElementById('trainingConfirmFilterProvince');
  const distSel = document.getElementById('trainingConfirmFilterDistrict');
  const subdistSel = document.getElementById('trainingConfirmFilterSubdistrict');
  if (!provSel || !distSel) return;

  const currentProvince = provSel.value;
  const provinces = [...new Set(allRows.map(r => r.province).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));
  provSel.innerHTML = '<option value="">ทุกจังหวัด</option>' + provinces.map(p => `<option value="${p}">${p}</option>`).join('');
  provSel.value = provinces.includes(currentProvince) ? currentProvince : '';

  const selectedProvince = provSel.value;
  const currentDistrict = distSel.value;
  const districts = [...new Set(
    allRows.filter(r => !selectedProvince || r.province === selectedProvince).map(r => r.district).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'th'));
  distSel.innerHTML = '<option value="">ทุกอำเภอ</option>' + districts.map(d => `<option value="${d}">${d}</option>`).join('');
  distSel.value = districts.includes(currentDistrict) ? currentDistrict : '';

  if (subdistSel) {
    const selectedDistrict = distSel.value;
    const currentSubdistrict = subdistSel.value;
    const subdistricts = [...new Set(
      allRows
        .filter(r => (!selectedProvince || r.province === selectedProvince) && (!selectedDistrict || r.district === selectedDistrict))
        .map(r => r.subdistrict).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, 'th'));
    subdistSel.innerHTML = '<option value="">ทุกตำบล</option>' + subdistricts.map(s => `<option value="${s}">${s}</option>`).join('');
    subdistSel.value = subdistricts.includes(currentSubdistrict) ? currentSubdistrict : '';
  }
}

function onTrainingConfirmFilterProvinceChange() { populateTrainingConfirmFilterOptions(); renderTrainingConfirmTab(); }
function onTrainingConfirmFilterDistrictChange() { populateTrainingConfirmFilterOptions(); renderTrainingConfirmTab(); }

function updateTrainingConfirmSelectedCount() {
  const countEl = document.getElementById('trainingConfirmSelectedCount');
  if (!countEl) return;
  const n = document.querySelectorAll('#trainingConfirmTbody .training-confirm-checkbox:checked').length;
  countEl.textContent = `เลือกแล้ว ${n.toLocaleString()} คน`;
}

function toggleSelectAllTrainingConfirm() {
  const boxes = document.querySelectorAll('#trainingConfirmTbody .training-confirm-checkbox');
  const allChecked = boxes.length > 0 && [...boxes].every(b => b.checked);
  boxes.forEach(b => { b.checked = !allChecked; });
  updateTrainingConfirmSelectedCount();
}

window.TRAINING_CONFIRM_STATE_BADGE = {
  trained_sync: '<span class="tag tag-Y"><i data-icon="check" data-size="15"></i> อบรมแล้ว (จากระบบ)</span>',
  trained_manual: '<span class="tag tag-Y"><i data-icon="check" data-size="15"></i> อบรมแล้ว (มาร์คเอง)</span>',
  untrained: '<span class="tag tag-N">ยังไม่อบรม</span>'
};

function renderTrainingConfirmTab() {
  const tbody = document.getElementById('trainingConfirmTbody');
  const markedBadge = document.getElementById('trainingConfirmMarkedBadge');
  if (markedBadge) markedBadge.textContent = trainingCompletionByNid.size.toLocaleString() + ' คนที่มาร์คเอง';
  if (!tbody) return;

  if (!allRows.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-state-cell"><span class="empty-text">กำลังโหลดรายชื่อ...</span></td></tr>';
    return;
  }

  populateTrainingConfirmFilterOptions();
  const rows = getFilteredTrainingConfirmRows();

  const countInfo = document.getElementById('trainingConfirmCountInfo');
  if (countInfo) countInfo.textContent = `แสดง ${rows.length.toLocaleString()} จาก ${allRows.length.toLocaleString()} คน`;

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-state-cell"><span class="empty-icon"><i data-icon="search" data-size="15"></i></span><span class="empty-text">ไม่พบคนที่ตรงกับตัวกรอง<br>ลองปรับตัวกรองดูใหม่นะครับ</span></td></tr>';
    updateTrainingConfirmSelectedCount();
    return;
  }

  // จำกัดจำนวนแถวที่วาดจริงกันหน่วง (ถ้าเยอะมากให้บอกผู้ใช้กรองแคบลง)
  const MAX = 800;
  const shown = rows.slice(0, MAX);
  tbody.innerHTML = shown.map((r, i) => {
    const state = getTrainingConfirmState(r);
    const nidSafe = (r.national_id || '').replace(/'/g, "\\'");
    const canSelect = state === 'untrained' && r.national_id;
    const fullName = `${r.prefix || ''}${r.first_name || ''} ${r.last_name || ''}`.trim();
    return `
      <tr>
        <td>${canSelect ? `<input type="checkbox" class="training-confirm-checkbox" data-nid="${r.national_id}" onchange="updateTrainingConfirmSelectedCount()">` : ''}</td>
        <td>${i + 1}</td>
        <td>${fullName || '-'}</td>
        <td>${r.national_id || '-'}</td>
        <td>${r.phone || '-'}</td>
        <td>${r.province || '-'}</td>
        <td>${r.district || '-'}</td>
        <td>${r.subdistrict || '-'}</td>
        <td>${TRAINING_CONFIRM_STATE_BADGE[state]}</td>
        <td>${state === 'trained_manual' ? `<button type="button" class="btn-linklike" style="color:var(--red);" onclick="unmarkFarmerTrained('${nidSafe}')"><i data-icon="undo" data-size="15"></i> ยกเลิกมาร์ค</button>` : ''}</td>
      </tr>
    `;
  }).join('') + (rows.length > MAX ? `<tr><td colspan="10" style="text-align:center; opacity:.7; padding:10px;">แสดง ${MAX.toLocaleString()} คนแรกจาก ${rows.length.toLocaleString()} คน — ลองกรองจังหวัด/อำเภอ/ตำบลให้แคบลงเพื่อดูครบ</td></tr>` : '');
  updateTrainingConfirmSelectedCount();
}

// รีเฟรชทุกหน้าที่อ้างอิงสถานะอบรม หลังมีการมาร์ค/ยกเลิก (allRows ถูกแพตช์ในหน่วยความจำแล้ว)
function refreshTrainingViewsAfterOverrideChange() {
  renderTrainingConfirmTab();
  if (allRows.length) {
    renderKpis(allRows);
    renderProvinceBreakdown(allRows);
    renderScoreboard(allRows);
    renderLeaderboard(allRows);
    applyFilters();
  }
  // ถ้าพาแนลเลือกคนในหน้าแผนที่เปิดค้างอยู่ ให้วาดใหม่ให้สถานะตรง
  if (currentPeoplePanelProvince && currentPeoplePanelDistrict && currentPeoplePanelMode === 'district') {
    showDistrictPeople(currentPeoplePanelProvince, currentPeoplePanelDistrict);
  }
}

// มาร์คหลายคนพร้อมกัน (รับ array ของ national_id) แล้วซิงก์ขึ้น Supabase ทีเดียว
async function markFarmersAsTrained(nids) {
  if (blockIfReadOnly()) return;
  const uniqueNids = [...new Set(nids.filter(Boolean))];
  const payload = [];
  uniqueNids.forEach(nid => {
    const r = allRows.find(row => row.national_id === nid);
    if (!r) return;
    const name = `${r.prefix || ''}${r.first_name || ''} ${r.last_name || ''}`.trim();
    const rec = { national_id: nid, name: name || null, marked_by: currentUserName || null, marked_at: new Date().toISOString() };
    trainingCompletionByNid.set(nid, rec);
    payload.push(rec);
  });
  if (!payload.length) { showToast('ไม่มีรายชื่อให้มาร์คครับ', 'warn'); return; }
  applyTrainingOverrides();
  refreshTrainingViewsAfterOverrideChange();
  showToast(`ทำเครื่องหมายว่าอบรมแล้ว ${payload.length.toLocaleString()} คนครับ`, 'success');
  if (supabaseClient) {
    const { error } = await supabaseClient.from('training_completion').upsert(payload, { onConflict: 'national_id' });
    if (error) showToast('บันทึกขึ้นระบบไม่สำเร็จ: ' + error.message + ' (ตรวจว่ารันไฟล์ training_completion_setup.sql แล้วหรือยัง)', 'warn');
  }
}

function markTrainingConfirmSelected() {
  if (blockIfReadOnly()) return;
  const checked = [...document.querySelectorAll('#trainingConfirmTbody .training-confirm-checkbox:checked')];
  if (!checked.length) { showToast('กรุณาติ๊กเลือกอย่างน้อย 1 คนก่อนครับ', 'warn'); return; }
  markFarmersAsTrained(checked.map(cb => cb.getAttribute('data-nid')));
}

async function markTrainingConfirmFilteredUntrained() {
  if (blockIfReadOnly()) return;
  const untrained = getFilteredTrainingConfirmRows().filter(r => getTrainingConfirmState(r) === 'untrained' && r.national_id);
  if (!untrained.length) { showToast('ในรายการที่กรองอยู่ ไม่มีคนที่ "ยังไม่อบรม" ให้มาร์คครับ', 'warn'); return; }
  const confirmed = await showConfirmModal(`ยืนยันทำเครื่องหมายว่าอบรมแล้วให้ทุกคนที่ยังไม่อบรมในรายการนี้ ${untrained.length.toLocaleString()} คน?`);
  if (!confirmed) return;
  markFarmersAsTrained(untrained.map(r => r.national_id));
}

async function unmarkFarmerTrained(nid) {
  if (blockIfReadOnly()) return;
  if (!trainingCompletionByNid.has(nid)) return;
  trainingCompletionByNid.delete(nid);
  applyTrainingOverrides(); // คืน training_status กลับเป็นค่าดั้งเดิมจากซิงก์ให้คนนี้
  refreshTrainingViewsAfterOverrideChange();
  showToast('ยกเลิกเครื่องหมาย "อบรมแล้ว" ให้คนนี้แล้วครับ', 'success');
  if (supabaseClient) {
    const { error } = await supabaseClient.from('training_completion').delete().eq('national_id', nid);
    if (error) showToast('ลบออกจากระบบไม่สำเร็จ: ' + error.message, 'warn');
  }
}

async function loadData() {
  if (!supabaseClient) initClient();
  document.getElementById('status').innerHTML = '<span class="spinner-inline"></span>กำลังโหลดข้อมูล...';

  let rows = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseClient
      .from('farmers')
      .select('*')
      .range(from, from + pageSize - 1)
      .order('province', { ascending: true });
    if (error) {
      document.getElementById('status').textContent = 'เกิดข้อผิดพลาด: ' + error.message;
      return;
    }
    rows = rows.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  allRows = rows;
  await loadTrainingCompletion();
  applyTrainingOverrides(); // แพตช์คนที่แอดมินมาร์คว่าอบรมแล้วก่อน render ทุกหน้า
  let lastSyncText = 'ยังไม่มีข้อมูล';
  try {
    const { data: logData, error: logError } = await supabaseClient
      .from('sync_log')
      .select('synced_at')
      .order('synced_at', { ascending: false })
      .limit(1);
    if (!logError && logData && logData.length) {
      lastSyncText = new Date(logData[0].synced_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
    } else {
      lastSyncText = new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) + ' (เวลาที่เปิดหน้านี้)';
    }
  } catch (e) {
    lastSyncText = new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) + ' (เวลาที่เปิดหน้านี้)';
  }
  document.getElementById('status').textContent = 'โหลดสำเร็จ ' + rows.length + ' รายการ · ข้อมูลอัปเดตล่าสุด ' + lastSyncText;
  document.getElementById('headerSub').textContent = 'ข้อมูล ' + rows.length + ' รายการ · อัปเดตล่าสุด ' + lastSyncText;

  populateProvinceFilter(rows);
  renderKpis(rows);
  renderProvinceBreakdown(rows);
  loadProgressSnapshots();
  applyFilters();
  renderScoreboard(rows);
  renderLeaderboard(rows);
  if (geoProvinces) renderCountryProvinces();
  renderTrainingConfirmTab();
  backfillPlanSubdistricts();
}

function aggregateByProvince(rows, provinceField, statusField, doneValue, notDoneValue) {
  provinceField = provinceField || 'province';
  statusField = statusField || 'training_status';
  doneValue = doneValue || 'Y';
  notDoneValue = notDoneValue || 'N';
  const agg = {};
  rows.forEach(r => {
    const p = r[provinceField] || 'ไม่ระบุ';
    if (!agg[p]) agg[p] = { Y: 0, N: 0 };
    if (r[statusField] === doneValue) agg[p].Y++;
    else if (r[statusField] === notDoneValue) agg[p].N++;
  });
  return Object.entries(agg)
    .map(([province, v]) => ({ province, Y: v.Y, N: v.N, total: v.Y + v.N, pct: v.Y + v.N ? Math.round((v.Y / (v.Y + v.N)) * 100) : 0 }))
    .sort((a, b) => b.total - a.total);
}

function aggregateByProvinceDistrict(rows, provinceField, districtField, statusField, doneValue, notDoneValue) {
  provinceField = provinceField || 'province';
  districtField = districtField || 'district';
  statusField = statusField || 'training_status';
  doneValue = doneValue || 'Y';
  notDoneValue = notDoneValue || 'N';
  const agg = {};
  rows.forEach(r => {
    const key = (r[provinceField] || '') + '|' + (r[districtField] || '');
    if (!agg[key]) agg[key] = { province: r[provinceField], district: r[districtField], Y: 0, N: 0 };
    if (r[statusField] === doneValue) agg[key].Y++;
    else if (r[statusField] === notDoneValue) agg[key].N++;
  });
  return Object.values(agg).map(v => ({
    ...v, total: v.Y + v.N, pct: (v.Y + v.N) ? Math.round((v.Y / (v.Y + v.N)) * 100) : 0
  }));
}

function renderKpis(rows) {
  const total = rows.length;
  const y = rows.filter(r => r.training_status === 'Y').length;
  const n = rows.filter(r => r.training_status === 'N').length;
  const provinces = new Set(rows.map(r => r.province)).size;
  const byProvince = aggregateByProvince(rows);
  const fullProvinces = byProvince.filter(p => p.pct === 100).length;

  animateNumber(document.getElementById('kpiTotal'), total, 700);
  document.getElementById('kpiProvinces').textContent = provinces + ' จังหวัด';
  animateNumber(document.getElementById('kpiY'), y, 700);
  document.getElementById('kpiYPct').textContent = total ? Math.round((y / total) * 100) + '% ของทั้งหมด' : '-';
  animateNumber(document.getElementById('kpiN'), n, 700);
  document.getElementById('kpiNPct').textContent = total ? Math.round((n / total) * 100) + '% ของทั้งหมด' : '-';
  document.getElementById('kpiFullProvinces').textContent = fullProvinces + ' / ' + byProvince.length;

  renderDashStatusList({ total, y, n, provinces, fullProvinces });
}

// แถบสรุปสถานะด้านขวา (แทนที่จะซ้ำตัวเลขบนสุด อันนี้เน้นสัดส่วนและบริบท)
function renderDashStatusList({ total, y, n, provinces, fullProvinces }) {
  const el = document.getElementById('dashStatusList');
  if (!el) return;
  const pct = (v) => (total ? Math.round((v / total) * 100) + '%' : '-');
  const rows = [
    { ico: 'done', label: 'อบรมแล้ว', cls: 'stat-ok', value: y, sub: pct(y) },
    { ico: 'not-allowed', label: 'ยังไม่ผ่าน', cls: 'stat-danger', value: n, sub: pct(n) },
    { ico: 'pin', label: 'จังหวัดที่มีข้อมูล', cls: 'stat-info', value: provinces, sub: '' },
    { ico: 'trophy', label: 'จังหวัดครบ 100%', cls: 'stat-ok', value: fullProvinces, sub: '' },
  ];
  el.innerHTML = rows.map(r => `
    <div class="rail-row">
      <span class="stat ${r.cls} has-ico">${icon(r.ico, 13)}</span>
      <span class="rail-label">${r.label}</span>
      <span class="rail-count">${r.value.toLocaleString()}</span>
      ${r.sub ? `<span class="chip-pct">${r.sub}</span>` : ''}
    </div>
  `).join('');
}

function renderProvinceBreakdown(rows) {
  const byProvince = aggregateByProvince(rows);

  const tbody = document.getElementById('provinceTbody');
  tbody.innerHTML = byProvince.map(p => `
    <tr>
      <td class="cell-strong">${p.province}</td>
      <td class="num" style="color:var(--ok);font-weight:600;">${p.Y.toLocaleString()}</td>
      <td class="num" style="color:var(--danger);font-weight:600;">${p.N.toLocaleString()}</td>
      <td class="num cell-muted">${p.total.toLocaleString()}</td>
      <td>
        <div class="bar-cell">
          <div class="bar-track"><div class="bar-fill" style="width:${p.pct}%; background:${p.pct < 50 ? 'var(--danger)' : 'var(--brand)'};"></div></div>
          <div class="pct-text">${p.pct}%</div>
        </div>
      </td>
    </tr>
  `).join('');

  // อันดับจังหวัดในแถบขวา — เรียงตาม % แล้วโชว์ 10 อันดับแรก
  const rankEl = document.getElementById('provinceRankList');
  if (rankEl) {
    const top = [...byProvince].sort((a, b) => b.pct - a.pct).slice(0, 10);
    rankEl.innerHTML = top.length ? top.map(p => `
      <div class="rank-row">
        <span class="rank-name" title="${p.province}">${p.province}</span>
        <div class="rank-track">
          <div class="rank-fill" style="width:${Math.max(p.pct, 4)}%;"></div>
          <span class="rank-val">${p.pct}%</span>
        </div>
        <span class="rank-total">${p.total.toLocaleString()}</span>
      </div>
    `).join('') : `<div class="empty"><span class="empty-ico">${icon('inbox', 20)}</span><span class="empty-text">ยังไม่มีข้อมูล</span></div>`;
  }

  const ctx = document.getElementById('provinceChart').getContext('2d');
  const labels = byProvince.map(p => p.province);
  const yData = byProvince.map(p => p.Y);
  const nData = byProvince.map(p => p.N);

  if (provinceChart) provinceChart.destroy();
  provinceChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'อบรมแล้ว', data: yData, backgroundColor: '#3ba68a', borderRadius: 5, maxBarThickness: 26 },
        { label: 'ยังไม่ผ่าน', data: nData, backgroundColor: '#d94a40', borderRadius: 5, maxBarThickness: 26 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      // สไตล์กราฟให้เงียบลง: ไม่มีเส้นกริดแนวตั้ง แกนบาง ตัวหนังสือเทา
      scales: {
        x: {
          grid: { display: false },
          border: { color: chartTone().border },
          ticks: { font: { family: 'Sarabun', size: 12 }, color: chartTone().muted }
        },
        y: {
          beginAtZero: true,
          grid: { color: chartTone().border, drawTicks: false },
          border: { display: false },
          ticks: { font: { family: 'Sarabun', size: 12 }, color: chartTone().muted, padding: 8 }
        }
      },
      plugins: {
        legend: {
          position: 'top', align: 'end',
          labels: { font: { family: 'Sarabun', size: 12 }, color: chartTone().muted, boxWidth: 9, boxHeight: 9, usePointStyle: true, pointStyle: 'circle', padding: 16 }
        },
        tooltip: {
          backgroundColor: chartTone().tip, padding: 11, cornerRadius: 9, displayColors: true, boxPadding: 4,
          titleFont: { family: 'Sarabun', size: 12.5 }, bodyFont: { family: 'Sarabun', size: 12.5 }
        }
      }
    }
  });
}

function renderScoreboard(rows) {
  const y = rows.filter(r => r.training_status === 'Y').length;
  const n = rows.filter(r => r.training_status === 'N').length;
  const total = y + n;
  const pctY = total ? Math.round((y / total) * 100) : 50;
  const pctN = 100 - pctY;

  animateNumber(document.getElementById('scoreY'), y, 900);
  animateNumber(document.getElementById('scoreN'), n, 900);
  document.getElementById('scoreBarY').style.width = pctY + '%';
  document.getElementById('scoreBarN').style.width = pctN + '%';
  document.getElementById('scorePctY').textContent = pctY + '%';
  document.getElementById('scorePctN').textContent = pctN + '%';
}

function renderLeaderboard(rows) {
  const byProvince = aggregateByProvince(rows).slice().sort((a, b) => b.pct - a.pct || b.total - a.total);
  const rankClass = (i) => i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
  const el = document.getElementById('leaderboard');
  el.innerHTML = byProvince.map((p, i) => `
    <div class="lb-row" onclick="zoomToProvinceByName('${p.province}')">
      <div class="lb-rank ${rankClass(i)}">${i + 1}</div>
      <div class="lb-info">
        <div class="lb-name">${p.province}</div>
        <div class="lb-count">${p.Y.toLocaleString()}/${p.total.toLocaleString()} คน</div>
        <div class="lb-bar-track"><div class="lb-bar-fill" style="width:${p.pct}%;"></div></div>
      </div>
      <div class="lb-pct">${p.pct}%</div>
    </div>
  `).join('');
}

function renderDistrictLeaderboard(provName, pro_code) {
  const byDistrict = aggregateByProvinceDistrict(allRows)
    .filter(d => normName(d.province) === normName(provName))
    .slice()
    .sort((a, b) => b.pct - a.pct || b.total - a.total);
  const rankClass = (i) => i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
  const el = document.getElementById('leaderboard');
  document.getElementById('lbTitle').textContent = 'อันดับอำเภอ (% อบรมสำเร็จ) · ' + provName;
  el.innerHTML = byDistrict.map((d, i) => `
    <div class="lb-row" data-district="${d.district}" onclick="zoomToDistrict('${pro_code}','${d.district}')">
      <div class="lb-rank ${rankClass(i)}">${i + 1}</div>
      <div class="lb-info">
        <div class="lb-name">${d.district}</div>
        <div class="lb-count">${d.Y.toLocaleString()}/${d.total.toLocaleString()} คน</div>
        <div class="lb-bar-track"><div class="lb-bar-fill" style="width:${d.pct}%;"></div></div>
      </div>
      <div class="lb-pct">${d.pct}%</div>
    </div>
  `).join('');
}

function restoreProvinceLeaderboard() {
  document.getElementById('lbTitle').textContent = 'อันดับจังหวัด (% อบรมสำเร็จ)';
  renderLeaderboard(allRows);
}

// expose ฟังก์ชันของโมดูลนี้ให้ inline handlers และโมดูลอื่นเรียกผ่าน window ได้
Object.assign(window, {
  buildSparklinePath, renderSparklineSvg, renderKpiSparklines, loadTrainingCompletion, applyTrainingOverrides, getTrainingConfirmState,
  getFilteredTrainingConfirmRows, populateTrainingConfirmFilterOptions, onTrainingConfirmFilterProvinceChange, onTrainingConfirmFilterDistrictChange, updateTrainingConfirmSelectedCount, toggleSelectAllTrainingConfirm,
  renderTrainingConfirmTab, refreshTrainingViewsAfterOverrideChange, markFarmersAsTrained, markTrainingConfirmSelected, markTrainingConfirmFilteredUntrained, unmarkFarmerTrained,
  loadData, aggregateByProvince, aggregateByProvinceDistrict, renderKpis, renderProvinceBreakdown, renderScoreboard,
  renderLeaderboard, renderDistrictLeaderboard, restoreProvinceLeaderboard,
});

// วาดกราฟใหม่เมื่อสลับธีม (สีแกน/ตัวหนังสือของ Chart.js เป็นค่าคงที่ ไม่ตามตัวแปร CSS)
function refreshThemedCharts() {
  if (typeof allRows !== 'undefined' && allRows && allRows.length && document.getElementById('provinceChart')) {
    try { renderProvinceBreakdown(allRows); } catch (e) { /* ยังโหลดข้อมูลไม่เสร็จ ข้ามไป */ }
  }
}
Object.assign(window, { chartTone, renderDashStatusList, refreshThemedCharts });
