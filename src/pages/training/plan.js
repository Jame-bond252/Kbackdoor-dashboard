// ===== หน้าแผนอบรมรายสัปดาห์: ตาราง/ปฏิทิน + ซิงก์ Supabase + realtime + PDF + จัดเส้นทาง =====
// แยกมาจาก main.js เดิม — ตัวแปร/ฟังก์ชันแชร์ผ่าน window (โค้ดเดิมออกแบบเป็น global scope)


function savePlanToStorage() {
  localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(trainingPlan));
}

// เติมข้อมูล "ตำบล" ย้อนหลังให้รายการเก่าที่เพิ่มเข้าแผนไว้ก่อนมีฟีเจอร์นี้
// (ตอนนั้นยังไม่เก็บตำบล) โดยจับคู่เลขบัตรประชาชนกับข้อมูลเกษตรกรที่โหลดมาแล้ว
function backfillPlanSubdistricts() {
  if (!allRows.length || !trainingPlan.length) return;
  const changedEntries = [];
  trainingPlan.forEach(p => {
    if (!p.subdistrict && p.nationalId) {
      const match = allRows.find(r => r.national_id === p.nationalId);
      if (match && match.subdistrict) {
        p.subdistrict = match.subdistrict;
        changedEntries.push(p);
      }
    }
  });
  if (changedEntries.length) {
    savePlanToStorage();
    renderPlanTable();
    syncPlanEntriesToSupabase(changedEntries);
  }
}

// ----- ซิงก์แผนอบรมขึ้น Supabase (ตาราง training_plan) -----
// ถ้ายังไม่ได้ตั้งค่า Supabase หรือยังไม่ได้สร้างตารางนี้ ฟังก์ชันพวกนี้จะข้ามไปเงียบๆ
// แล้วใช้ข้อมูลใน localStorage ของเบราว์เซอร์นี้ต่อไปตามปกติ (ไม่ทำให้แอปพัง)
function planEntryToSupabaseRow(entry) {
  return {
    id: entry.id,
    national_id: entry.nationalId || null,
    name: entry.name || null,
    province: entry.province || null,
    district: entry.district || null,
    subdistrict: entry.subdistrict || null,
    phone: entry.phone || null,
    visit_date: entry.visitDate || null,
    map_link: entry.mapLink || null,
    note: entry.note || null,
    status: entry.status || 'pending',
    sort_order: entry.sortOrder || 0,
    updated_by: currentUserName || null,
    updated_at: new Date().toISOString()
  };
}

async function syncPlanEntriesToSupabase(entries) {
  if (blockIfReadOnly()) return;
  if (!supabaseClient || !entries || !entries.length) return;
  try {
    const rows = entries.map(planEntryToSupabaseRow);
    const { error } = await supabaseClient.from('training_plan').upsert(rows);
    if (error) throw error;
  } catch (e) {
    showToast('ซิงก์แผนอบรมขึ้น Supabase ไม่สำเร็จ: ' + e.message, 'error');
  }
}

async function deletePlanEntryFromSupabase(id) {
  if (blockIfReadOnly()) return;
  if (!supabaseClient) return;
  try {
    const { error } = await supabaseClient.from('training_plan').delete().eq('id', id);
    if (error) throw error;
  } catch (e) {
    showToast('ลบรายการออกจาก Supabase ไม่สำเร็จ: ' + e.message, 'error');
  }
}

async function deleteAllPlanEntriesFromSupabase(ids) {
  if (blockIfReadOnly()) return;
  if (!supabaseClient || !ids || !ids.length) return;
  try {
    const { error } = await supabaseClient.from('training_plan').delete().in('id', ids);
    if (error) throw error;
  } catch (e) {
    showToast('ล้างแผนอบรมบน Supabase ไม่สำเร็จ: ' + e.message, 'error');
  }
}

async function syncPlanFromSupabase(opts) {
  opts = opts || {};
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient.from('training_plan').select('*');
    if (error) throw error;

    if (data && data.length === 0 && trainingPlan.length > 0) {
      // ตารางบน Supabase ยังว่างอยู่ แต่เครื่องนี้มีข้อมูลเดิมอยู่แล้ว (เช่น เพิ่งตั้งค่า Supabase ครั้งแรก)
      // ให้อัปโหลดข้อมูลเดิมขึ้นไปแทนการเขียนทับด้วยความว่างเปล่า
      await syncPlanEntriesToSupabase(trainingPlan);
      if (opts.showToastOnSuccess) showToast('อัปโหลดแผนอบรมเดิมขึ้น Supabase แล้ว', 'success');
      return;
    }

    if (data) {
      trainingPlan = data.map(row => ({
        id: row.id,
        nationalId: row.national_id || '',
        name: row.name || '',
        province: row.province || '',
        district: row.district || '',
        subdistrict: row.subdistrict || '',
        phone: row.phone || '',
        visitDate: row.visit_date || '',
        mapLink: row.map_link || '',
        note: row.note || '',
        status: row.status || 'pending',
        sortOrder: row.sort_order || 0,
        updatedBy: row.updated_by || '',
        updatedAt: row.updated_at || ''
      }));
      savePlanToStorage();
      renderPlanTable();
      if (planCurrentView === 'calendar') renderPlanCalendar();
      if (opts.showToastOnSuccess) showToast('ดึงแผนอบรมล่าสุดจาก Supabase แล้ว', 'success');
    }
  } catch (e) {
    // ตารางอาจยังไม่ถูกสร้าง หรือเน็ตหลุด — เงียบไว้แล้วใช้ข้อมูลในเบราว์เซอร์นี้ต่อ ไม่ให้หน้าเว็บพังตอนโหลด
    console.warn('ซิงก์แผนอบรมจาก Supabase ไม่สำเร็จ (จะใช้ข้อมูลในเบราว์เซอร์นี้แทน):', e.message);
    if (opts.showToastOnSuccess) showToast('ดึงข้อมูลจาก Supabase ไม่สำเร็จ: ' + e.message, 'error');
  }
}

// เพิ่มคนคนเดียวเข้าแผน (คืนค่า object รายการที่เพิ่ม ถ้าเพิ่มจริง, null ถ้าซ้ำ/ไม่มีเลขบัตร)
// คืน array ของวันที่ (YYYY-MM-DD) ทุกวันตั้งแต่ start ถึง end (รวมทั้งสองวัน)
function enumerateDateRange(startStr, endStr) {
  const dates = [];
  if (!startStr || !endStr || endStr < startStr) return dates;
  let cur = startStr;
  let guard = 0;
  while (cur <= endStr && guard < 366) {
    dates.push(cur);
    cur = addDaysToDateStr(cur, 1);
    guard++;
  }
  return dates;
}

// แบ่งวันในช่วง start-end ให้แต่ละ "ตำบล" คนละวันแบบวนรอบ (ถ้าตำบลเยอะกว่าจำนวนวันในช่วง จะวนกลับมาเริ่มวันแรกใหม่)
// คืนค่าเป็น Map: ชื่อตำบล -> วันที่ ('YYYY-MM-DD') เรียงตามลำดับตำบลที่ส่งเข้ามา (เรียงเองก่อนเรียกถ้าต้องการลำดับที่แน่นอน)
function distributeDatesBySubdistrict(subdistricts, startStr, endStr) {
  const dates = enumerateDateRange(startStr, endStr);
  const map = new Map();
  if (!dates.length) return map;
  subdistricts.forEach((sd, i) => { map.set(sd, dates[i % dates.length]); });
  return map;
}

// ใช้ตอนเปิดโหมด "เลือกวันที่ก่อน" ที่แผนที่ — สแตมป์วันที่ให้ entry ที่เพิ่งเพิ่มเข้าแผน ตามตำบลของเขา
// ตำบลเดียวกันจะได้วันเดียวกันเสมอ (จำไว้ใน mapPreschedule.subdistrictDates) ตำบลใหม่จะได้วันถัดไปในช่วงแบบวนรอบ
function applyPrescheduleDateIfActive(entry) {
  if (!mapPreschedule.enabled || !entry) return;
  const key = entry.subdistrict || 'ไม่ระบุตำบล';
  if (!mapPreschedule.subdistrictDates[key]) {
    const dates = enumerateDateRange(mapPreschedule.start, mapPreschedule.end);
    if (!dates.length) return;
    const nextIndex = Object.keys(mapPreschedule.subdistrictDates).length % dates.length;
    mapPreschedule.subdistrictDates[key] = dates[nextIndex];
  }
  entry.visitDate = mapPreschedule.subdistrictDates[key];
}

// เปิด/ปิดโหมด "เลือกวันที่ก่อน" บนแผนที่ — ทุกคนที่ถูกเพิ่มเข้าแผนหลังจากนี้จะได้วันที่ auto ตามตำบล (ผ่าน applyPrescheduleDateIfActive)
function toggleMapPreschedule(checked) {
  const datesEl = document.getElementById('mapPrescheduleDates');
  const statusEl = document.getElementById('mapPrescheduleStatusText');
  mapPreschedule.enabled = checked;
  if (datesEl) datesEl.style.display = checked ? 'inline-flex' : 'none';
  if (checked) {
    const startInput = document.getElementById('mapPrescheduleStart');
    const endInput = document.getElementById('mapPrescheduleEnd');
    if (startInput && !startInput.value) startInput.value = mapPreschedule.start || '';
    if (endInput && !endInput.value) endInput.value = mapPreschedule.end || '';
    updateMapPrescheduleRange();
  } else {
    mapPreschedule.subdistrictDates = {};
    if (statusEl) statusEl.textContent = '';
  }
}

function updateMapPrescheduleRange() {
  const startInput = document.getElementById('mapPrescheduleStart');
  const endInput = document.getElementById('mapPrescheduleEnd');
  const statusEl = document.getElementById('mapPrescheduleStatusText');
  const start = startInput ? startInput.value : '';
  const end = endInput ? endInput.value : '';
  if (!start || !end || end < start) {
    mapPreschedule.enabled = false;
    if (statusEl) statusEl.textContent = 'กรุณาเลือกวันเริ่ม-วันสิ้นสุดให้ถูกต้องครับ (วันสิ้นสุดต้องไม่ก่อนวันเริ่ม)';
    return;
  }
  mapPreschedule.enabled = true;
  mapPreschedule.start = start;
  mapPreschedule.end = end;
  mapPreschedule.subdistrictDates = {};
  const dayCount = enumerateDateRange(start, end).length;
  if (statusEl) statusEl.textContent = `เปิดใช้งานแล้ว: คนที่เพิ่มเข้าแผนต่อจากนี้จะได้วันที่อัตโนมัติตามตำบล (แบ่งวนรอบใน ${dayCount} วัน)`;
  showToast('เปิดโหมดเลือกวันที่ก่อนแล้ว — เพิ่มคนเข้าแผนได้ตามปกติ ระบบจะใส่วันที่ให้อัตโนมัติ', 'success');
}

function addPersonToPlan(p) {
  if (!p || !p.national_id) return null;
  if (trainingPlan.some(e => e.nationalId === p.national_id)) return null;
  const entry = {
    id: 'p' + Date.now() + Math.random().toString(36).slice(2),
    nationalId: p.national_id,
    name: `${p.prefix||''}${p.first_name||''} ${p.last_name||''}`.trim(),
    province: p.province || '',
    district: p.district || '',
    subdistrict: p.subdistrict || '',
    phone: p.phone || '',
    visitDate: '',
    mapLink: '',
    note: '',
    status: 'pending',
    sortOrder: Date.now()
  };
  trainingPlan.push(entry);
  return entry;
}

function addPersonToPlanByNid(nid) {
  if (blockIfReadOnly()) return;
  const p = allRows.find(r => r.national_id === nid);
  if (!p) return;
  const entry = addPersonToPlan(p);
  if (entry) applyPrescheduleDateIfActive(entry);
  savePlanToStorage();
  renderPlanTable();
  refreshPeoplePanel();
  if (entry) {
    syncPlanEntriesToSupabase([entry]);
  } else {
    showToast(`${p.prefix || ''}${p.first_name || ''} ${p.last_name || ''} อยู่ในแผนอบรมอยู่แล้วครับ`, 'info');
  }
}

// เพิ่มคนที่ "ยังไม่อบรม" ทั้งอำเภอที่ระบุเข้าแผน (parametrized เพื่อใช้ได้ทั้งมุมมองทีละอำเภอ และมุมมองทั้งจังหวัด)
function addAllUntrainedToPlanFor(province, district) {
  if (blockIfReadOnly()) return;
  const people = allRows.filter(r =>
    normName(r.province) === normName(province) &&
    normName(r.district) === normName(district) &&
    r.training_status === 'N'
  );
  const addedEntries = [];
  people.forEach(p => {
    const entry = addPersonToPlan(p);
    if (entry) { applyPrescheduleDateIfActive(entry); addedEntries.push(entry); }
  });
  savePlanToStorage();
  renderPlanTable();
  refreshPeoplePanel();
  if (addedEntries.length) syncPlanEntriesToSupabase(addedEntries);
  showToast(addedEntries.length ? `เพิ่ม ${addedEntries.length} คนเข้าแผนอบรมแล้ว` : 'ทุกคนอยู่ในแผนอบรมแล้ว', addedEntries.length ? 'success' : 'info');
  return addedEntries;
}

function addAllDistrictUntrainedToPlan() {
  if (blockIfReadOnly()) return;
  if (!currentPeoplePanelProvince || !currentPeoplePanelDistrict) return;
  addAllUntrainedToPlanFor(currentPeoplePanelProvince, currentPeoplePanelDistrict);
}

function addSelectedPeopleToPlan(groupId) {
  if (blockIfReadOnly()) return;
  const container = document.getElementById(groupId + 'Tbody');
  if (!container) return;
  const checked = container.querySelectorAll('.plan-select-checkbox:checked');
  const addedEntries = [];
  checked.forEach(cb => {
    const nid = cb.getAttribute('data-nid');
    const p = allRows.find(r => r.national_id === nid);
    if (p) {
      const entry = addPersonToPlan(p);
      if (entry) { applyPrescheduleDateIfActive(entry); addedEntries.push(entry); }
    }
  });
  savePlanToStorage();
  renderPlanTable();
  refreshPeoplePanel();
  if (addedEntries.length) syncPlanEntriesToSupabase(addedEntries);
  if (!checked.length) { showToast('กรุณาเลือกอย่างน้อย 1 คนก่อนครับ', 'warn'); return; }
  showToast(addedEntries.length ? `เพิ่ม ${addedEntries.length} คนเข้าแผนอบรมแล้ว` : 'คนที่เลือกอยู่ในแผนอบรมอยู่แล้ว', addedEntries.length ? 'success' : 'info');
}

function toggleSelectAllPeople(groupId) {
  const container = document.getElementById(groupId + 'Tbody');
  if (!container) return;
  const boxes = container.querySelectorAll('.plan-select-checkbox:not(:disabled)');
  const allChecked = [...boxes].every(b => b.checked);
  boxes.forEach(b => { b.checked = !allChecked; });
}

window.PLAN_STATUS_LABELS = { pending: 'ยังไม่ไป', done: 'ไปแล้ว', cancelled: 'ยกเลิก' };

// จำ id ของแถวที่ต้องไฮไลท์ในตารางแผนอบรม (ใช้ครั้งเดียวตอน jump มาจากช่องค้นหาทุกระบบ แล้วเคลียร์ทิ้งทันที
// ไม่งั้นจะค้างไฮไลท์แถวเดิมซ้ำทุกครั้งที่พิมพ์ค้นหา/แก้ข้อมูลในตารางต่อจากนั้น)
window.planHighlightEntryId = null;

function planRowHtml(p, i) {
  const mapLinkSafe = (p.mapLink || '').replace(/"/g, '&quot;');
  const status = p.status || 'pending';
  const hasDate = !!p.visitDate;
  const isHighlighted = p.id === planHighlightEntryId;
  return `
    <tr class="plan-row-${status}${isHighlighted ? ' row-highlight' : ''}" ${isHighlighted ? 'id="highlightedPlanTableRow"' : ''}>
      <td>${i + 1}</td>
      <td style="text-align:center;">
        ${hasDate
          ? `<span class="stat stat-ok has-ico"><i data-icon="check" data-size="12"></i> นัดแล้ว</span>`
          : `<span class="stat stat-danger">ยังไม่นัด</span>`}
      </td>
      <td>
        <input class="plan-week-input" type="date" value="${p.visitDate || ''}" onchange="updatePlanField('${p.id}','visitDate',this.value)">
        <div class="plan-map-actions">
          <button type="button" class="btn-linklike" onclick="applyVisitDateToSubdistrict('${p.id}')">ใช้ทั้งตำบล</button>
        </div>
      </td>
      <td>
        <select class="plan-status-select status-${status}" onchange="this.className='plan-status-select status-'+this.value; this.closest('tr').className='plan-row-'+this.value; updatePlanField('${p.id}','status',this.value)">
          <option value="pending" ${status === 'pending' ? 'selected' : ''}>ยังไม่ไป</option>
          <option value="done" ${status === 'done' ? 'selected' : ''}>ไปแล้ว</option>
          <option value="cancelled" ${status === 'cancelled' ? 'selected' : ''}>ยกเลิก</option>
        </select>
      </td>
      <td>${p.name || '-'}</td>
      <td>${p.nationalId || ''}</td>
      <td>${p.phone || ''}</td>
      <td>${p.province}</td>
      <td>${p.district || '-'}</td>
      <td>${p.subdistrict || '-'}</td>
      <td>
        <input class="plan-note-input plan-map-input" type="text" value="${mapLinkSafe}" placeholder="วางลิงก์ Google Maps" oninput="updatePlanField('${p.id}','mapLink',this.value)">
        <div class="plan-map-actions">
          ${p.mapLink ? `<a href="${mapLinkSafe}" target="_blank" rel="noopener" class="plan-map-link"><i data-icon="pin" data-size="15"></i> เปิดแผนที่</a>` : ''}
          <button type="button" class="btn-linklike" onclick="applyMapLinkToSubdistrict('${p.id}')">ใช้ทั้งตำบล</button>
        </div>
      </td>
      <td>
        <input class="plan-note-input${p.note ? ' note-input-filled' : ''}" type="text" value="${(p.note||'').replace(/"/g,'&quot;')}" placeholder="หมายเหตุ" oninput="updatePlanField('${p.id}','note',this.value); this.classList.toggle('note-input-filled', !!this.value.trim())">
        ${p.updatedBy ? `<div class="plan-meta-line" title="แก้ไขล่าสุดโดย ${p.updatedBy}${p.updatedAt ? ' · ' + formatDateTimeThai(p.updatedAt) : ''}"><i data-icon="edit" data-size="15"></i> ${p.updatedBy}${p.updatedAt ? ' · ' + formatRelativeTime(p.updatedAt) : ''}</div>` : ''}
      </td>
      <td><button class="plan-remove-btn" onclick="removePlanEntry('${p.id}')" title="ลบ"><i data-icon="close" data-size="15"></i></button></td>
    </tr>
  `;
}

function applyMapLinkToSubdistrict(id) {
  if (blockIfReadOnly()) return;
  const entry = trainingPlan.find(p => p.id === id);
  if (!entry || !entry.mapLink) { showToast('กรุณาวางลิงก์ Google Maps ก่อนครับ', 'warn'); return; }
  if (!entry.subdistrict) { showToast('รายการนี้ยังไม่มีข้อมูลตำบลครับ', 'warn'); return; }
  const changed = [];
  trainingPlan.forEach(p => {
    if (p.id !== entry.id && p.province === entry.province && p.district === entry.district && p.subdistrict === entry.subdistrict) {
      p.mapLink = entry.mapLink;
      changed.push(p);
    }
  });
  if (!changed.length) { showToast('ไม่มีคนอื่นในตำบลเดียวกันในแผนตอนนี้', 'info'); return; }
  savePlanToStorage();
  renderPlanTable();
  syncPlanEntriesToSupabase(changed);
  showToast(`ใช้ลิงก์นี้กับอีก ${changed.length} คนในตำบล${entry.subdistrict}แล้ว`, 'success');
}

// ----- เครื่องมือ "ตั้งช่วงวันที่อัตโนมัติ" (แบ่งตามตำบล) ในหน้าแผนอบรม -----
function toggleDateRangeTool(forceShow) {
  const panel = document.getElementById('dateRangeToolPanel');
  if (!panel) return;
  const show = forceShow !== undefined ? forceShow : panel.style.display === 'none';
  panel.style.display = show ? '' : 'none';
  if (show) populateDateRangeToolProvince();
}

function populateDateRangeToolProvince() {
  const sel = document.getElementById('dateRangeToolProvince');
  if (!sel) return;
  const current = sel.value;
  const provinces = [...new Set(trainingPlan.filter(p => !p.visitDate).map(p => p.province).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">เลือกจังหวัด</option>' + provinces.map(p => `<option value="${p}">${p}</option>`).join('');
  sel.value = provinces.includes(current) ? current : '';
  onDateRangeToolProvinceChange();
}

function onDateRangeToolProvinceChange() {
  const provSel = document.getElementById('dateRangeToolProvince');
  const distSel = document.getElementById('dateRangeToolDistrict');
  if (!provSel || !distSel) return;
  const province = provSel.value;
  const currentDistrict = distSel.value;
  const districts = [...new Set(
    trainingPlan.filter(p => !p.visitDate && (!province || p.province === province)).map(p => p.district).filter(Boolean)
  )].sort();
  distSel.innerHTML = '<option value="">เลือกอำเภอ</option>' + districts.map(d => `<option value="${d}">${d}</option>`).join('');
  distSel.value = districts.includes(currentDistrict) ? currentDistrict : '';
  previewDateRangeTool();
}

// รายชื่อเป้าหมาย: อยู่ในแผนแล้ว + ยังไม่มีวันนัด + ตรงจังหวัด/อำเภอที่เลือกในเครื่องมือนี้
function getDateRangeToolTargets() {
  const provSel = document.getElementById('dateRangeToolProvince');
  const distSel = document.getElementById('dateRangeToolDistrict');
  const province = provSel ? provSel.value : '';
  const district = distSel ? distSel.value : '';
  if (!province || !district) return [];
  return trainingPlan.filter(p => !p.visitDate && p.province === province && p.district === district);
}

function previewDateRangeTool() {
  const previewEl = document.getElementById('dateRangeToolPreview');
  if (!previewEl) return;
  const start = document.getElementById('dateRangeToolStart').value;
  const end = document.getElementById('dateRangeToolEnd').value;
  const targets = getDateRangeToolTargets();
  if (!targets.length) {
    previewEl.innerHTML = '<p style="font-size:12.5px; color:var(--muted); margin:10px 0 0;">เลือกจังหวัด/อำเภอที่มีคนยังไม่นัด (อยู่ในแผนแล้ว) ก่อนครับ</p>';
    return;
  }
  if (!start || !end || end < start) {
    previewEl.innerHTML = '<p style="font-size:12.5px; color:var(--muted); margin:10px 0 0;">กรุณาเลือกวันเริ่มและวันสิ้นสุดให้ถูกต้อง (วันสิ้นสุดต้องไม่ก่อนวันเริ่ม)</p>';
    return;
  }
  const subdistricts = [...new Set(targets.map(p => p.subdistrict || 'ไม่ระบุตำบล'))].sort();
  const dateMap = distributeDatesBySubdistrict(subdistricts, start, end);
  const rows = subdistricts.map(sd => {
    const count = targets.filter(p => (p.subdistrict || 'ไม่ระบุตำบล') === sd).length;
    return `<tr><td>${sd}</td><td class="num">${count}</td><td>${formatThaiDate(dateMap.get(sd))}</td></tr>`;
  }).join('');
  previewEl.innerHTML = `
    <table class="summary-table" style="margin-top:10px;">
      <thead><tr><th>ตำบล</th><th class="num">จำนวนคน</th><th>วันที่ได้รับ</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="font-size:12.5px; color:var(--muted); margin-top:6px;">รวม ${targets.length.toLocaleString()} คน ใน ${subdistricts.length} ตำบล ช่วงวันที่ที่เลือกมี ${enumerateDateRange(start, end).length} วัน</p>
  `;
}

function confirmDateRangeTool() {
  if (blockIfReadOnly()) return;
  const start = document.getElementById('dateRangeToolStart').value;
  const end = document.getElementById('dateRangeToolEnd').value;
  const targets = getDateRangeToolTargets();
  if (!targets.length) { showToast('ไม่มีรายชื่อที่ยังไม่นัดในอำเภอที่เลือกครับ', 'warn'); return; }
  if (!start || !end || end < start) { showToast('กรุณาเลือกวันเริ่ม-วันสิ้นสุดให้ถูกต้องครับ', 'warn'); return; }
  const subdistricts = [...new Set(targets.map(p => p.subdistrict || 'ไม่ระบุตำบล'))].sort();
  const dateMap = distributeDatesBySubdistrict(subdistricts, start, end);
  targets.forEach(p => { p.visitDate = dateMap.get(p.subdistrict || 'ไม่ระบุตำบล'); });
  savePlanToStorage();
  renderPlanTable();
  syncPlanEntriesToSupabase(targets);
  showToast(`ตั้งวันที่ให้ ${targets.length.toLocaleString()} คน ใน ${subdistricts.length} ตำบลแล้ว`, 'success');
  toggleDateRangeTool(false);
}

function applyVisitDateToSubdistrict(id) {
  if (blockIfReadOnly()) return;
  const entry = trainingPlan.find(p => p.id === id);
  if (!entry || !entry.visitDate) { showToast('กรุณาเลือกวันที่นัดก่อนครับ', 'warn'); return; }
  if (!entry.subdistrict) { showToast('รายการนี้ยังไม่มีข้อมูลตำบลครับ', 'warn'); return; }
  const changed = [];
  trainingPlan.forEach(p => {
    if (p.id !== entry.id && p.province === entry.province && p.district === entry.district && p.subdistrict === entry.subdistrict) {
      p.visitDate = entry.visitDate;
      changed.push(p);
    }
  });
  if (!changed.length) { showToast('ไม่มีคนอื่นในตำบลเดียวกันในแผนตอนนี้', 'info'); return; }
  savePlanToStorage();
  renderPlanTable();
  syncPlanEntriesToSupabase(changed);
  showToast(`ใช้วันที่นัดนี้กับอีก ${changed.length} คนในตำบล${entry.subdistrict}แล้ว`, 'success');
}

function getFilteredPlan(opts) {
  opts = opts || {};
  const provSel = document.getElementById('planFilterProvince');
  const distSel = document.getElementById('planFilterDistrict');
  const subdistSel = document.getElementById('planFilterSubdistrict');
  const statusSel = document.getElementById('planFilterStatus');
  const scheduledSel = document.getElementById('planFilterScheduled');
  const searchEl = document.getElementById('planFilterSearch');
  const province = provSel ? provSel.value : '';
  const district = distSel ? distSel.value : '';
  const subdistrict = subdistSel ? subdistSel.value : '';
  const status = statusSel ? statusSel.value : '';
  const scheduled = scheduledSel ? scheduledSel.value : '';
  const q = searchEl ? searchEl.value.trim().toLowerCase() : '';
  return trainingPlan.filter(p => {
    if (province && p.province !== province) return false;
    if (district && p.district !== district) return false;
    if (subdistrict && p.subdistrict !== subdistrict) return false;
    if (status && (p.status || 'pending') !== status) return false;
    if (scheduled === 'yes' && !p.visitDate) return false;
    if (scheduled === 'no' && p.visitDate) return false;
    if (!opts.ignoreDateFilter && planCalendarSelectedDate && p.visitDate !== planCalendarSelectedDate) return false;
    if (q) {
      const hay = `${p.name || ''} ${p.nationalId || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

function populatePlanFilterOptions() {
  const provSel = document.getElementById('planFilterProvince');
  const distSel = document.getElementById('planFilterDistrict');
  const subdistSel = document.getElementById('planFilterSubdistrict');
  if (!provSel || !distSel) return;

  const currentProvince = provSel.value;
  const provinces = [...new Set(trainingPlan.map(p => p.province).filter(Boolean))].sort();
  provSel.innerHTML = '<option value="">ทุกจังหวัด</option>' + provinces.map(p => `<option value="${p}">${p}</option>`).join('');
  provSel.value = provinces.includes(currentProvince) ? currentProvince : '';

  const selectedProvince = provSel.value;
  const currentDistrict = distSel.value;
  const districts = [...new Set(
    trainingPlan.filter(p => !selectedProvince || p.province === selectedProvince).map(p => p.district).filter(Boolean)
  )].sort();
  distSel.innerHTML = '<option value="">ทุกอำเภอ</option>' + districts.map(d => `<option value="${d}">${d}</option>`).join('');
  distSel.value = districts.includes(currentDistrict) ? currentDistrict : '';

  if (subdistSel) {
    const selectedDistrict = distSel.value;
    const currentSubdistrict = subdistSel.value;
    const subdistricts = [...new Set(
      trainingPlan
        .filter(p => (!selectedProvince || p.province === selectedProvince) && (!selectedDistrict || p.district === selectedDistrict))
        .map(p => p.subdistrict).filter(Boolean)
    )].sort();
    subdistSel.innerHTML = '<option value="">ทุกตำบล</option>' + subdistricts.map(s => `<option value="${s}">${s}</option>`).join('');
    subdistSel.value = subdistricts.includes(currentSubdistrict) ? currentSubdistrict : '';
  }
}

// ปุ่มลัด "ทั้งหมด / ยังไม่นัด / นัดแล้ว" เหนือตาราง — แค่ตั้งค่า select เดิม (planFilterScheduled) แล้วยิงตัวกรองเหมือนเดิม
// ไม่ต้องแก้ getFilteredPlan/updatePlanField เลย เพราะ select ตัวเดิมยังเป็นตัวจริงที่ getFilteredPlan อ่านค่าอยู่
function setPlanScheduleTab(value) {
  const sel = document.getElementById('planFilterScheduled');
  if (sel) sel.value = value;
  applyPlanFilters();
}

function applyPlanFilters() {
  const tbody = document.getElementById('planTbody');
  if (!tbody) return;
  // จำตำแหน่ง scroll ของกล่องตารางไว้ก่อนเขียนทับแถวทั้งหมด แล้วคืนกลับหลังวาดเสร็จ
  // (ไม่งั้นทุกครั้งที่แก้ dropdown ในแถวใดแถวหนึ่ง ตารางจะเด้งกลับไปบนสุดเพราะ innerHTML ถูกเขียนทับใหม่ทั้งก้อน)
  const scrollBox = document.getElementById('planTableView');
  const prevScrollTop = scrollBox ? scrollBox.scrollTop : 0;
  const filtered = getFilteredPlan();

  if (filtered.length) {
    tbody.innerHTML = filtered.map((p, i) => planRowHtml(p, i)).join('');
  } else if (trainingPlan.length) {
    tbody.innerHTML = `<tr><td colspan="13" class="empty-state-cell"><span class="empty-icon"><i data-icon="search" data-size="15"></i></span><span class="empty-text">ไม่พบรายการที่ตรงกับตัวกรอง<br>ลองปรับตัวกรองดูใหม่นะครับ</span></td></tr>`;
  } else {
    tbody.innerHTML = `<tr><td colspan="13" class="empty-state-cell"><span class="empty-icon"><i data-icon="inbox" data-size="15"></i></span><span class="empty-text">ยังไม่มีรายการในแผนอบรมเลย<br>ไปที่แท็บ <i data-icon="map" data-size="15"></i> แผนที่ เพื่อเพิ่มคนเข้าแผนได้เลยครับ</span></td></tr>`;
  }
  planHighlightEntryId = null; // ใช้ครั้งเดียวจบ ไม่ค้างไฮไลท์ซ้ำในการ render รอบถัดไป
  if (scrollBox) scrollBox.scrollTop = prevScrollTop;

  const countInfo = document.getElementById('planFilterCountInfo');
  if (countInfo) {
    countInfo.textContent = `แสดง ${filtered.length.toLocaleString()} จาก ${trainingPlan.length.toLocaleString()} รายการ`;
  }

  const chip = document.getElementById('planDateFilterChip');
  if (chip) {
    if (planCalendarSelectedDate) {
      chip.style.display = '';
      chip.innerHTML = `<div class="plan-date-chip"><i data-icon="calendar" data-size="15"></i> กรองเฉพาะวันที่ ${formatThaiDate(planCalendarSelectedDate)} <button type="button" onclick="clearPlanDateFilter()"><i data-icon="close" data-size="15"></i> ล้างตัวกรองวันที่</button></div>`;
    } else {
      chip.style.display = 'none';
      chip.innerHTML = '';
    }
  }

  const schedSel = document.getElementById('planFilterScheduled');
  const schedValue = schedSel ? schedSel.value : '';
  const noDateCount = trainingPlan.filter(p => !p.visitDate).length;
  const yesDateCount = trainingPlan.length - noDateCount;
  document.querySelectorAll('#planScheduleTabs .view-toggle-btn[data-schedtab]').forEach(b => {
    b.classList.toggle('active', b.dataset.schedtab === schedValue);
    if (b.dataset.schedtab === '') b.textContent = `ทั้งหมด (${trainingPlan.length.toLocaleString()})`;
    if (b.dataset.schedtab === 'no') b.textContent = `ยังไม่นัด (${noDateCount.toLocaleString()})`;
    if (b.dataset.schedtab === 'yes') b.textContent = `นัดแล้ว (${yesDateCount.toLocaleString()})`;
  });
}

function onPlanFilterProvinceChange() {
  populatePlanFilterOptions();
  applyPlanFilters();
}

function onPlanFilterDistrictChange() {
  populatePlanFilterOptions();
  applyPlanFilters();
}

function renderPlanTable() {
  const tbody = document.getElementById('planTbody');
  if (!tbody) return;
  document.getElementById('planCountBadge').textContent = trainingPlan.length.toLocaleString() + ' รายการ';
  populatePlanFilterOptions();
  applyPlanFilters();
  renderPlanDashboard();
  if (planCurrentView === 'calendar') renderPlanCalendar();
}

window.planSyncDebounceTimers = {};

// ---- ซิงก์แบบเรียลไทม์ (แผนอบรม): เมื่อคนอื่นแก้ไขข้อมูลในตาราง training_plan บน Supabase
// หน้าจอของทุกคนที่เปิดอยู่จะดึงข้อมูลใหม่มาแสดงอัตโนมัติ ไม่ต้องกดรีเฟรช/ซิงก์เอง
window.planRealtimeChannel = null;
window.planRealtimeRefreshTimer = null;

// เช็คว่ากำลังมีคนพิมพ์/แก้ไขช่องข้อมูลอยู่ในตาราง/ปฏิทินแผนอบรมหรือไม่
// ถ้าใช่ ต้องเลื่อนการรีเฟรชออกไปก่อน ไม่งั้นข้อมูลที่กำลังพิมพ์ค้างอยู่จะหายไปทันทีที่รีเฟรช
function isEditingInContainer(containerIds) {
  const active = document.activeElement;
  if (!active) return false;
  const tag = active.tagName;
  if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') return false;
  return containerIds.some(id => {
    const el = document.getElementById(id);
    return el && el.contains(active);
  });
}

function scheduleRealtimePlanRefresh() {
  if (planRealtimeRefreshTimer) clearTimeout(planRealtimeRefreshTimer);
  planRealtimeRefreshTimer = setTimeout(() => {
    planRealtimeRefreshTimer = null;
    if (isEditingInContainer(['planTbody', 'planCalendarView'])) {
      // มีคนกำลังพิมพ์อยู่ในตารางนี้ รอสักครู่แล้วลองใหม่ ไม่ให้ข้อมูลที่พิมพ์ค้างอยู่หาย
      scheduleRealtimePlanRefresh();
      return;
    }
    syncPlanFromSupabase();
  }, 1200);
}

// แจ้งเตือนถ้าเป็นการเปลี่ยนแปลงจาก "คนอื่น" (ไม่ใช่ตัวเอง) เพื่อให้รู้ตัวว่ามีคนแก้ไขข้อมูลชุดเดียวกันอยู่
function notifyRealtimeChange(payload, label) {
  const row = (payload.new && Object.keys(payload.new).length) ? payload.new : payload.old;
  const who = row && row.updated_by;
  if (!who || who === currentUserName) return; // ไม่ต้องแจ้งเตือนการแก้ไขของตัวเอง
  const action = payload.eventType === 'DELETE' ? 'ลบรายการ' : (payload.eventType === 'INSERT' ? 'เพิ่มรายการใหม่' : 'แก้ไขรายการ');
  showToast(`${who} ${action}ใน${label}`, 'info');
}

function setupPlanRealtimeSync() {
  if (!supabaseClient || planRealtimeChannel) return;
  planRealtimeChannel = supabaseClient
    .channel('training_plan_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'training_plan' }, (payload) => {
      notifyRealtimeChange(payload, 'แผนอบรม');
      scheduleRealtimePlanRefresh();
    })
    .subscribe();
}

function schedulePlanEntrySync(entry, immediate) {
  const key = entry.id;
  if (planSyncDebounceTimers[key]) clearTimeout(planSyncDebounceTimers[key]);
  if (immediate) {
    syncPlanEntriesToSupabase([entry]);
    return;
  }
  // debounce ช่องข้อความ (หมายเหตุ/ลิงก์แผนที่) ไม่ให้ยิงซิงก์ทุกตัวอักษรที่พิมพ์
  planSyncDebounceTimers[key] = setTimeout(() => {
    syncPlanEntriesToSupabase([entry]);
    delete planSyncDebounceTimers[key];
  }, 800);
}

function updatePlanField(id, field, value) {
  if (blockIfReadOnly()) return;
  const entry = trainingPlan.find(p => p.id === id);
  if (!entry) return;
  entry[field] = value;
  savePlanToStorage();
  if (field === 'status' || field === 'visitDate') {
    // สถานะเปลี่ยนอาจทำให้แถวนี้หลุดจากตัวกรองที่เลือกอยู่ และวันที่นัดเปลี่ยนต้องอัปเดตเครื่องหมาย /− ในแถวทันที
    applyPlanFilters();
  }
  renderPlanDashboard();
  schedulePlanEntrySync(entry, field === 'visitDate' || field === 'status');
}

async function removePlanEntry(id) {
  if (blockIfReadOnly()) return;
  const entry = trainingPlan.find(p => p.id === id);
  if (entry && entry.visitDate && entry.visitDate >= todayDateStr()) {
    const confirmed = await showConfirmModal(`${entry.name || 'คนนี้'} มีนัดอบรมวันที่ ${formatThaiDate(entry.visitDate)} อยู่ ต้องการลบออกจากแผนหรือไม่?`);
    if (!confirmed) return;
  }
  trainingPlan = trainingPlan.filter(p => p.id !== id);
  savePlanToStorage();
  renderPlanTable();
  refreshPeoplePanel();
  deletePlanEntryFromSupabase(id);
}

// ยกเลิกการเพิ่มคนเข้าแผนอบรม โดยหาแถวแผนจากเลขบัตรประชาชน (ใช้จากปุ่ม "ยกเลิก" ในพาแนลเลือกคน)
async function removePersonFromPlanByNid(nationalId) {
  if (blockIfReadOnly()) return;
  const entry = trainingPlan.find(e => e.nationalId === nationalId);
  if (!entry) return;
  await removePlanEntry(entry.id);
}

async function clearPlan() {
  if (blockIfReadOnly()) return;
  if (!trainingPlan.length) return;
  const confirmed = await showConfirmModal('ต้องการล้างรายการแผนอบรมทั้งหมดหรือไม่? ข้อมูลจะหายจากเบราว์เซอร์นี้ทันที');
  if (!confirmed) return;
  const idsToDelete = trainingPlan.map(p => p.id);
  trainingPlan = [];
  savePlanToStorage();
  renderPlanTable();
  if (currentPeoplePanelProvince && currentPeoplePanelDistrict) {
    showDistrictPeople(currentPeoplePanelProvince, currentPeoplePanelDistrict);
  }
  deleteAllPlanEntriesFromSupabase(idsToDelete);
  showToast('ล้างรายการแผนอบรมทั้งหมดแล้ว', 'success');
}

// จัดความกว้างคอลัมน์ Excel ให้พอดีกับความยาวข้อมูลจริงในแต่ละคอลัมน์อัตโนมัติ (ผู้ใช้ไม่ต้องมาลาก/ดับเบิลคลิกขยายเอง)
// และเปิดปุ่มกรอง/เรียงข้อมูล (autofilter) ที่หัวตาราง ให้กดเรียงหรือกรองข้อมูลในเอ็กเซลได้เลยทันทีที่เปิดไฟล์
function prettifyExcelSheet(ws, data) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  ws['!cols'] = headers.map(h => {
    const maxLen = Math.max(h.length, ...data.map(row => String(row[h] ?? '').length));
    return { wch: Math.min(Math.max(maxLen + 3, 10), 45) };
  });
  ws['!autofilter'] = { ref: ws['!ref'] };
}

function exportPlanExcel() {
  const sortedPlan = trainingPlan
    .filter(p => p.visitDate)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  if (!sortedPlan.length) { showToast('ยังไม่มีรายการที่ตั้งวันที่นัดเลยครับ ลองตั้งวันที่ก่อนแล้วค่อยส่งออกอีกครั้ง', 'warn'); return; }
  const data = sortedPlan.map((p, i) => ({
    'ลำดับ': i + 1,
    'วันที่นัด': p.visitDate || '',
    'สถานะ': PLAN_STATUS_LABELS[p.status || 'pending'],
    'ชื่อ-นามสกุล': p.name || '',
    'เลขบัตรประชาชน': p.nationalId || '',
    'เบอร์ติดต่อ': p.phone || '',
    'จังหวัด': p.province,
    'อำเภอ': p.district || '',
    'ตำบล': p.subdistrict || '',
    'ตำแหน่ง (Google Maps)': p.mapLink || '',
    'หมายเหตุ': p.note || '',
    'SN ตู้ (สแกน)': p.scannedSn || '',
    'เลขฐาน (AR)': p.baseCode || ''
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  prettifyExcelSheet(ws, data);

  // ทำให้คอลัมน์ "ตำแหน่ง (Google Maps)" กดเปิดได้จริงใน Excel (ไม่ใช่แค่ข้อความเฉยๆ)
  const mapLinkColIndex = 9; // ลำดับ(0) วันที่นัด(1) สถานะ(2) ชื่อ(3) เลขบัตร(4) เบอร์(5) จังหวัด(6) อำเภอ(7) ตำบล(8) ตำแหน่ง(9)
  sortedPlan.forEach((p, i) => {
    if (p.mapLink) {
      const cellRef = XLSX.utils.encode_cell({ r: i + 1, c: mapLinkColIndex }); // +1 เพราะแถวแรกเป็นหัวตาราง
      if (ws[cellRef]) {
        ws[cellRef].l = { Target: p.mapLink, Tooltip: 'เปิดใน Google Maps' };
      }
    }
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'แผนอบรม');
  XLSX.writeFile(wb, 'แผนอบรมรายสัปดาห์.xlsx');
}

// ----- ส่งออกรายงาน PDF (เทมเพลตสวยๆ พร้อมโลโก้ + แดชบอร์ดสรุป เฉพาะคนที่ตั้งวันที่นัดแล้ว) -----
window.PDF_LOGO_DATA_URI = 'data:image/png;base64,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';

function buildPlanPdfHtml(dated) {
  const total = dated.length;
  const doneCount = dated.filter(p => p.status === 'done').length;
  const cancelledCount = dated.filter(p => p.status === 'cancelled').length;
  const pendingCount = total - doneCount - cancelledCount;

  const groups = groupByDate(dated).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  groups.forEach(g => g.items.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));

  const sortedDates = groups.map(g => g.date);
  const rangeLabel = sortedDates.length === 0
    ? ''
    : sortedDates.length === 1
      ? formatThaiDate(sortedDates[0])
      : `${formatThaiDateShort(sortedDates[0])} – ${formatThaiDate(sortedDates[sortedDates.length - 1])}`;

  const generatedAt = new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

  const kpiHtml = `
    <div class="pdf-kpi-grid">
      <div class="pdf-kpi-card"><div class="pdf-kpi-num">${total}</div><div class="pdf-kpi-label">คนที่นัดแล้ว</div></div>
      <div class="pdf-kpi-card"><div class="pdf-kpi-num">${groups.length}</div><div class="pdf-kpi-label">วันที่นัดหมาย</div></div>
      <div class="pdf-kpi-card done"><div class="pdf-kpi-num">${doneCount}</div><div class="pdf-kpi-label">ไปแล้ว</div></div>
      <div class="pdf-kpi-card pending"><div class="pdf-kpi-num">${pendingCount}</div><div class="pdf-kpi-label">ยังไม่ไป</div></div>
      <div class="pdf-kpi-card cancelled"><div class="pdf-kpi-num">${cancelledCount}</div><div class="pdf-kpi-label">ยกเลิก</div></div>
    </div>
  `;

  const groupsHtml = groups.map(g => `
    <div class="pdf-date-section">
      <div class="pdf-date-heading">
        <span><i data-icon="calendar" data-size="15"></i> ${formatThaiDate(g.date)}</span>
        <span class="pdf-date-count">${g.items.length} คน</span>
      </div>
      <table class="pdf-table">
        <colgroup>
          <col style="width:4%;"><col style="width:15%;"><col style="width:13%;"><col style="width:10%;">
          <col style="width:20%;"><col style="width:9%;"><col style="width:9%;"><col style="width:20%;">
        </colgroup>
        <thead>
          <tr><th>#</th><th>ชื่อ-นามสกุล</th><th>เลขบัตรประชาชน</th><th>เบอร์ติดต่อ</th><th>พื้นที่ (จังหวัด/อำเภอ/ตำบล)</th><th>พิกัด</th><th>สถานะ</th><th>หมายเหตุ</th></tr>
        </thead>
        <tbody>
          ${g.items.map((p, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${p.name || '-'}</td>
              <td>${p.nationalId || '-'}</td>
              <td>${p.phone || '-'}</td>
              <td>${p.province || '-'} / ${p.district || '-'} / ${p.subdistrict || '-'}</td>
              <td class="pdf-loc-cell">${p.mapLink ? '<span class="pdf-loc-badge has-loc">มีพิกัด</span>' : '<span class="pdf-loc-badge no-loc">-</span>'}</td>
              <td><span class="pdf-status-badge status-${p.status || 'pending'}">${PLAN_STATUS_LABELS[p.status || 'pending']}</span></td>
              <td>${p.note || '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `).join('');

  return `
    <div class="pdf-header">
      <img src="${PDF_LOGO_DATA_URI}" class="pdf-logo" alt="Kasetkorn">
      <div class="pdf-header-text">
        <h1>รายงานแผนอบรมเกษตรกร</h1>
        <div class="pdf-header-sub">ช่วงวันที่นัด: ${rangeLabel}</div>
      </div>
      <div class="pdf-header-meta">พิมพ์เมื่อ<br>${generatedAt}</div>
    </div>
    ${kpiHtml}
    ${groupsHtml}
    <div class="pdf-footer">สร้างโดย Dashboard เกษตรกร — สถานะอบรม (OTOD)</div>
  `;
}

// สลับหน้ากระดาษเป็นแนวนอน (landscape) เฉพาะตอนพิมพ์รายงานที่ต้องการเท่านั้น โดยไม่แตะ @page เริ่มต้น (แนวตั้ง)
// ที่ยังใช้กับรายงานอื่น (เช่น สรุปจำนวนตู้ตามทีม/จังหวัด ซึ่งเป็นตารางเล็ก แนวตั้งอ่านง่ายกว่าอยู่แล้ว)
// วิธีนี้แทรก <style> เพิ่มเข้าไปทับกฎ @page เดิมชั่วคราว แล้วลบ/ล้างทิ้งหลังพิมพ์เสร็จ (ผูกกับ afterprint เดียวกับที่ลบรายงานออก)
function enableLandscapePrint() {
  let styleEl = document.getElementById('pdfLandscapeOverrideStyle');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'pdfLandscapeOverrideStyle';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = '@media print { @page { size: A4 landscape; } }';
}

function disableLandscapePrint() {
  const styleEl = document.getElementById('pdfLandscapeOverrideStyle');
  if (styleEl) styleEl.textContent = '';
}

function exportPlanPdf() {
  const dated = trainingPlan.filter(p => p.visitDate);
  if (!dated.length) { showToast('ยังไม่มีรายการที่ตั้งวันที่นัดเลยครับ ลองตั้งวันที่ก่อนแล้วค่อยส่งออกรายงาน', 'warn'); return; }

  // หมายเหตุ: เดิมใช้ html2canvas/html2pdf ถ่ายภาพ DOM มาทำ PDF แต่ html2canvas มีบั๊กเก่าแก่ที่ยังไม่ถูกแก้
  // เรื่องการวางตำแหน่งสระ/วรรณยุกต์ภาษาไทย (ทำให้ตัวอักษรเพี้ยน) เพราะมันวาดตัวอักษรเองแบบ manual แทนที่จะ
  // ให้เบราว์เซอร์จัดเรียงให้ ("Thai vowel and tone marker has offset" - รายงานปัญหานี้ใน html2canvas มานานหลายปี)
  // แก้โดยเปลี่ยนมาใช้ระบบพิมพ์ (print) ของเบราว์เซอร์เองแทน — เปิดหน้าต่างพิมพ์ที่โชว์เฉพาะรายงาน แล้วผู้ใช้เลือก
  // "บันทึกเป็น PDF" จากตัวเลือกเครื่องพิมพ์ วิธีนี้ใช้เอนจินจัดเรียงตัวอักษรจริงของเบราว์เซอร์ (เหมือนที่แสดงผลถูกต้อง
  // อยู่แล้วบนหน้าเว็บ) จึงไม่เพี้ยน แถมได้ตัวอักษรจริงที่เลือก/คัดลอกได้ในไฟล์ PDF ด้วย (ไม่ใช่แค่รูปภาพ)
  const root = document.createElement('div');
  root.className = 'pdf-report';
  root.innerHTML = buildPlanPdfHtml(dated);
  document.body.appendChild(root);
  enableLandscapePrint();

  const cleanup = () => {
    window.removeEventListener('afterprint', cleanup);
    if (root.parentNode) document.body.removeChild(root);
    disableLandscapePrint();
  };
  window.addEventListener('afterprint', cleanup);

  showToast('เปิดหน้าต่างพิมพ์รายงานแล้ว — เลือก "บันทึกเป็น PDF" จากตัวเลือกเครื่องพิมพ์ได้เลยครับ', 'info');

  // หน่วงเฟรมเดียวให้เบราว์เซอร์ layout เนื้อหาที่เพิ่งแทรกก่อน แล้วค่อยเปิดหน้าต่างพิมพ์
  requestAnimationFrame(() => {
    window.print();
  });
}
// ----- สลับมุมมองตาราง/ปฏิทิน + ปฏิทินรายเดือน -----
function filterPlanByScheduled(value) {
  switchPlanView('table');
  const sel = document.getElementById('planFilterScheduled');
  if (sel) sel.value = value;
  applyPlanFilters();
  const tableSection = document.getElementById('planTableView');
  if (tableSection) tableSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function switchPlanView(view) {
  planCurrentView = view;
  document.querySelectorAll('#tab-plan .view-toggle-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
  });
  const tableView = document.getElementById('planTableView');
  const calendarView = document.getElementById('planCalendarView');
  if (tableView) tableView.style.display = view === 'table' ? '' : 'none';
  if (calendarView) calendarView.style.display = view === 'calendar' ? '' : 'none';
  if (view === 'calendar') {
    renderPlanCalendar();
  } else {
    applyPlanFilters();
  }
}

function changePlanCalendarMonth(delta) {
  if (!planCalendarMonth) {
    const now = new Date();
    planCalendarMonth = { year: now.getFullYear(), month: now.getMonth() };
  }
  planCalendarMonth.month += delta;
  if (planCalendarMonth.month < 0) { planCalendarMonth.month = 11; planCalendarMonth.year--; }
  if (planCalendarMonth.month > 11) { planCalendarMonth.month = 0; planCalendarMonth.year++; }
  renderPlanCalendar();
}

function goToCurrentPlanCalendarMonth() {
  planCalendarMonth = null;
  renderPlanCalendar();
}

function selectPlanCalendarDate(dateStr) {
  planCalendarSelectedDate = (planCalendarSelectedDate === dateStr) ? null : dateStr;
  switchPlanView('table');
}

function clearPlanDateFilter() {
  planCalendarSelectedDate = null;
  applyPlanFilters();
  if (planCurrentView === 'calendar') renderPlanCalendar();
}

window.PLAN_THAI_MONTH_NAMES = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
window.PLAN_THAI_DOW_SHORT = ['อา','จ','อ','พ','พฤ','ศ','ส'];

function renderPlanCalendar() {
  const container = document.getElementById('planCalendarView');
  if (!container) return;
  if (!planCalendarMonth) {
    const now = new Date();
    planCalendarMonth = { year: now.getFullYear(), month: now.getMonth() };
  }
  const { year, month } = planCalendarMonth;
  const today = todayDateStr();

  // ใช้ trainingPlan ทั้งหมดเสมอ (ไม่ใช้ getFilteredPlan) เพราะปฏิทินควรโชว์ภาพรวมทั้งแผน
  // ไม่ใช่แค่ส่วนที่ตรงกับตัวกรองค้นหา/สถานะที่ตั้งไว้ในมุมมองตาราง (จุดที่เคยเป็นบั๊ก)
  const scoped = trainingPlan;
  const countByDate = {};
  const cancelledByDate = {};
  scoped.forEach(p => {
    if (!p.visitDate) return;
    countByDate[p.visitDate] = (countByDate[p.visitDate] || 0) + 1;
    if (p.status === 'cancelled') cancelledByDate[p.visitDate] = (cancelledByDate[p.visitDate] || 0) + 1;
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
    const isSelected = dateStr === planCalendarSelectedDate;
    cells += `
      <div class="plan-calendar-day ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}" onclick="selectPlanCalendarDate('${dateStr}')">
        <span class="day-num">${d}</span>
        ${count ? `<span class="day-badge ${allCancelled ? 'has-cancelled' : ''}">${count} คน</span>` : ''}
      </div>
    `;
  }

  container.innerHTML = `
    <div class="plan-calendar-header">
      <h3>${PLAN_THAI_MONTH_NAMES[month]} ${year + 543}</h3>
      <div class="plan-calendar-nav">
        <button type="button" onclick="changePlanCalendarMonth(-1)">← เดือนก่อน</button>
        <button type="button" onclick="goToCurrentPlanCalendarMonth()">วันนี้</button>
        <button type="button" onclick="changePlanCalendarMonth(1)">เดือนถัดไป →</button>
      </div>
    </div>
    <div class="plan-calendar-grid">
      ${PLAN_THAI_DOW_SHORT.map(d => `<div class="plan-calendar-dow">${d}</div>`).join('')}
      ${cells}
    </div>
  `;
}

// ----- จัดเรียงลำดับเส้นทางอัตโนมัติ (ใช้พิกัด centroid จาก GeoJSON ที่แผนที่โหลดไว้แล้ว) -----
function getDistrictCentroid(province, district) {
  if (!geoDistricts || !geoProvinces) return null;
  const proCode = provinceNameToCode[normName(province)];
  if (proCode === undefined) return null;
  const feature = geoDistricts.features.find(f =>
    f.properties.pro_code === proCode && normName(f.properties.amp_th) === normName(district)
  );
  if (!feature) return null;
  try {
    return d3.geoCentroid(feature); // [lon, lat]
  } catch (e) {
    return null;
  }
}

function haversineDistanceKm(a, b) {
  const toRad = x => (x * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, h)));
}

async function optimizePlanRoute() {
  if (blockIfReadOnly()) return;
  const scoped = getFilteredPlan(); // จัดเรียงเฉพาะรายการที่กำลังกรอง/มองเห็นอยู่ตอนนี้
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

  // Greedy nearest-neighbor: เริ่มจากรายการแรกในลำดับปัจจุบัน แล้วเลือกจุดที่ใกล้ที่สุดถัดไปเรื่อยๆ
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

  // กำหนด sortOrder ใหม่ตามลำดับเส้นทางที่คำนวณได้ (รายการที่หาพิกัดไม่เจอจัดไว้ท้ายสุด)
  let order = 0;
  ordered.forEach(item => { item.entry.sortOrder = order++; });
  withoutCoord.forEach(p => { p.sortOrder = order++; });

  savePlanToStorage();
  renderPlanTable();
  if (planCurrentView === 'calendar') renderPlanCalendar();
  syncPlanEntriesToSupabase([...ordered.map(item => item.entry), ...withoutCoord]);

  const msg = withoutCoord.length
    ? `จัดเรียงลำดับเสร็จแล้ว (${withCoord.length} รายการ) — หาพิกัดไม่เจอ ${withoutCoord.length} รายการ เลยจัดไว้ท้ายสุด`
    : `จัดเรียงลำดับเส้นทางเสร็จแล้ว (${ordered.length} รายการ) ตามความใกล้ของพื้นที่`;
  showToast(msg, withoutCoord.length ? 'warn' : 'success');
}

// ----- แดชบอร์ดสรุปแผนอบรม (ย้อนหลัง/กำลังจะมาถึง) -----
function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayDateStr() {
  return toDateStr(new Date());
}

function formatDateTimeThai(iso) {
  if (!iso) return '';
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return '';
  return dt.toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatRelativeTime(iso) {
  if (!iso) return '';
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return '';
  const diffMin = Math.round((Date.now() - dt.getTime()) / 60000);
  if (diffMin < 1) return 'เมื่อสักครู่';
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} ชม.ที่แล้ว`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay} วันที่แล้ว`;
  return formatDateTimeThai(iso);
}

// แจ้งเตือนสรุปนัดหมายวันนี้/พรุ่งนี้ทันทีหลังล็อกอิน ไม่ต้องเข้าไปเช็คปฏิทินเอง
function showAppointmentReminder() {
  const todayStr = todayDateStr();
  const tomorrowStr = addDaysToDateStr(todayStr, 1);

  const trainToday = trainingPlan.filter(p => p.visitDate === todayStr).length;
  const trainTomorrow = trainingPlan.filter(p => p.visitDate === tomorrowStr).length;
  const iotToday = iotInstallPlan.filter(p => p.installDate === todayStr).length;
  const iotTomorrow = iotInstallPlan.filter(p => p.installDate === tomorrowStr).length;

  const parts = [];
  if (trainToday) parts.push(`อบรมวันนี้ ${trainToday} ราย`);
  if (iotToday) parts.push(`ติดตั้ง IoT วันนี้ ${iotToday} ราย`);
  if (trainTomorrow) parts.push(`อบรมพรุ่งนี้ ${trainTomorrow} ราย`);
  if (iotTomorrow) parts.push(`ติดตั้ง IoT พรุ่งนี้ ${iotTomorrow} ราย`);

  if (parts.length) {
    showToast('นัดหมาย: '+ parts.join('· '), 'info', 8000);
  }
}

function addDaysToDateStr(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return toDateStr(dt);
}

function formatThaiDate(dateStr, today) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const label = dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', weekday: 'short' });
  return dateStr === (today || todayDateStr()) ? label + ' (วันนี้)' : label;
}

function formatThaiDateShort(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

function groupByDate(entries, field) {
  field = field || 'visitDate';
  const map = new Map();
  entries.forEach(p => {
    const key = p[field];
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  });
  return [...map.entries()].map(([date, items]) => ({ date, items }));
}

function setPlanLookback(days) {
  planLookbackDays = days;
  renderPlanDashboard();
}

function renderPlanTimelineList(containerId, groups, emptyLabel, today, opts) {
  opts = opts || {};
  const dateFormatter = opts.dateFormatter || ((d) => formatThaiDate(d, today));
  const isCurrentFn = opts.isCurrentFn || ((d) => d === today);
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!groups.length) {
    el.innerHTML = `<div class="plan-timeline-empty">${emptyLabel}</div>`;
    return;
  }
  el.innerHTML = groups.map(g => `
    <div class="plan-day-group">
      <div class="plan-day-header ${isCurrentFn(g.date) ? 'is-today' : ''}">
        <span>${dateFormatter(g.date)}</span>
        <span class="badge">${g.items.length} คน</span>
      </div>
      <div class="plan-day-people">
        ${g.items.map(p => `
          <div class="plan-day-person">
            <span>${p.name || '-'}</span>
            <span class="plan-day-person-loc">${p.province}${p.district ? ' / ' + p.district : ''}${p.subdistrict ? ' / ' + p.subdistrict : ''}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function renderPlanTimelineChart(countByDate, today, rangeStart, rangeEnd) {
  const canvas = document.getElementById('planTimelineChart');
  if (!canvas || typeof Chart === 'undefined') return;

  const labels = [];
  const data = [];
  const colors = [];
  let cursor = rangeStart;
  while (cursor <= rangeEnd) {
    labels.push(formatThaiDateShort(cursor));
    data.push(countByDate[cursor] || 0);
    colors.push(cursor === today ? '#3ba68a' : (cursor < today ? '#e0483e' : '#4a90d9'));
    cursor = addDaysToDateStr(cursor, 1);
  }

  if (planTimelineChart) planTimelineChart.destroy();
  planTimelineChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: { labels, datasets: [{ label: 'จำนวนคนที่นัดอบรม', data, backgroundColor: colors, borderRadius: 5, maxBarThickness: 26 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: chartTone().tip, padding: 11, cornerRadius: 9,
          titleFont: { family: 'Sarabun', size: 12.5 }, bodyFont: { family: 'Sarabun', size: 12.5 }
        }
      },
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
          ticks: { precision: 0, font: { family: 'Sarabun', size: 12 }, color: chartTone().muted, padding: 8 }
        }
      }
    }
  });
}

function renderPlanDashboard() {
  const badge = document.getElementById('planKpiToday');
  if (!badge) return; // แท็บ/องค์ประกอบยังไม่ถูกโหลด

  const today = todayDateStr();
  const withDate = trainingPlan.filter(p => p.visitDate);
  const noDateCount = trainingPlan.length - withDate.length;

  const todayEntries = withDate.filter(p => p.visitDate === today);
  const pastStart = addDaysToDateStr(today, -planLookbackDays);
  const pastEntries = withDate
    .filter(p => p.visitDate < today && p.visitDate >= pastStart)
    .sort((a, b) => b.visitDate.localeCompare(a.visitDate));
  const upcomingEntries = withDate
    .filter(p => p.visitDate > today)
    .sort((a, b) => a.visitDate.localeCompare(b.visitDate));

  document.getElementById('planKpiToday').textContent = todayEntries.length;
  document.getElementById('planKpiTodayDate').textContent = formatThaiDate(today, today);
  document.getElementById('planKpiPast').textContent = pastEntries.length;
  document.getElementById('planKpiPastRange').textContent = `ย้อนหลัง ${planLookbackDays} วัน`;
  document.getElementById('planKpiUpcoming').textContent = upcomingEntries.length;
  document.getElementById('planKpiNoDate').textContent = noDateCount;

  document.querySelectorAll('#tab-dashboard .range-btn').forEach(b => {
    b.classList.toggle('active', Number(b.dataset.range) === planLookbackDays);
  });

  const total = trainingPlan.length;
  const doneCount = trainingPlan.filter(p => p.status === 'done').length;
  const cancelledCount = trainingPlan.filter(p => p.status === 'cancelled').length;
  const pendingCount = total - doneCount - cancelledCount;
  const donePct = total ? Math.round((doneCount / total) * 100) : 0;
  const cancelledPct = total ? Math.round((cancelledCount / total) * 100) : 0;
  document.getElementById('planProgressText').textContent = donePct + '%';
  document.getElementById('planProgressDone').style.width = donePct + '%';
  document.getElementById('planProgressCancelled').style.width = cancelledPct + '%';
  document.getElementById('planProgressDoneCount').textContent = doneCount.toLocaleString();
  document.getElementById('planProgressPendingCount').textContent = pendingCount.toLocaleString();
  document.getElementById('planProgressCancelledCount').textContent = cancelledCount.toLocaleString();

  renderPlanTimelineList('planPastList', groupByDate(pastEntries), 'ไม่มีรายการย้อนหลังในช่วงที่เลือก', today);
  renderPlanTimelineList('planUpcomingList', groupByDate([...todayEntries, ...upcomingEntries]), 'ยังไม่มีรายการที่กำลังจะมาถึง', today);

  const countByDate = {};
  withDate.forEach(p => { countByDate[p.visitDate] = (countByDate[p.visitDate] || 0) + 1; });
  renderPlanTimelineChart(countByDate, today, pastStart, addDaysToDateStr(today, 7));
}


// ================================================================
// แผนติดตั้ง IoT (mirror ของแผนอบรม แต่ไม่มีปุ่ม "ใช้ทั้งตำบล" เพราะแต่ละพื้นที่ติดตั้งไม่เหมือนกัน)
// ================================================================

function loadIotPlanFromStorage() {
  try {
    const raw = localStorage.getItem(IOT_PLAN_STORAGE_KEY);
    iotInstallPlan = raw ? JSON.parse(raw) : [];
  } catch (e) {
    iotInstallPlan = [];
  }
  let migrated = false;
  iotInstallPlan.forEach((p, idx) => {
    if (p.sortOrder === undefined) { migrated = true; p.sortOrder = idx; }
    if (p.status === undefined) { migrated = true; p.status = 'pending'; }
    if (p.installTime === undefined) { migrated = true; p.installTime = ''; }
    if (p.boxType === undefined) { migrated = true; p.boxType = ''; }
    if (p.installTeam === undefined) { migrated = true; p.installTeam = ''; }
    if (p.planFinalized === undefined) { migrated = true; p.planFinalized = false; }
    if (p.valveSize === undefined) { migrated = true; p.valveSize = ''; }
    if (p.waterSource === undefined) { migrated = true; p.waterSource = ''; }
    if (p.irrigationType === undefined) { migrated = true; p.irrigationType = ''; }
    if (p.scannedSn === undefined) { migrated = true; p.scannedSn = ''; }
    if (p.baseCode === undefined) { migrated = true; p.baseCode = ''; }
    if (p.paymentAmount === undefined) { migrated = true; p.paymentAmount = ''; }
  });
  if (migrated) saveIotPlanToStorage();
}

// expose ฟังก์ชันของโมดูลนี้ให้ inline handlers และโมดูลอื่นเรียกผ่าน window ได้
Object.assign(window, {
  savePlanToStorage, backfillPlanSubdistricts, planEntryToSupabaseRow, syncPlanEntriesToSupabase, deletePlanEntryFromSupabase, deleteAllPlanEntriesFromSupabase,
  syncPlanFromSupabase, enumerateDateRange, distributeDatesBySubdistrict, applyPrescheduleDateIfActive, toggleMapPreschedule, updateMapPrescheduleRange,
  addPersonToPlan, addPersonToPlanByNid, addAllUntrainedToPlanFor, addAllDistrictUntrainedToPlan, addSelectedPeopleToPlan, toggleSelectAllPeople,
  planRowHtml, applyMapLinkToSubdistrict, toggleDateRangeTool, populateDateRangeToolProvince, onDateRangeToolProvinceChange, getDateRangeToolTargets,
  previewDateRangeTool, confirmDateRangeTool, applyVisitDateToSubdistrict, getFilteredPlan, populatePlanFilterOptions, setPlanScheduleTab,
  applyPlanFilters, onPlanFilterProvinceChange, onPlanFilterDistrictChange, renderPlanTable, isEditingInContainer, scheduleRealtimePlanRefresh,
  notifyRealtimeChange, setupPlanRealtimeSync, schedulePlanEntrySync, updatePlanField, removePlanEntry, removePersonFromPlanByNid,
  clearPlan, prettifyExcelSheet, exportPlanExcel, buildPlanPdfHtml, enableLandscapePrint, disableLandscapePrint,
  exportPlanPdf, filterPlanByScheduled, switchPlanView, changePlanCalendarMonth, goToCurrentPlanCalendarMonth, selectPlanCalendarDate,
  clearPlanDateFilter, renderPlanCalendar, getDistrictCentroid, haversineDistanceKm, optimizePlanRoute, toDateStr,
  todayDateStr, formatDateTimeThai, formatRelativeTime, showAppointmentReminder, addDaysToDateStr, formatThaiDate,
  formatThaiDateShort, groupByDate, setPlanLookback, renderPlanTimelineList, renderPlanTimelineChart, renderPlanDashboard,
  loadIotPlanFromStorage,
});
