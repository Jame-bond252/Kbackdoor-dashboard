// ===== โหมดกรอกรายละเอียดบนหน้าแผนที่ (กดชื่อคนเพื่อกาง/พับ + เพิ่มเข้าแผน) =====
// แยกมาจาก main.js เดิม — ตัวแปร/ฟังก์ชันแชร์ผ่าน window (โค้ดเดิมออกแบบเป็น global scope)


// วาดเนื้อหาในกล่องรายละเอียดของคนนี้ใหม่ (ใช้ตอนเปลี่ยน "รูปแบบตู้" เพื่อสลับช่องการชำระเงิน/ยอดชำระ)
function renderIotMapDetailEditor(nid) {
  const body = document.getElementById('iotMapDetailBody_' + nid);
  if (body) body.innerHTML = iotMapDetailEditorInner(nid);
}

// wrapper: แก้ค่าจากหน้าแผนที่ แล้ววาดกล่องรายละเอียดใหม่เฉพาะเมื่อจำเป็น (เช่นเปลี่ยนตู้)
function updateIotPlanFieldFromMap(id, field, value, nid) {
  updateIotPlanField(id, field, value);
  if (field === 'boxType') renderIotMapDetailEditor(nid);
}

// เพิ่มคนเข้าแผนแล้วกางกล่องรายละเอียดให้เลย (กรอกต่อได้ทันทีตอนโทร)
function addPersonToIotPlanByNidAndExpand(nid) {
  if (blockIfReadOnly()) return;
  iotMapExpandedNids.add(nid);
  addPersonToIotPlanByNid(nid); // ฟังก์ชันนี้จะ refresh พาแนลให้ แล้วกล่องจะกางค้างเพราะ nid อยู่ใน Set แล้ว
}

// เนื้อหาในกล่องรายละเอียด: ถ้ายังไม่อยู่ในแผน -> ปุ่มเพิ่มเข้าแผน / ถ้าอยู่ในแผนแล้ว -> ฟอร์มกรอกรายละเอียด
function iotMapDetailEditorInner(nid) {
  const p = allIotRows.find(r => r.national_id === nid);
  const entry = iotInstallPlan.find(e => e.nationalId === nid);
  const nidSafe = (nid || '').replace(/'/g, "\\'");

  // ข้อมูลอ้างอิงจาก OTOD (อ่านอย่างเดียว) ให้แอดมินดูตอนโทร
  const ctx = p ? `
    <div class="iot-map-detail-ctx">
      <span><b>สถานะติดตั้ง (OTOD):</b> ${getIotStatusDisplayHtml(p)}</span>
      <span><b>โครงการ:</b> ${p[IOT_FIELDS.project] || '-'}</span>
      <span><b>รอบการอนุมัติ:</b> ${p.approval_round || '-'}</span>
      <span><b>SN ตู้:</b> ${getIotSnCellHtml(p)}</span>
      <span><b>เลข AR:</b> ${getIotArCodeDisplay(p) || '-'}</span>
    </div>` : '';

  if (!entry) {
    return `${ctx}<div class="iot-map-detail-empty">ยังไม่อยู่ในแผนติดตั้ง — <button type="button" class="btn btn-brand btn-xs" onclick="addPersonToIotPlanByNidAndExpand('${nidSafe}')"><i data-icon="plus" data-size="15"></i> เพิ่มเข้าแผนติดตั้ง แล้วกรอกรายละเอียด</button></div>`;
  }

  const eid = entry.id;
  const planMonth = getIotMonthYearFromDate(entry.installDate);
  const planWeek = getIotWeekOfMonthFromDate(entry.installDate);
  const status = entry.status || 'pending';
  const opt = (cat, cur) => getIotDropdownOptions(cat).map(t => `<option value="${t}" ${cur === t ? 'selected' : ''}>${t}</option>`).join('');
  const amountVal = (entry.paymentAmount === '' || entry.paymentAmount === undefined || entry.paymentAmount === null) ? '' : String(entry.paymentAmount).replace(/"/g,'&quot;');

  return `${ctx}
    <div class="iot-map-detail-grid">
      <label>นัดหมาย (เดือน)
        <select onchange="updateIotPlanMonthWeek('${eid}','month',this.value)">${getIotMonthOptionsHtml(planMonth)}</select>
      </label>
      <label>นัดหมาย (สัปดาห์)
        <select onchange="updateIotPlanMonthWeek('${eid}','week',this.value)">
          <option value="">- สัปดาห์ -</option>
          <option value="1" ${planWeek==='1'?'selected':''}>สัปดาห์ที่ 1 (1-7)</option>
          <option value="2" ${planWeek==='2'?'selected':''}>สัปดาห์ที่ 2 (8-14)</option>
          <option value="3" ${planWeek==='3'?'selected':''}>สัปดาห์ที่ 3 (15-21)</option>
          <option value="4" ${planWeek==='4'?'selected':''}>สัปดาห์ที่ 4 (22-28)</option>
          <option value="5" ${planWeek==='5'?'selected':''}>สัปดาห์ที่ 5 (29+)</option>
        </select>
      </label>
      <label>สถานะ
        <select onchange="updateIotPlanField('${eid}','status',this.value)">
          <option value="pending" ${status==='pending'?'selected':''}>รอติดตั้ง</option>
          <option value="done" ${status==='done'?'selected':''}>ติดตั้งแล้ว</option>
          <option value="cancelled" ${status==='cancelled'?'selected':''}>สละสิทธิ์</option>
        </select>
      </label>
      <label>ทีมติดตั้ง
        <select data-dropcat="install_team" onchange="updateIotPlanField('${eid}','installTeam',this.value)"><option value="" ${!entry.installTeam?'selected':''}>ยังไม่ระบุ</option>${opt('install_team', entry.installTeam)}</select>
      </label>
      <label>ผู้ดำเนินการ
        <select data-dropcat="operator" onchange="updateIotPlanField('${eid}','operatorName',this.value)"><option value="" ${!entry.operatorName?'selected':''}>ยังไม่ระบุ</option>${opt('operator', entry.operatorName)}</select>
      </label>
      <label>รูปแบบตู้
        <select onchange="updateIotPlanFieldFromMap('${eid}','boxType',this.value,'${nidSafe}')">
          <option value="" ${!entry.boxType?'selected':''}>ยังไม่ระบุ</option>
          <option value="no_button" ${entry.boxType==='no_button'?'selected':''}>ตู้ไม่มีปุ่มกด</option>
          <option value="with_button" ${entry.boxType==='with_button'?'selected':''}>ตู้มีปุ่มกด</option>
        </select>
      </label>
      <label>ปั๊มน้ำ
        <select data-dropcat="pump_type" onchange="updateIotPlanField('${eid}','pumpType',this.value)"><option value="" ${!entry.pumpType?'selected':''}>ยังไม่ระบุ</option>${opt('pump_type', entry.pumpType)}</select>
      </label>
      <label>ขนาดท่อ
        <select data-dropcat="pipe_size" onchange="updateIotPlanField('${eid}','pipeSize',this.value)"><option value="" ${!entry.pipeSize?'selected':''}>ยังไม่ระบุ</option>${opt('pipe_size', entry.pipeSize)}</select>
      </label>
      <label>ขนาดวาล์ว
        <select data-dropcat="valve_size" onchange="updateIotPlanField('${eid}','valveSize',this.value)"><option value="" ${!entry.valveSize?'selected':''}>ยังไม่ระบุ</option>${opt('valve_size', entry.valveSize)}</select>
      </label>
      <label>แหล่งน้ำ
        <select data-dropcat="water_source" onchange="updateIotPlanField('${eid}','waterSource',this.value)"><option value="">ยังไม่ระบุ</option>${iotSelectOptionsHtml('water_source', planWaterVal(entry))}</select>
      </label>
      <label>รูปแบบการให้น้ำ
        <select data-dropcat="irrigation_type" onchange="updateIotPlanField('${eid}','irrigationType',this.value)"><option value="">ยังไม่ระบุ</option>${iotSelectOptionsHtml('irrigation_type', planIrrigationVal(entry))}</select>
      </label>
      ${entry.boxType === 'no_button' ? '' : `
      <label>การชำระเงิน
        <select data-dropcat="payment_status" onchange="updateIotPlanField('${eid}','paymentStatus',this.value)"><option value="" ${!entry.paymentStatus?'selected':''}>ยังไม่ระบุ</option>${opt('payment_status', entry.paymentStatus)}</select>
      </label>
      <label>ยอดชำระ (บาท)
        <input type="number" min="0" step="1" inputmode="numeric" value="${amountVal}" placeholder="บาท" oninput="updateIotPlanField('${eid}','paymentAmount',this.value)">
      </label>`}
      <label class="iot-map-detail-wide">ตำแหน่ง (Google Maps)
        <input type="text" value="${(entry.mapLink||'').replace(/"/g,'&quot;')}" placeholder="วางลิงก์ Google Maps" oninput="updateIotPlanField('${eid}','mapLink',this.value)">
      </label>
      <label>SN ตู้ (สแกน)
        <input type="text" value="${(entry.scannedSn||'').replace(/"/g,'&quot;')}" placeholder="SN ตู้ (ทีมสแกน)" oninput="updateIotPlanField('${eid}','scannedSn',this.value)">
      </label>
      <label>เลขฐาน (AR)
        <input type="text" value="${(entry.baseCode||'').replace(/"/g,'&quot;')}" placeholder="เช่น AR_0008" oninput="updateIotPlanField('${eid}','baseCode',this.value)">
      </label>
      <label class="iot-map-detail-wide">หมายเหตุ
        <input type="text" class="${entry.note ? 'note-input-filled' : ''}" value="${(entry.note||'').replace(/"/g,'&quot;')}" placeholder="หมายเหตุ" oninput="updateIotPlanField('${eid}','note',this.value); this.classList.toggle('note-input-filled', !!this.value.trim())">
      </label>
    </div>
    <div class="iot-map-detail-foot">
      <button type="button" class="btn btn-outline btn-xs" onclick="removePersonFromIotPlanByNid('${nidSafe}')"><i data-icon="trash" data-size="15"></i> เอาออกจากแผน</button>
    </div>`;
}

// คนนี้อยู่ในแผน และถูกกด "วางแผนเสร็จแล้ว" (planFinalized) แล้วหรือยัง
function isNidPlanFinalized(nid) {
  return iotInstallPlan.some(e => e.nationalId === nid && e.planFinalized);
}

function showIotDistrictPeople(province, district, highlightId) {
  currentIotPeoplePanelProvince = province;
  currentIotPeoplePanelDistrict = district;
  currentIotPeoplePanelMode = 'district';
  const people = getIotVisibleRows().filter(r => normName(r[IOT_FIELDS.province]) === normName(province) && normName(r[IOT_FIELDS.district]) === normName(district));
  const installed = people.filter(p => p[IOT_FIELDS.status] === IOT_FIELDS.done);
  // คนที่ทำเครื่องหมายว่า "ติดตั้งไม่ได้"ไว้ (แท็บ  ติดตั้งไม่ได้) แยกออกจากกลุ่ม "ยังไม่ติดตั้ง"ไปเป็นหัวข้อของตัวเอง
  // จนกว่าจะมีการยกเลิกเครื่องหมายหรือสถานะเปลี่ยน จะได้ไม่ปนกับคนที่ยังรอวางแผนติดตั้งจริงๆ
  const blocked = people.filter(p => p[IOT_FIELDS.status] === IOT_FIELDS.notDone && getIotInstallBlockerState(p));
  const notInstalledAll = people.filter(p => p[IOT_FIELDS.status] === IOT_FIELDS.notDone && !getIotInstallBlockerState(p));
  // แยกคนที่กด "วางแผนเสร็จแล้ว" ออกเป็นกลุ่มของตัวเอง ไม่ให้ปนกับคนที่ยังต้องวางแผน
  const planFinalizedList = notInstalledAll.filter(p => isNidPlanFinalized(p.national_id));
  const notInstalled = notInstalledAll.filter(p => !isNidPlanFinalized(p.national_id));
  const panel = document.getElementById('iotPeoplePanel');
  const prevScroll = capturePeoplePanelScroll(panel);
  panel.style.display = 'block';
  panel.innerHTML = `
    <div class="detail-header">
      <h3><i data-icon="users" data-size="15"></i> คนในอำเภอ${district} <span class="badge">${people.length} คน</span></h3>
      <button class="btn btn-outline" onclick="closeIotPeoplePanel()">ปิด <i data-icon="close" data-size="15"></i></button>
    </div>
    ${renderIotPeopleGroup('ติดตั้งแล้ว', '', 'group-yes', installed, highlightId)}
    ${renderIotPeopleGroup('ติดตั้งไม่ได้', '', 'group-blocked', blocked, highlightId)}
    ${renderIotPeopleGroup('ยังไม่ติดตั้ง (ยังไม่วางแผนเสร็จ)', '', 'group-no', notInstalled, highlightId, { callable: true, groupId: 'iotPeopleNotInstalled', province, district })}
    ${planFinalizedList.length ? renderIotPeopleGroup('วางแผนเสร็จแล้ว (รอติดตั้ง)', '', 'group-yes', planFinalizedList, highlightId) : ''}
  `;
  restorePeoplePanelScroll(panel, prevScroll);
  if (highlightId) {
    const row = document.getElementById('highlightedIotPersonRow');
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// รายชื่อ "ยังไม่ติดตั้ง" ของทุกอำเภอในจังหวัดเดียวกัน รวมไว้หน้าเดียว แยกหัวข้อเป็นอำเภอๆ
// เพื่อให้เลือกคนข้ามอำเภอได้ในทีเดียว ไม่ต้องกดเข้า-ออกทีละอำเภอเหมือนเดิม (มีประโยชน์มากตอนบางอำเภอมีคนน้อย)
function showIotProvinceAllDistrictsPeople(province) {
  currentIotPeoplePanelProvince = province;
  currentIotPeoplePanelDistrict = null;
  currentIotPeoplePanelMode = 'province';
  const provinceRows = getIotVisibleRows().filter(r => normName(r[IOT_FIELDS.province]) === normName(province));
  const districts = [...new Set(provinceRows.map(r => r[IOT_FIELDS.district]))].filter(Boolean).sort();
  const panel = document.getElementById('iotPeoplePanel');
  const prevScroll = capturePeoplePanelScroll(panel);
  panel.style.display = 'block';
  panel.innerHTML = `
    <div class="detail-header">
      <h3><i data-icon="users" data-size="15"></i> คนทั้งจังหวัด${province} <span class="badge">${districts.length} อำเภอ</span></h3>
      <button class="btn btn-brand btn-sm" onclick="goToIotCallArea('${province.replace(/'/g, "\\'")}','')" title="เปิดเมนูโทรนัด กรองทั้งจังหวัดนี้"><i data-icon="phone" data-size="14"></i> โทรนัดทั้งจังหวัด →</button>
      <button class="btn btn-outline" onclick="closeIotPeoplePanel()">ปิด <i data-icon="close" data-size="15"></i></button>
    </div>
    ${districts.map(d => {
      const districtRowsAll = provinceRows.filter(r => normName(r[IOT_FIELDS.district]) === normName(d) && r[IOT_FIELDS.status] === IOT_FIELDS.notDone);
      const blocked = districtRowsAll.filter(r => getIotInstallBlockerState(r));
      const notInstalledAll = districtRowsAll.filter(r => !getIotInstallBlockerState(r));
      const planFinalizedList = notInstalledAll.filter(r => isNidPlanFinalized(r.national_id));
      const notInstalled = notInstalledAll.filter(r => !isNidPlanFinalized(r.national_id));
      const groupId = 'iotPeopleNotInstalled_' + districts.indexOf(d);
      return `
        <h4 style="margin:16px 0 4px; font-size:14px;"><i data-icon="pin" data-size="15"></i> อำเภอ${d}</h4>
        ${renderIotPeopleGroup('ติดตั้งไม่ได้', '', 'group-blocked', blocked, null)}
        ${renderIotPeopleGroup('ยังไม่ติดตั้ง (ยังไม่วางแผนเสร็จ)', '', 'group-no', notInstalled, null, { callable: true, groupId, province, district: d })}
        ${planFinalizedList.length ? renderIotPeopleGroup('วางแผนเสร็จแล้ว (รอติดตั้ง)', '', 'group-yes', planFinalizedList, null) : ''}
      `;
    }).join('')}
  `;
  restorePeoplePanelScroll(panel, prevScroll);
}

// เรียก render พาแนลปัจจุบันซ้ำ (ใช้หลังเพิ่มคนเข้าแผน) — รองรับทั้งโหมดดูทีละอำเภอ และโหมดดูทั้งจังหวัด
function refreshIotPeoplePanel() {
  if (currentIotPeoplePanelMode === 'province' && currentIotPeoplePanelProvince) {
    showIotProvinceAllDistrictsPeople(currentIotPeoplePanelProvince);
  } else if (currentIotPeoplePanelProvince && currentIotPeoplePanelDistrict) {
    showIotDistrictPeople(currentIotPeoplePanelProvince, currentIotPeoplePanelDistrict);
  }
}

function closeIotPeoplePanel() {
  document.getElementById('iotPeoplePanel').style.display = 'none';
  currentIotPeoplePanelProvince = null;
  currentIotPeoplePanelDistrict = null;
  currentIotPeoplePanelMode = null;
}

function searchAndZoomIotPerson() {
  const q = document.getElementById('iotPersonSearch').value.trim().toLowerCase();
  const statusEl = document.getElementById('iotMapSearchStatus');
  if (!q) { statusEl.textContent = ''; return; }
  if (!geoProvinces) { statusEl.textContent = 'กรุณารอให้แผนที่โหลดเสร็จก่อน'; return; }

  const match = getIotVisibleRows().find(r => {
    const hay = `${r.prefix || ''}${r.first_name || ''} ${r.last_name || ''} ${r.national_id || ''}`.toLowerCase();
    return hay.includes(q);
  });

  if (!match) {
    statusEl.textContent = 'ไม่พบข้อมูลที่ตรงกับ "' + q + '"';
    return;
  }

  const code = provinceNameToCode[normName(match[IOT_FIELDS.province])];
  if (!code) {
    statusEl.textContent = 'พบข้อมูลแต่ไม่พบตำแหน่งบนแผนที่สำหรับจังหวัด ' + match[IOT_FIELDS.province];
    return;
  }

  statusEl.textContent = `พบ: ${match.prefix || ''}${match.first_name} ${match.last_name} — ${match[IOT_FIELDS.province]} / ${match[IOT_FIELDS.district]} · กำลังซูมไปหา...`;

  zoomToIotProvince(code, () => {
    zoomToIotDistrict(code, match[IOT_FIELDS.district], () => {
      showIotDistrictPeople(match[IOT_FIELDS.province], match[IOT_FIELDS.district], match.national_id);
      statusEl.textContent = `พบ: ${match.prefix || ''}${match.first_name} ${match.last_name} — ${match[IOT_FIELDS.province]} / ${match[IOT_FIELDS.district]}`;
    });
  });
}

function populateProvinceFilter(rows) {
  const sel = document.getElementById('filterProvince');
  const current = sel.value;
  const provinces = [...new Set(rows.map(r => r.province).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">ทั้งหมด</option>' + provinces.map(p => `<option value="${p}">${p}</option>`).join('');
  sel.value = current;
}

function getFiltered() {
  const province = document.getElementById('filterProvince').value;
  const status = document.getElementById('filterStatus').value;
  const search = document.getElementById('filterSearch').value.trim().toLowerCase();

  return allRows.filter(r => {
    if (province && r.province !== province) return false;
    if (status && r.training_status !== status) return false;
    if (search) {
      const hay = `${r.first_name||''} ${r.last_name||''} ${r.national_id||''}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

function applyFilters() {
  const filtered = getFiltered();
  document.getElementById('detailCountBadge').textContent = filtered.length.toLocaleString() + ' รายการ';

  const tbody = document.getElementById('tbody');
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="12" class="empty-state-cell">
      <div class="empty">
        <span class="empty-ico">${icon('search', 20)}</span>
        <span class="empty-title">ไม่พบรายการที่ตรงกับตัวกรอง</span>
        <span class="empty-text">ลองปรับตัวกรองหรือคำค้นดูใหม่นะครับ</span>
      </div></td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(r => {
    const done = r.training_status === 'Y';
    return `
    <tr>
      <td class="cell-strong">${r.first_name||''}</td>
      <td>${r.last_name||''}</td>
      <td><span class="stat ${done ? 'stat-ok' : 'stat-danger'}">${done ? 'อบรมแล้ว' : 'ยังไม่ผ่าน'}</span></td>
      <td class="cell-muted">${r.application_no||''}</td>
      <td class="cell-muted">${r.prefix||''}</td>
      <td class="num">${r.national_id||''}</td>
      <td class="num">${r.phone||''}</td>
      <td>${r.province||''}</td>
      <td>${r.district||''}</td>
      <td>${r.subdistrict||''}</td>
      <td class="cell-muted">${r.approval_round||''}</td>
      <td class="cell-muted">${r.uploaded_at||''}</td>
    </tr>`;
  }).join('');
}

function exportCsv() {
  const filtered = getFiltered();
  const headers = ['เลขที่สมัคร','คำนำหน้า','ชื่อ','นามสกุล','เลขบัตรประชาชน','เบอร์ติดต่อ','จังหวัด','อำเภอ','ตำบล','รอบการอนุมัติ','สถานะอบรม','เวลาอัพโหลด'];
  const rows = filtered.map(r => [r.application_no,r.prefix,r.first_name,r.last_name,r.national_id,r.phone,r.province,r.district,r.subdistrict,r.approval_round,r.training_status,r.uploaded_at]);
  const csv = [headers, ...rows].map(row => row.map(v => `"${(v??'').toString().replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'farmers_export.csv';
  link.click();
}

// ===== แผนอบรมรายสัปดาห์ (เพิ่มคนจากแท็บแผนที่) =====
function loadPlanFromStorage() {
  try {
    const raw = localStorage.getItem(PLAN_STORAGE_KEY);
    trainingPlan = raw ? JSON.parse(raw) : [];
  } catch (e) {
    trainingPlan = [];
  }
  // migrate entries created before "วันที่นัด" (visitDate) existed —
  // ตอนนั้นมีแค่ช่องข้อความอิสระชื่อ "week" เท่านั้น
  let migrated = false;
  trainingPlan.forEach(p => {
    if (p.visitDate === undefined) {
      migrated = true;
      if (p.week && /^\d{4}-\d{2}-\d{2}$/.test(p.week)) {
        p.visitDate = p.week;
      } else {
        p.visitDate = '';
        if (p.week) {
          p.note = p.note ? (p.note + ' | ' + p.week) : p.week;
        }
      }
      delete p.week;
    }
    if (p.mapLink === undefined) {
      migrated = true;
      p.mapLink = '';
    }
    if (p.status === undefined) {
      migrated = true;
      p.status = 'pending';
    }
    if (p.subdistrict === undefined) {
      migrated = true;
      p.subdistrict = '';
    }
  });
  trainingPlan.forEach((p, idx) => {
    if (p.sortOrder === undefined) {
      migrated = true;
      p.sortOrder = idx;
    }
  });
  if (migrated) savePlanToStorage();
}

// expose ฟังก์ชันของโมดูลนี้ให้ inline handlers และโมดูลอื่นเรียกผ่าน window ได้
Object.assign(window, {
  renderIotMapDetailEditor, updateIotPlanFieldFromMap, addPersonToIotPlanByNidAndExpand, iotMapDetailEditorInner, isNidPlanFinalized, showIotDistrictPeople,
  showIotProvinceAllDistrictsPeople, refreshIotPeoplePanel, closeIotPeoplePanel, searchAndZoomIotPerson, populateProvinceFilter, getFiltered,
  applyFilters, exportCsv, loadPlanFromStorage,
});
