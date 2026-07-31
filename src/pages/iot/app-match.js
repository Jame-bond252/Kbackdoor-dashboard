// ===== หน้าตรวจสอบเชื่อมต่อแอป: เทียบคนเชื่อมแอปแล้วกับข้อมูล OTOD =====
// แยกมาจาก main.js เดิม — ตัวแปร/ฟังก์ชันแชร์ผ่าน window (โค้ดเดิมออกแบบเป็น global scope)


// แบ่งหมวด: รอยืนยันเอกสาร (isLegacyPending) / ตรงกันแล้ว / เชื่อมต่อแล้วรอระบบอัปเดต /
// OTOD ติดตั้งแล้วแต่ยังไม่เชื่อมต่อ (แยกย่อยเป็นยืนยันซ้ำจากข้อมูลเก่าแล้ว vs ยังไม่มีอะไรยืนยัน) / เชื่อมต่อแอปแต่ไม่พบใน OTOD
function getAppMatchCategories() {
  const rows = getIotVisibleRows();
  const inSync = [];
  const pendingUpdate = [];
  const otodOnly = [];
  const pendingDocConfirmation = [];

  rows.forEach(r => {
    // สถานะ "ติดตั้งแล้ว" ของคนกลุ่มนี้เป็นสิ่งที่ระบบอนุมานเอง (จากข้อมูลเก่า หรือจากการเชื่อมต่อแอป) ไม่ใช่ข้อมูลจริงจาก OTOD
    // ต้องแยกไปตาราง "รอยืนยันเอกสาร" เสมอ ห้ามปนกับ 4 หมวดด้านล่างที่ต้องอิงข้อมูลจริงจาก OTOD เท่านั้น
    // (กันสับสนระหว่าง "OTOD ยืนยันแล้วจริงๆ" กับ "ระบบอนุมานว่าน่าจะติดตั้งแล้ว แต่ยังรอ OTOD ยืนยัน" ซึ่งเป็นคนละเคสกัน)
    if (r.isLegacyPending) {
      pendingDocConfirmation.push(r);
      return;
    }
    if (r.app_connected) {
      if (r[IOT_FIELDS.status] === IOT_FIELDS.done) inSync.push(r);
      else pendingUpdate.push(r);
    } else if (r[IOT_FIELDS.status] === IOT_FIELDS.done) {
      otodOnly.push(r);
    }
  });

  const matchedIds = buildMatchedAppIotIds();
  const appOnly = appConnections.filter(c => !matchedIds.has(c.app_iot_id));

  // ใครในกลุ่ม otodOnly (ของจริงจาก OTOD ไม่ใช่ที่ระบบอนุมาน) ที่มี SN ยืนยันซ้ำจากข้อมูลเก่าด้วย ถือว่ายืนยันครบสองทางแล้ว
  // ไม่ต้องตามให้เชื่อมต่อแอปด่วนเหมือนคนที่ยังไม่มีอะไรยืนยันเลย
  const otodOnlyConfirmed = otodOnly.filter(r => r.legacySerial);
  const otodOnlyUnconfirmed = otodOnly.filter(r => !r.legacySerial);

  return { inSync, pendingUpdate, otodOnly: otodOnlyUnconfirmed, otodOnlyConfirmed, appOnly, pendingDocConfirmation };
}

// คอลัมน์ "SN ตู้" รวมเป็นช่องเดียว: ถ้ามี SN จากการเชื่อมต่อแอปจริง (ยืนยันแล้ว) ใช้อันนั้นก่อน
// ถ้าไม่มีแต่จับคู่ได้กับข้อมูลตู้ชุดเก่า ใช้ SN จากข้อมูลเก่าแทน พร้อมไอคอนนาฬิกา  บอกว่ายังไม่ยืนยันผ่านแอป
function getIotSnCellHtml(r) {
  if (r.matched_sn) return r.matched_sn;
  if (r.legacySerial) return `<span title="ยังไม่ยืนยันผ่านแอป มาจากชีตติดตามตู้ชุดเก่า">${r.legacySerial} <i data-icon="pending" data-size="15"></i></span>`;
  return '-';
}

// เลขฐาน AR ของคนนี้ (เช่น AR_0008) — เอาค่าที่ระบบใช้ยืนยันสถานะ "ได้ตู้แล้ว" อยู่ก่อน (กรอกเองหรือจากชีตเก่าที่ทำให้สถานะเปลี่ยนจริง)
// ถ้าไม่มี (เช่นคนที่ OTOD ยืนยันเองอยู่แล้วไม่ผ่านชีตเก่าเลย) ให้ย้อนไปดูค่าดิบจากชีตเก่าเผื่อมีบันทึกไว้เฉยๆ
function getIotArCodeDisplay(r) {
  if (r.legacyBaseCode) return r.legacyBaseCode;
  const legacyRec = findIotLegacyRecord(r);
  return formatIotArCode(legacyRec ? legacyRec.base_code_no : null) || '';
}

function getIotDocChecklistCellHtml(r) {
  const items = getIotDocChecklistState(r);
  const doneCount = items.filter(it => it.ok).length;
  const cls = doneCount === items.length ? 'status-done' : 'status-pending';
  const refIdSafe = (r.reference_id || '').replace(/'/g, "\\'");
  if (!r.reference_id) return '-';
  return `<span class="pdf-status-badge ${cls}" style="cursor:pointer;" onclick="openIotDocChecklistModal('${refIdSafe}')" title="กดเพื่อดู/แก้ไขรายละเอียด">${doneCount}/${items.length} ครบ</span>`;
}

// เช็คว่าแถวนี้ตรงกับตัวกรอง "สถานะในระบบ OTOD" ที่เลือกไว้ไหม (all = ผ่านหมด ไม่กรอง)
// ใช้ '__none__' แทนคนที่ยังไม่มีสถานะเลย (ยังไม่เชื่อมต่อแอป เลยไม่มีข้อความสถานะจาก OTOD ให้โชว์)
function matchesIotPendingDocStatusFilter(r, filterValue) {
  if (!filterValue || filterValue === 'all') return true;
  const status = r.status || '__none__';
  return status === filterValue;
}

// สร้างตัวเลือกในดรอปดาวน์ "สถานะในระบบ OTOD" จากสถานะจริงที่มีอยู่ในกลุ่มนี้เท่านั้น (ไม่ฮาร์ดโค้ดลิสต์ตายตัว
// เพราะสถานะฝั่ง Durian อาจเพิ่ม/แก้ข้อความในอนาคตได้) พยายามคงค่าที่เลือกไว้เดิมไว้ถ้ายังมีอยู่ในกลุ่มนี้
function populateIotPendingDocStatusOptions(rows) {
  const sel = document.getElementById('iotMatchPendingDocStatusFilter');
  if (!sel) return;
  const prevValue = sel.value || 'all';
  const statusSet = new Set();
  rows.forEach(r => statusSet.add(r.status || '__none__'));
  const sortedStatuses = [...statusSet].sort((a, b) => a.localeCompare(b, 'th'));
  const optionsHtml = sortedStatuses.map(s => {
    const label = s === '__none__' ? 'ยังไม่มีสถานะ (ยังไม่เชื่อมต่อแอป)' : s;
    const valueSafe = s.replace(/"/g, '&quot;');
    return `<option value="${valueSafe}">${label}</option>`;
  }).join('');
  sel.innerHTML = '<option value="all">สถานะทั้งหมด</option>' + optionsHtml;
  sel.value = statusSet.has(prevValue) || prevValue === 'all' ? prevValue : 'all';
}

function renderIotFarmerMatchRows(rows, includeStatus, includeDocChecklist, includePhotoBtn) {
  let colCount = includeStatus ? (includeDocChecklist ? 13 : 12) : 11;
  if (includePhotoBtn) colCount += 1;
  if (!rows.length) {
    return `<tr><td colspan="${colCount}" class="empty-state-cell"><span class="empty-icon"><i data-icon="sparkles" data-size="15"></i></span><span class="empty-text">ไม่มีรายการในหมวดนี้</span></td></tr>`;
  }
  return rows.map((r, i) => {
    let photoCell = '';
    if (includePhotoBtn) {
      const nidSafe = (r.national_id || '').replace(/'/g, "\'");
      const pr = fieldSubProgress(r.national_id);
      const label = pr.driveSent ? 'Drive': (pr.photos ? `${pr.photos}/4`: 'เพิ่มรูป');
      photoCell = `<td>${r.national_id ? `<button type="button" class="btn btn-outline btn-xs" onclick="openFieldSubmission('${nidSafe}')" title="อัปโหลด/ตรวจรูป แล้วส่งเข้า Google Drive">${label}</button>` : '-'}</td>`;
    }
    return `
    <tr>
      <td>${i + 1}</td>
      <td>${r.prefix || ''}</td>
      <td>${r.first_name || ''}</td>
      <td>${r.last_name || ''}</td>
      <td>${r.national_id || ''}</td>
      <td>${r.phone || ''}</td>
      <td>${getIotSnCellHtml(r)}</td>
      <td>${getIotArCodeDisplay(r) || '-'}</td>
      <td>${r.farm_province || ''}</td>
      <td>${r.farm_district || ''}</td>
      <td>${r.farm_subdistrict || ''}</td>
      ${includeStatus ? `<td>${getIotStatusDisplayHtml(r)}</td>` : ''}
      ${includeDocChecklist ? `<td>${getIotDocChecklistCellHtml(r)}</td>` : ''}
      ${photoCell}
    </tr>
  `;
  }).join('');
}

// แคชผลลัพธ์การจัดหมวดล่าสุดไว้ ให้ช่องค้นหาแต่ละตารางกรองต่อได้โดยไม่ต้องคำนวณหมวดใหม่ทุกครั้งที่พิมพ์
window.iotAppMatchCategoriesCache = null;

// ค้นหาในตาราง "เกษตรกร" (ชื่อ/นามสกุล/เลขบัตร/เบอร์/SN/พื้นที่) — ใช้ร่วมกันทุกตารางยกเว้น "เชื่อมต่อแอป แต่ไม่พบใน OTOD"
function matchesIotFarmerSearch(r, term) {
  const q = (term || '').trim().toLowerCase();
  if (!q) return true;
  const arCode = getIotArCodeDisplay(r) || '';
  const hay = [r.prefix, r.first_name, r.last_name, r.national_id, r.phone, r.matched_sn, r.legacySerial, r.farm_province, r.farm_district, r.farm_subdistrict, arCode]
    .map(v => (v || '').toString().toLowerCase()).join(' ');
  if (hay.includes(q)) return true;
  // เผื่อพิมพ์เลข AR แบบเว้นวรรค/ขีด แทนขีดล่างที่เก็บจริง (เช่น "AR 0000" หรือ "ar-0000" ให้ยังหาเจอ "AR_0000")
  if (arCode) {
    const normalizedArCode = arCode.toLowerCase().replace(/[\s_-]/g, '');
    const normalizedQuery = q.replace(/[\s_-]/g, '');
    if (normalizedQuery && normalizedArCode.includes(normalizedQuery)) return true;
  }
  return false;
}

// ค้นหาในตาราง "เชื่อมต่อแอปแล้ว แต่ไม่พบข้อมูลในระบบ OTOD" (ข้อมูลดิบจาก app_connections ไม่ใช่ iot_farmers)
function matchesIotAppOnlySearch(c, term) {
  const q = (term || '').trim().toLowerCase();
  if (!q) return true;
  const hay = [c.app_iot_id, c.app_farmer_id, c.first_name, c.last_name, c.national_id, c.phone]
    .map(v => (v || '').toString().toLowerCase()).join(' ');
  return hay.includes(q);
}

function renderIotAppOnlyRows(rows) {
  if (!rows.length) {
    return '<tr><td colspan="7" class="empty-state-cell"><span class="empty-icon"><i data-icon="sparkles" data-size="15"></i></span><span class="empty-text">ไม่มีรายการในหมวดนี้</span></td></tr>';
  }
  return rows.map((c, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${c.app_iot_id || ''}</td>
          <td>${c.app_farmer_id || ''}</td>
          <td>${c.first_name || ''}</td>
          <td>${c.last_name || ''}</td>
          <td>${c.national_id || ''}</td>
          <td>${c.phone || ''}</td>
        </tr>
      `).join('');
}

// เช็คว่าแถวนี้ตรงกับตัวกรอง "ครบ/ไม่ครบ" เอกสารที่เลือกไว้ไหม (all = ผ่านหมด ไม่กรอง)
function matchesIotDocChecklistFilter(r, filterValue) {
  if (!filterValue || filterValue === 'all') return true;
  const items = getIotDocChecklistState(r);
  const complete = items.every(it => it.ok);
  return filterValue === 'incomplete' ? !complete : complete;
}

// รวมตรรกะกรอง (ค้นหา + ครบ/ไม่ครบเอกสาร + สถานะ OTOD) ไว้ที่เดียว ให้ทั้งตารางแสดงผลและปุ่มส่งออก Excel ใช้ร่วมกัน
// รับประกันว่าไฟล์ที่ส่งออกตรงกับสิ่งที่เห็นในตารางเสมอ
function getFilteredIotPendingDoc() {
  if (!iotAppMatchCategoriesCache) return [];
  const term = document.getElementById('iotMatchPendingDocSearch').value;
  const filterEl = document.getElementById('iotMatchPendingDocFilter');
  const filterValue = filterEl ? filterEl.value : 'all';
  const statusEl = document.getElementById('iotMatchPendingDocStatusFilter');
  const statusValue = statusEl ? statusEl.value : 'all';
  return iotAppMatchCategoriesCache.pendingDocConfirmation
    .filter(r => matchesIotFarmerSearch(r, term))
    .filter(r => matchesIotDocChecklistFilter(r, filterValue))
    .filter(r => matchesIotPendingDocStatusFilter(r, statusValue));
}

function applyIotMatchPendingDocSearch() {
  const filtered = getFilteredIotPendingDoc();
  document.getElementById('iotMatchPendingDocTbody').innerHTML = renderIotFarmerMatchRows(filtered, true, true, true);
}

// ส่งออก Excel เฉพาะรายการที่ตรงกับตัวกรองที่เลือกอยู่ตอนนี้ (ค้นหา/ครบไม่ครบ/สถานะ) ไม่ใช่ทั้งหมดเสมอไป
function exportIotMatchPendingDocExcel() {
  const filtered = getFilteredIotPendingDoc();
  if (!filtered.length) { showToast('ไม่มีรายการที่ตรงกับตัวกรองตอนนี้ครับ', 'warn'); return; }
  const data = filtered.map((r, i) => {
    const snPlain = r.matched_sn ? r.matched_sn : (r.legacySerial ? `${r.legacySerial} (ยังไม่ยืนยันผ่านแอป)` : '-');
    const items = getIotDocChecklistState(r);
    const doneCount = items.filter(it => it.ok).length;
    return {
      'ลำดับ': i + 1,
      'คำนำหน้า': r.prefix || '',
      'ชื่อ': r.first_name || '',
      'นามสกุล': r.last_name || '',
      'เลขบัตรประชาชน': r.national_id || '',
      'เบอร์มือถือ': r.phone || '',
      'SN ตู้': snPlain,
      'เลข AR': getIotArCodeDisplay(r) || '-',
      'จังหวัด': r.farm_province || '',
      'อำเภอ': r.farm_district || '',
      'ตำบล': r.farm_subdistrict || '',
      'สถานะในระบบ OTOD': r.status || 'ยังไม่มีสถานะ (ยังไม่เชื่อมต่อแอป)',
      'เอกสาร/ภาพ/วีดีโอ': `${doneCount}/${items.length} ครบ`
    };
  });
  const ws = XLSX.utils.json_to_sheet(data);
  prettifyExcelSheet(ws, data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ได้ตู้แล้ว รอยืนยันเอกสาร');
  XLSX.writeFile(wb, 'ได้ตู้แล้ว_รอยืนยันเอกสาร.xlsx');
}

function applyIotMatchOtodOnlySearch() {
  if (!iotAppMatchCategoriesCache) return;
  const term = document.getElementById('iotMatchOtodOnlySearch').value;
  const filtered = iotAppMatchCategoriesCache.otodOnly.filter(r => matchesIotFarmerSearch(r, term));
  document.getElementById('iotMatchOtodOnlyTbody').innerHTML = renderIotFarmerMatchRows(filtered, false);
}

function applyIotMatchOtodConfirmedSearch() {
  if (!iotAppMatchCategoriesCache) return;
  const term = document.getElementById('iotMatchOtodConfirmedSearch').value;
  const filtered = iotAppMatchCategoriesCache.otodOnlyConfirmed.filter(r => matchesIotFarmerSearch(r, term));
  document.getElementById('iotMatchOtodConfirmedTbody').innerHTML = renderIotFarmerMatchRows(filtered, false);
}

function applyIotMatchInSyncSearch() {
  if (!iotAppMatchCategoriesCache) return;
  const term = document.getElementById('iotMatchInSyncSearch').value;
  const filtered = iotAppMatchCategoriesCache.inSync.filter(r => matchesIotFarmerSearch(r, term));
  document.getElementById('iotMatchInSyncTbody').innerHTML = renderIotFarmerMatchRows(filtered, true);
}

function applyIotMatchAppOnlySearch() {
  if (!iotAppMatchCategoriesCache) return;
  const term = document.getElementById('iotMatchAppOnlySearch').value;
  const filtered = iotAppMatchCategoriesCache.appOnly.filter(c => matchesIotAppOnlySearch(c, term));
  document.getElementById('iotMatchAppOnlyTbody').innerHTML = renderIotAppOnlyRows(filtered);
}

function renderIotAppMatchDashboard() {
  const totalEl = document.getElementById('iotMatchKpiTotalApp');
  if (!totalEl) return; // แท็บยังไม่ถูกโหลด

  const categories = getAppMatchCategories();
  iotAppMatchCategoriesCache = categories;
  const { inSync, pendingUpdate, otodOnly, otodOnlyConfirmed, appOnly, pendingDocConfirmation } = categories;

  document.getElementById('iotMatchKpiTotalApp').textContent = appConnections.length.toLocaleString();
  document.getElementById('iotMatchKpiInSync').textContent = inSync.length.toLocaleString();
  document.getElementById('iotMatchKpiAppOnly').textContent = appOnly.length.toLocaleString();
  document.getElementById('iotMatchKpiOtodOnly').textContent = otodOnly.length.toLocaleString();
  document.getElementById('iotMatchKpiOtodConfirmed').textContent = otodOnlyConfirmed.length.toLocaleString();
  document.getElementById('iotMatchKpiPendingDoc').textContent = pendingDocConfirmation.length.toLocaleString();

  document.getElementById('iotMatchPendingDocCountBadge').textContent = pendingDocConfirmation.length.toLocaleString() + ' รายการ';
  populateIotPendingDocStatusOptions(pendingDocConfirmation);
  applyIotMatchPendingDocSearch();

  document.getElementById('iotMatchOtodOnlyCountBadge').textContent = otodOnly.length.toLocaleString() + ' รายการ';
  applyIotMatchOtodOnlySearch();

  document.getElementById('iotMatchOtodConfirmedCountBadge').textContent = otodOnlyConfirmed.length.toLocaleString() + ' รายการ';
  applyIotMatchOtodConfirmedSearch();

  document.getElementById('iotMatchInSyncCountBadge').textContent = inSync.length.toLocaleString() + ' รายการ';
  applyIotMatchInSyncSearch();

  document.getElementById('iotMatchAppOnlyCountBadge').textContent = appOnly.length.toLocaleString() + ' รายการ';
  applyIotMatchAppOnlySearch();
}

function setIotPlanLookback(days) {
  iotPlanLookbackDays = days;
  renderIotPlanDashboard();
}

function renderIotPlanTimelineChart(countByDate, today, rangeStart, rangeEnd) {
  const canvas = document.getElementById('iotPlanTimelineChart');
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

  if (iotPlanTimelineChart) iotPlanTimelineChart.destroy();
  iotPlanTimelineChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: { labels, datasets: [{ label: 'จำนวนคนที่นัดติดตั้ง', data, backgroundColor: colors, borderRadius: 5, maxBarThickness: 26 }] },
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

function renderIotPlanDashboard() {
  const badge = document.getElementById('iotPlanKpiToday');
  if (!badge) return; // แท็บ/องค์ประกอบยังไม่ถูกโหลด

  const today = todayDateStr();
  const withDate = iotInstallPlan.filter(p => p.installDate);
  // "ยังไม่ได้นัด" = คนที่ยังต้องโทรนัดจริงๆ ทั้งหมด (ตัวเลขเดียวกับหัวคิวโทรนัด)
  // ไม่ใช่แค่แถวที่มีอยู่ใน iotInstallPlan เพราะคนส่วนใหญ่ยังไม่เคยถูกเพิ่มเข้าแผนเลย
  const noDateCount = (typeof iotCallPendingRows === 'function')
    ? iotCallPendingRows().length
    : (iotInstallPlan.length - withDate.length);

  const todayEntries = withDate.filter(p => p.installDate === today);
  const pastStart = addDaysToDateStr(today, -iotPlanLookbackDays);
  const pastEntries = withDate
    .filter(p => p.installDate < today && p.installDate >= pastStart)
    .sort((a, b) => b.installDate.localeCompare(a.installDate));
  const upcomingEntries = withDate
    .filter(p => p.installDate > today)
    .sort((a, b) => a.installDate.localeCompare(b.installDate));

  document.getElementById('iotPlanKpiToday').textContent = todayEntries.length;
  document.getElementById('iotPlanKpiTodayDate').textContent = formatThaiDate(today, today);
  document.getElementById('iotPlanKpiPast').textContent = pastEntries.length;
  document.getElementById('iotPlanKpiPastRange').textContent = `ย้อนหลัง ${iotPlanLookbackDays} วัน`;
  document.getElementById('iotPlanKpiUpcoming').textContent = upcomingEntries.length;
  document.getElementById('iotPlanKpiNoDate').textContent = noDateCount.toLocaleString();

  document.querySelectorAll('#tab-iot-dashboard .range-btn').forEach(b => {
    b.classList.toggle('active', Number(b.dataset.range) === iotPlanLookbackDays);
  });

  const total = iotInstallPlan.length;
  const doneCount = iotInstallPlan.filter(p => p.status === 'done').length;
  const cancelledCount = iotInstallPlan.filter(p => p.status === 'cancelled').length;
  const pendingCount = total - doneCount - cancelledCount;
  const donePct = total ? Math.round((doneCount / total) * 100) : 0;
  const cancelledPct = total ? Math.round((cancelledCount / total) * 100) : 0;
  document.getElementById('iotPlanProgressText').textContent = donePct + '%';
  document.getElementById('iotPlanProgressDone').style.width = donePct + '%';
  document.getElementById('iotPlanProgressCancelled').style.width = cancelledPct + '%';
  document.getElementById('iotPlanProgressDoneCount').textContent = doneCount.toLocaleString();
  document.getElementById('iotPlanProgressPendingCount').textContent = pendingCount.toLocaleString();
  document.getElementById('iotPlanProgressCancelledCount').textContent = cancelledCount.toLocaleString();

  const iotTimelineOpts = {
    dateFormatter: (d) => formatIotPlanWeekLabelRelative(d, today),
    isCurrentFn: (d) => getIotMonthYearFromDate(d) === getIotMonthYearFromDate(today) && getIotWeekOfMonthFromDate(d) === getIotWeekOfMonthFromDate(today)
  };
  renderPlanTimelineList('iotPlanPastList', groupByDate(pastEntries, 'installDate'), 'ไม่มีรายการย้อนหลังในช่วงที่เลือก', today, iotTimelineOpts);
  renderPlanTimelineList('iotPlanUpcomingList', groupByDate([...todayEntries, ...upcomingEntries], 'installDate'), 'ยังไม่มีรายการที่กำลังจะมาถึง', today, iotTimelineOpts);

  const countByDate = {};
  withDate.forEach(p => { countByDate[p.installDate] = (countByDate[p.installDate] || 0) + 1; });
  renderIotPlanTimelineChart(countByDate, today, pastStart, addDaysToDateStr(today, 7));
  renderIotPlanAppMatchSection();
}

// สรุปจำนวนรายการที่ "ยืนยันได้รับตู้แล้วจากแอป" แยกตามทีมติดตั้ง (ไม่รวมรายการที่ยกเลิก) — ให้ดูภาพรวม/ประวัติได้ในตัว
// เพราะ first_seen_at ของแต่ละคนจะคงที่ตลอดไป (ไม่ถูกเขียนทับซ้ำ) ตัวเลขนี้จึงสะสมเพิ่มขึ้นเรื่อยๆ ตามจริง
function renderIotPlanAppConfirmTeamBreakdown() {
  const tbody = document.getElementById('iotPlanAppConfirmTeamTbody');
  if (!tbody) return;
  const active = iotInstallPlan.filter(p => p.status !== 'cancelled');
  const teams = [...IOT_INSTALL_TEAMS, 'ยังไม่ระบุทีม'];
  const rows = teams.map(team => {
    const rowsForTeam = active.filter(p => (p.installTeam || 'ยังไม่ระบุทีม') === team);
    const confirmed = rowsForTeam.filter(p => getAppConfirmForPlanEntry(p)).length;
    const total = rowsForTeam.length;
    return { team, confirmed, pending: total - confirmed, total };
  }).filter(r => r.total > 0);
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state-cell"><span class="empty-icon"><i data-icon="inbox" data-size="15"></i></span><span class="empty-text">ยังไม่มีข้อมูล</span></td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.team}</td>
      <td class="num">${r.confirmed.toLocaleString()}</td>
      <td class="num">${r.pending.toLocaleString()}</td>
      <td class="num">${r.total.toLocaleString()}</td>
    </tr>
  `).join('');
}

// แถวตารางสำหรับส่วน "แผนติดตั้ง IoT เทียบกับข้อมูลเชื่อมต่อแอป"ในแท็บ  ตรวจสอบเชื่อมต่อแอป
function iotPlanMatchRowHtml(p, i, confirm) {
  return `
    <tr>
      <td>${i + 1}</td>
      <td>${p.name || '-'}</td>
      <td>${p.nationalId || ''}</td>
      <td>${p.phone || ''}</td>
      <td>${p.installTeam || 'ยังไม่ระบุ'}</td>
      <td>${p.installDate ? formatIotPlanWeekLabel(p.installDate) : 'ยังไม่นัด'}</td>
      <td><span class="pdf-status-badge status-${p.status || 'pending'}">${IOT_PLAN_STATUS_LABELS[p.status || 'pending']}</span></td>
      ${confirm ? `<td>${formatDateTimeThai(confirm.firstSeenAt)}</td>` : ''}
    </tr>
  `;
}

// สรุป+เรนเดอร์ส่วน "แผนติดตั้ง IoT เทียบกับข้อมูลเชื่อมต่อแอป"ทั้งหมดในแท็บ  ตรวจสอบเชื่อมต่อแอป
// (ย้ายมาจากแท็บ  แผนติดตั้ง IoT ตามคำขอผู้ใช้ เพื่อไม่ให้แท็บวางแผนดูรกเกินไป)
function renderIotPlanAppMatchSection() {
  const kpiTotalEl = document.getElementById('iotPlanMatchKpiTotal');
  if (!kpiTotalEl) return; // แท็บยังไม่ถูกโหลด

  const active = iotInstallPlan.filter(p => p.status !== 'cancelled');
  const confirmedList = [];
  const unconfirmedList = [];
  active.forEach(p => {
    const c = getAppConfirmForPlanEntry(p);
    if (c) confirmedList.push({ p, c }); else unconfirmedList.push(p);
  });
  confirmedList.sort((a, b) => (a.c.firstSeenAt || '').localeCompare(b.c.firstSeenAt || ''));

  kpiTotalEl.textContent = active.length.toLocaleString();
  document.getElementById('iotPlanMatchKpiConfirmed').textContent = confirmedList.length.toLocaleString();
  document.getElementById('iotPlanMatchKpiUnconfirmed').textContent = unconfirmedList.length.toLocaleString();

  document.getElementById('iotPlanMatchConfirmedCountBadge').textContent = confirmedList.length.toLocaleString() + ' รายการ';
  document.getElementById('iotPlanMatchConfirmedTbody').innerHTML = confirmedList.length
    ? confirmedList.map((item, i) => iotPlanMatchRowHtml(item.p, i, item.c)).join('')
    : '<tr><td colspan="8" class="empty-state-cell"><span class="empty-icon"><i data-icon="sparkles" data-size="15"></i></span><span class="empty-text">ยังไม่มีรายการในหมวดนี้</span></td></tr>';

  document.getElementById('iotPlanMatchUnconfirmedCountBadge').textContent = unconfirmedList.length.toLocaleString() + ' รายการ';
  document.getElementById('iotPlanMatchUnconfirmedTbody').innerHTML = unconfirmedList.length
    ? unconfirmedList.map((p, i) => iotPlanMatchRowHtml(p, i, null)).join('')
    : '<tr><td colspan="7" class="empty-state-cell"><span class="empty-icon"><i data-icon="sparkles" data-size="15"></i></span><span class="empty-text">ยังไม่มีรายการในหมวดนี้</span></td></tr>';

  renderIotPlanAppConfirmTeamBreakdown();
}

// ===== ตรวจสอบเจ้าของตู้ (ข้อมูลเก่า) — อ่าน view "iot_sn_ownership_check" ที่สร้างไว้ใน Supabase =====
// (เทียบ "เจ้าของที่ตั้งใจ" จากชีตเก่า+ชีตตู้ กับ "เจ้าของจริงที่เชื่อมต่อแอป" จากตาราง app_connections)
window.iotLegacyCheckRows = [];
window.iotLegacyCheckLoaded = false;

async function loadIotOwnershipCheck(forceReload) {
  if (!supabaseClient) return;
  if (iotLegacyCheckLoaded && !forceReload) { renderIotLegacyCheckSection(); return; }
  let rows = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseClient
      .from('iot_sn_ownership_check')
      .select('*')
      .range(from, from + pageSize - 1);
    if (error) {
      console.warn('โหลดข้อมูลตรวจสอบเจ้าของตู้ไม่สำเร็จ:', error.message);
      showToast('โหลดข้อมูลตรวจสอบเจ้าของตู้ไม่สำเร็จ: ' + error.message, 'warn');
      return;
    }
    rows = rows.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  iotLegacyCheckRows = rows;
  iotLegacyCheckLoaded = true;
  renderIotLegacyCheckSection();
}

// expose ฟังก์ชันของโมดูลนี้ให้ inline handlers และโมดูลอื่นเรียกผ่าน window ได้
Object.assign(window, {
  getAppMatchCategories, getIotSnCellHtml, getIotArCodeDisplay, getIotDocChecklistCellHtml, matchesIotPendingDocStatusFilter, populateIotPendingDocStatusOptions,
  renderIotFarmerMatchRows, matchesIotFarmerSearch, matchesIotAppOnlySearch, renderIotAppOnlyRows, matchesIotDocChecklistFilter, getFilteredIotPendingDoc,
  applyIotMatchPendingDocSearch, exportIotMatchPendingDocExcel, applyIotMatchOtodOnlySearch, applyIotMatchOtodConfirmedSearch, applyIotMatchInSyncSearch, applyIotMatchAppOnlySearch,
  renderIotAppMatchDashboard, setIotPlanLookback, renderIotPlanTimelineChart, renderIotPlanDashboard, renderIotPlanAppConfirmTeamBreakdown, iotPlanMatchRowHtml,
  renderIotPlanAppMatchSection, loadIotOwnershipCheck,
});
