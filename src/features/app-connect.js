// ===== ข้อมูลเชื่อมต่อแอป Kasetkorn + โหลดข้อมูล IoT หลัก + จับคู่กับ OTOD =====
// แยกมาจาก main.js เดิม — ตัวแปร/ฟังก์ชันแชร์ผ่าน window (โค้ดเดิมออกแบบเป็น global scope)
       // "ชื่อ|นามสกุล" (normalize แล้ว) -> [records]

function buildNameKey(first, last) {
  const f = normName(first);
  const l = normName(last);
  if (!f || !l) return ''; // ต้องมีทั้งชื่อและนามสกุลถึงจะใช้จับคู่ด้วยชื่อ (กันชื่อซ้ำมั่ว)
  return f + '|' + l;
}

function addToMultiMap(map, key, record) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(record);
}

async function loadAppConnections() {
  if (!supabaseClient) return;
  let rows = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseClient
      .from('app_connections')
      .select('*')
      .range(from, from + pageSize - 1);
    if (error) {
      console.warn('โหลดข้อมูลเชื่อมต่อแอปไม่สำเร็จ:', error.message);
      return;
    }
    rows = rows.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  appConnections = rows;
  appConnByNationalId = new Map();
  appConnByPhone = new Map();
  appConnByName = new Map();
  rows.forEach(c => {
    if (c.national_id) addToMultiMap(appConnByNationalId, c.national_id, c);
    if (c.phone) addToMultiMap(appConnByPhone, c.phone, c);
    const nameKey = buildNameKey(c.first_name, c.last_name);
    if (nameKey) addToMultiMap(appConnByName, nameKey, c);
  });
}

// คืนรายการ record ของแอป (ตู้/SN) ที่จับคู่ได้กับเกษตรกรคนนี้ (ตัดรายการซ้ำด้วย app_iot_id)
function getMatchedAppRecords(r) {
  const nid = (r.national_id || '').trim();
  const phone = (r.phone || '').trim();
  const nameKey = buildNameKey(r.first_name, r.last_name);

  const found = new Map(); // app_iot_id -> record (กันซ้ำ)
  (appConnByNationalId.get(nid) || []).forEach(rec => found.set(rec.app_iot_id, rec));
  (appConnByPhone.get(phone) || []).forEach(rec => found.set(rec.app_iot_id, rec));
  (appConnByName.get(nameKey) || []).forEach(rec => found.set(rec.app_iot_id, rec));
  return [...found.values()];
}

function isAppFarmerConnected(r) {
  return getMatchedAppRecords(r).length > 0;
}

// ใช้ในแท็บ "แผนติดตั้ง IoT" เพื่อโชว์ว่ารายชื่อในแผนนี้ เชื่อมต่อแอปแล้วหรือยัง (จับคู่ด้วยเลขบัตร/เบอร์เดียวกับแท็บตรวจสอบเชื่อมต่อแอป)
// เป็นข้อมูลแสดงผลอ้างอิงเท่านั้น ไม่ไปเปลี่ยนสถานะ "ติดตั้งแล้ว" ในแผนเองเด็ดขาด เพราะแอดมินต้องรอเอกสารลายเซ็นเกษตรกรยืนยันก่อนเสมอ
function getAppConfirmForPlanEntry(p) {
  const matched = getMatchedAppRecords({ national_id: p.nationalId, phone: p.phone });
  if (!matched.length) return null;
  const dates = matched.map(rec => rec.first_seen_at).filter(Boolean).sort();
  return { count: matched.length, firstSeenAt: dates[0] || null };
}

function getIotVisibleRows() {
  if (!iotProjectFilter) return allIotRows;
  return allIotRows.filter(r => (r[IOT_FIELDS.project] || 'ไม่ระบุโครงการ') === iotProjectFilter);
}

function populateIotProjectFilter(rows) {
  const projects = [...new Set(rows.map(r => r[IOT_FIELDS.project] || 'ไม่ระบุโครงการ'))].sort();
  const options = '<option value="">ทุกโครงการ</option>' + projects.map(p => `<option value="${p}">${p}</option>`).join('');
  ['iotProjectFilterDash', 'iotProjectFilterMap'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = options;
    sel.value = current;
  });
}

function applyIotProjectFilter(value) {
  iotProjectFilter = value || '';
  ['iotProjectFilterDash', 'iotProjectFilterMap'].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) sel.value = iotProjectFilter;
  });

  const rows = getIotVisibleRows();
  populateIotProvinceFilter(rows);
  renderIotKpis(rows);
  renderIotProvinceBreakdown(rows);
  applyIotFilters();
  renderIotScoreboard(rows);
  renderIotLeaderboard(rows);

  if (geoProvinces && allIotRows.length) {
    if (iotMapView === 'district' && iotCurrentProvinceCode && iotCurrentDistrictName) {
      zoomToIotDistrict(iotCurrentProvinceCode, iotCurrentDistrictName);
    } else if (iotMapView === 'province' && iotCurrentProvinceCode) {
      zoomToIotProvince(iotCurrentProvinceCode);
    } else {
      renderIotCountryProvinces();
    }
  }
}

async function loadIotData() {
  if (!supabaseClient) return;
  await Promise.all([loadAppConnections(), loadIotLegacyPendingMap(), loadIotSheetNotes(), loadIotCabinetSerials(), loadIotManualBaseCodes(), loadIotDocChecklist(), loadIotInstallBlockers(), loadDropdownOptions(), loadFieldSubmissions()]);
  renderDropdownManager();
  let rows = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseClient
      .from('iot_farmers')
      .select('*')
      .range(from, from + pageSize - 1)
      .order('farm_province', { ascending: true });
    if (error) {
      document.getElementById('iotMapSearchStatus').textContent = 'เกิดข้อผิดพลาดในการโหลดข้อมูล IoT: ' + error.message;
      return;
    }
    rows = rows.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  rows.forEach(r => {
    const matched = getMatchedAppRecords(r);
    r.app_connected = matched.length > 0;
    r.matched_sn = matched.map(rec => rec.app_iot_id).filter(Boolean).join(', ');
    // รหัสฐานที่ admin กรอกเองด้วยมือ (เคสจับคู่อัตโนมัติไม่เจอ เช่น ชื่อในแอปไม่ตรงกับคนที่ได้รับจริง) ให้ความสำคัญเป็นอันดับแรก
    // เพราะเป็นข้อมูลที่คนยืนยันเอง หนักแน่นกว่าการจับคู่อัตโนมัติจากชีตเก่าทุกกรณี
    const manualCode = findIotManualBaseCode(r);
    const legacyRec = findIotLegacyRecord(r);
    const effectiveBaseCode = manualCode ? manualCode.base_code : (legacyRec ? (formatIotArCode(legacyRec.base_code_no) || legacyRec.base_code || null) : null);
    const effectiveBaseCodeNo = manualCode ? manualCode.base_code_no : (legacyRec ? legacyRec.base_code_no : null);
    r.legacySerial = (effectiveBaseCodeNo !== null && effectiveBaseCodeNo !== undefined) ? (iotCabinetSerialByNo.get(effectiveBaseCodeNo) || null) : null;
    const legacyInstallInfo = findIotLegacyInstallInfo(r);
    r.legacyWaterPump = legacyInstallInfo.waterPump;
    r.legacyPipeSize = legacyInstallInfo.pipeSize;
    r.legacyPaymentStatus = legacyInstallInfo.paymentStatus;

    // ยังไม่ติดตั้งในระบบ OTOD ปัจจุบัน (N) แต่มีสัญญาณว่าได้รับตู้ไปแล้วจริงจาก 3 ทาง (เจอทางใดทางหนึ่งพอ):
    //   1) admin กรอกรหัสฐานเองด้วยมือ (หนักแน่นสุด เพราะคนยืนยันเอง)
    //   2) ข้อมูลเกษตรกร IoT ชุดเก่า (ชีต Google ก่อนมีระบบนี้) มีรหัสฐาน/ตู้แล้ว
    //   3) เชื่อมต่อแอป Kasetkorn แล้วและมี SN ตู้จริง (หนักแน่นกว่าอีก เพราะมี SN ยืนยันชัดเจน)
    // -> ถือว่าติดตั้งแล้วจริง (นับรวมในสถิติ/แผนที่/ตัดสิทธิ์เลือกซ้ำในแผนติดตั้งเหมือนติดตั้งแล้ว)
    // แต่จำไว้ว่าเป็น "รอยืนยันเอกสาร" เพื่อโชว์ป้ายแยกให้ทีมเห็นว่าไม่ใช่สถานะทางการของ OTOD จริงๆ
    if (r[IOT_FIELDS.status] === IOT_FIELDS.notDone) {
      if (effectiveBaseCode !== null) {
        r[IOT_FIELDS.status] = IOT_FIELDS.done;
        r.isLegacyPending = true;
        r.legacyBaseCode = effectiveBaseCode;
        if (manualCode) r.manualBaseCodeEntry = true;
      } else if (r.app_connected && r.matched_sn) {
        r[IOT_FIELDS.status] = IOT_FIELDS.done;
        r.isLegacyPending = true;
        r.legacyPendingViaApp = true;
      }
    }
  });
  allIotRows = rows;
  iotDataLoaded = true;
  populateIotProjectFilter(allIotRows);
  const visible = getIotVisibleRows();
  populateIotProvinceFilter(visible);
  renderIotKpis(visible);
  renderIotProvinceBreakdown(visible);
  applyIotFilters();
  renderIotScoreboard(visible);
  renderIotLeaderboard(visible);
  maybeRenderIotMap();
}

window.iotProvinceChart = null;

function renderIotKpis(rows) {
  const total = rows.length;
  const y = rows.filter(r => r[IOT_FIELDS.status] === IOT_FIELDS.done).length;
  const n = rows.filter(r => r[IOT_FIELDS.status] === IOT_FIELDS.notDone).length;
  const provinces = new Set(rows.map(r => r[IOT_FIELDS.province])).size;
  const byProvince = aggregateByProvince(rows, IOT_FIELDS.province, IOT_FIELDS.status, IOT_FIELDS.done, IOT_FIELDS.notDone);
  const fullProvinces = byProvince.filter(p => p.pct === 100).length;

  animateNumber(document.getElementById('iotKpiTotal'), total, 700);
  document.getElementById('iotKpiProvinces').textContent = provinces + ' จังหวัด';
  animateNumber(document.getElementById('iotKpiY'), y, 700);
  document.getElementById('iotKpiYPct').textContent = total ? Math.round((y / total) * 100) + '% ของทั้งหมด' : '-';
  animateNumber(document.getElementById('iotKpiN'), n, 700);
  document.getElementById('iotKpiNPct').textContent = total ? Math.round((n / total) * 100) + '% ของทั้งหมด' : '-';
  document.getElementById('iotKpiFullProvinces').textContent = fullProvinces + ' / ' + byProvince.length;

  const appConnectedCount = rows.filter(r => r.app_connected).length;
  const blockedCount = rows.filter(r => getIotInstallBlockerState(r)).length;
  renderIotDashStatusList({ total, y, n, appConnectedCount, blockedCount, provinces, fullProvinces });
}

// แถบสรุปสถานะด้านขวาของแดชบอร์ด IoT (โครงเดียวกับฝั่งอบรม)
function renderIotDashStatusList({ total, y, n, appConnectedCount, blockedCount, provinces, fullProvinces }) {
  const el = document.getElementById('iotDashStatusList');
  if (!el) return;
  const pct = (v) => (total ? Math.round((v / total) * 100) + '%' : '');
  const rows = [
    { ico: 'done', label: 'ติดตั้งแล้ว', cls: 'stat-ok', value: y, sub: pct(y) },
    { ico: 'not-allowed', label: 'ยังไม่ติดตั้ง', cls: 'stat-danger', value: n, sub: pct(n) },
    { ico: 'signal', label: 'เชื่อมต่อแอปแล้ว', cls: 'stat-info', value: appConnectedCount, sub: pct(appConnectedCount) },
    { ico: 'blocked', label: 'ติดตั้งไม่ได้', cls: 'stat-attn', value: blockedCount, sub: '', click: "switchTab('iot-blockers')", title: 'คลิกเพื่อดูรายชื่อ/เหตุผล' },
    { ico: 'pin', label: 'จังหวัดที่มีข้อมูล', cls: 'stat-neutral', value: provinces, sub: '' },
    { ico: 'trophy', label: 'จังหวัดครบ 100%', cls: 'stat-ok', value: fullProvinces, sub: '' },
  ];
  el.innerHTML = rows.map(r => `
    <div class="rail-row${r.click ? ' is-click' : ''}"${r.click ? ` onclick="${r.click}" title="${r.title}" style="cursor:pointer;"` : ''}>
      <span class="stat ${r.cls} has-ico">${icon(r.ico, 13)}</span>
      <span class="rail-label">${r.label}</span>
      <span class="rail-count">${r.value.toLocaleString()}</span>
      ${r.sub ? `<span class="chip-pct">${r.sub}</span>` : ''}
    </div>
  `).join('');
}

function renderIotProvinceBreakdown(rows) {
  const byProvince = aggregateByProvince(rows, IOT_FIELDS.province, IOT_FIELDS.status, IOT_FIELDS.done, IOT_FIELDS.notDone);

  const tbody = document.getElementById('iotProvinceTbody');
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
  const rankEl = document.getElementById('iotProvinceRankList');
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

  const ctx = document.getElementById('iotProvinceChart').getContext('2d');
  const labels = byProvince.map(p => p.province);
  const yData = byProvince.map(p => p.Y);
  const nData = byProvince.map(p => p.N);

  if (iotProvinceChart) iotProvinceChart.destroy();
  iotProvinceChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'ติดตั้งแล้ว', data: yData, backgroundColor: '#3ba68a', borderRadius: 5, maxBarThickness: 26 },
        { label: 'ยังไม่ติดตั้ง', data: nData, backgroundColor: '#d94a40', borderRadius: 5, maxBarThickness: 26 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
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

function populateIotProvinceFilter(rows) {
  const sel = document.getElementById('iotFilterProvince');
  const current = sel.value;
  const provinces = [...new Set(rows.map(r => r[IOT_FIELDS.province]).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">ทั้งหมด</option>' + provinces.map(p => `<option value="${p}">${p}</option>`).join('');
  sel.value = current;
}

function getIotFiltered() {
  const province = document.getElementById('iotFilterProvince').value;
  const status = document.getElementById('iotFilterStatus').value;
  const appConn = document.getElementById('iotFilterAppConnected').value;
  const search = document.getElementById('iotFilterSearch').value.trim().toLowerCase();

  return getIotVisibleRows().filter(r => {
    if (province && r[IOT_FIELDS.province] !== province) return false;
    if (status && r[IOT_FIELDS.status] !== status) return false;
    if (appConn === 'Y' && !r.app_connected) return false;
    if (appConn === 'N' && r.app_connected) return false;
    if (search) {
      const hay = `${r.first_name||''} ${r.last_name||''} ${r.national_id||''}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

function applyIotFilters() {
  const filtered = getIotFiltered();
  document.getElementById('iotDetailCountBadge').textContent = filtered.length.toLocaleString() + ' รายการ';

  const tbody = document.getElementById('iotTbody');
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="13" class="empty-state-cell">
      <div class="empty">
        <span class="empty-ico">${icon('search', 20)}</span>
        <span class="empty-title">ไม่พบรายการที่ตรงกับตัวกรอง</span>
        <span class="empty-text">ลองปรับตัวกรองหรือคำค้นดูใหม่นะครับ</span>
      </div></td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td class="cell-strong">${r.first_name||''}</td>
      <td>${r.last_name||''}</td>
      <td>${getIotStatusDisplayHtml(r)}</td>
      <td>${r.app_connected ? '<span class="stat stat-info has-ico">' + icon('signal', 12) + ' เชื่อมต่อแล้ว</span>' : '<span class="stat stat-neutral">ยังไม่เชื่อมต่อ</span>'}</td>
      <td class="cell-muted">${r.reference_id||''}</td>
      <td class="cell-muted">${r.prefix||''}</td>
      <td class="num">${r.national_id||''}</td>
      <td class="num">${r.phone||''}</td>
      <td>${r.farm_province||''}</td>
      <td>${r.farm_district||''}</td>
      <td>${r.farm_subdistrict||''}</td>
      <td class="cell-muted">${r.matched_sn||''}</td>
      <td class="cell-muted">${r.approval_round||''}</td>
    </tr>
  `).join('');
}

function exportIotCsv() {
  const filtered = getIotFiltered();
  const headers = ['รหัสอ้างอิง','คำนำหน้า','ชื่อ','นามสกุล','เลขบัตรประชาชน','เบอร์มือถือ','จังหวัด','อำเภอ','ตำบล','สถานะ','เชื่อมต่อแอป','SN ตู้ (จากแอป)','รอบการอนุมัติ'];
  const rows = filtered.map(r => [r.reference_id,r.prefix,r.first_name,r.last_name,r.national_id,r.phone,r.farm_province,r.farm_district,r.farm_subdistrict,r.status,(r.app_connected ? 'เชื่อมต่อแล้ว' : 'ยังไม่เชื่อมต่อ'),r.matched_sn,r.approval_round]);
  const csv = [headers, ...rows].map(row => row.map(v => `"${(v??'').toString().replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'iot_farmers_export.csv';
  link.click();
}

window.IOT_QA_FALLBACK_MESSAGE = 'ขอโทษครับ ยังไม่เข้าใจคำถามนี้ ลองถามแบบ "จังหวัดเลยติดตั้งไปกี่คน" หรือ "จังหวัดไหนติดตั้งน้อยที่สุด" หรือพิมพ์เลขบัตรประชาชนเพื่อค้นหาคนได้ครับ';

function answerIotQuestion(qRaw) {
  const q = (qRaw || '').trim();
  if (!q) return 'พิมพ์คำถามก่อนนะครับ';

  const iotRowsQ = getIotVisibleRows();
  const byProvince = aggregateByProvince(iotRowsQ, IOT_FIELDS.province, IOT_FIELDS.status, IOT_FIELDS.done, IOT_FIELDS.notDone);
  const byDistrict = aggregateByProvinceDistrict(iotRowsQ, IOT_FIELDS.province, IOT_FIELDS.district, IOT_FIELDS.status, IOT_FIELDS.done, IOT_FIELDS.notDone);

  const idMatch = q.match(/\d{5,}/);
  if (idMatch) {
    const needle = idMatch[0];
    const found = iotRowsQ.find(r => (r.national_id || '').includes(needle));
    if (found) {
      const statusText = found[IOT_FIELDS.status] === IOT_FIELDS.done ? 'ติดตั้งแล้ว ': 'ยังไม่ติดตั้ง ';
      return `พบข้อมูล: ${found.prefix || ''}${found.first_name || ''} ${found.last_name || ''} — จังหวัด${found[IOT_FIELDS.province]} อำเภอ${found[IOT_FIELDS.district]} ตำบล${found.farm_subdistrict || ''} — สถานะ: ${found.status || ''} (${statusText})`;
    }
    return `ไม่พบข้อมูลที่ตรงกับเลข "${needle}"`;
  }

  const provinces = byProvince.map(p => p.province);
  const mentionedProvince = provinces.find(p => q.includes(p));
  const districtsInProvince = mentionedProvince ? byDistrict.filter(d => normName(d.province) === normName(mentionedProvince)) : [];
  const mentionedDistrict = districtsInProvince.find(d => q.includes(d.district));

  const wantsMin = /น้อยที่สุด|แย่ที่สุด|ต่ำสุด|ต้องติดตาม/.test(q);
  const wantsMax = /มากที่สุด|ดีที่สุด|สูงสุด|เยอะที่สุด/.test(q);
  const wantsOverview = /ภาพรวม|สรุป|ทั้งหมด|ทั่วประเทศ/.test(q);

  if (wantsMin && !mentionedProvince) {
    const worst = byProvince.slice().sort((a, b) => a.pct - b.pct)[0];
    return `จังหวัดที่ติดตั้งสำเร็จน้อยที่สุดคือ ${worst.province} (${worst.pct}% — ติดตั้งแล้ว ${worst.Y} จากทั้งหมด ${worst.total} คน)`;
  }
  if (wantsMax && !mentionedProvince) {
    const best = byProvince.slice().sort((a, b) => b.pct - a.pct)[0];
    return `จังหวัดที่ติดตั้งสำเร็จมากที่สุดคือ ${best.province} (${best.pct}%)`;
  }
  if (mentionedProvince && wantsMin && districtsInProvince.length) {
    const worstD = districtsInProvince.slice().sort((a, b) => a.pct - b.pct)[0];
    return `ใน${mentionedProvince} อำเภอที่ยังต้องติดตามมากที่สุดคือ ${worstD.district} (${worstD.pct}% — ยังไม่ติดตั้ง ${worstD.N} คน)`;
  }
  if (mentionedProvince && wantsMax && districtsInProvince.length) {
    const bestD = districtsInProvince.slice().sort((a, b) => b.pct - a.pct)[0];
    return `ใน${mentionedProvince} อำเภอที่ติดตั้งสำเร็จมากที่สุดคือ ${bestD.district} (${bestD.pct}%)`;
  }

  if (mentionedDistrict) {
    return `อำเภอ${mentionedDistrict.district} จังหวัด${mentionedProvince}: ติดตั้งแล้ว ${mentionedDistrict.Y} คน · ยังไม่ติดตั้ง ${mentionedDistrict.N} คน · รวม ${mentionedDistrict.total} คน (${mentionedDistrict.pct}%)`;
  }

  if (mentionedProvince) {
    const p = byProvince.find(x => x.province === mentionedProvince);
    return `จังหวัด${mentionedProvince}: ติดตั้งแล้ว ${p.Y} คน · ยังไม่ติดตั้ง ${p.N} คน · รวม ${p.total} คน (${p.pct}%)`;
  }

  if (wantsOverview) {
    const total = iotRowsQ.length;
    const y = iotRowsQ.filter(r => r[IOT_FIELDS.status] === IOT_FIELDS.done).length;
    const n = total - y;
    return `ภาพรวมทั้งหมด: เกษตรกร ${total.toLocaleString()} คน · ติดตั้งแล้ว ${y.toLocaleString()} คน (${total ? Math.round(y / total * 100) : 0}%) · ยังไม่ติดตั้ง ${n.toLocaleString()} คน · ครอบคลุม ${byProvince.length} จังหวัด`;
  }

  return IOT_QA_FALLBACK_MESSAGE;
}

function buildIotQaContext() {
  const iotRowsCtx = getIotVisibleRows();
  const byProvince = aggregateByProvince(iotRowsCtx, IOT_FIELDS.province, IOT_FIELDS.status, IOT_FIELDS.done, IOT_FIELDS.notDone);
  const byDistrict = aggregateByProvinceDistrict(iotRowsCtx, IOT_FIELDS.province, IOT_FIELDS.district, IOT_FIELDS.status, IOT_FIELDS.done, IOT_FIELDS.notDone);
  const total = iotRowsCtx.length;
  const y = iotRowsCtx.filter(r => r[IOT_FIELDS.status] === IOT_FIELDS.done).length;
  return {
    topic: 'สถานะการติดตั้งอุปกรณ์ IoT ในสวนทุเรียน (ไม่ใช่ข้อมูลอบรม)',
    total,
    installed: y,
    notInstalled: total - y,
    note: 'ไม่มีข้อมูลวันเวลานัดหมายติดตั้งจริง มีแค่จำนวนคนแบ่งตามจังหวัด/อำเภอที่ตั้งสวนและสถานะขั้นตอนปัจจุบัน ใช้ความรู้ภูมิศาสตร์ทั่วไปของประเทศไทยช่วยแนะนำการจัดกลุ่มพื้นที่ใกล้เคียงกันได้ แต่ต้องบอกผู้ใช้ว่าเป็นการประมาณคร่าวๆ',
    byProvince: byProvince.map(p => ({ province: p.province, Y: p.Y, N: p.N, pct: p.pct })),
    byDistrict: byDistrict.map(d => ({ province: d.province, district: d.district, Y: d.Y, N: d.N, pct: d.pct })),
  };
}

function askIotPreset(text) {
  document.getElementById('iotQaInput').value = text;
  askIotQuestion();
}

async function askIotQuestion() {
  const input = document.getElementById('iotQaInput');
  const q = input.value.trim();
  if (!q) return;
  if (!allIotRows.length) {
    appendQaMessage(q, 'user', 'iotQaLog');
    appendQaMessage('ข้อมูลยังโหลดไม่เสร็จ กรุณารอสักครู่แล้วลองใหม่ครับ', 'bot', 'iotQaLog');
    input.value = '';
    return;
  }
  appendQaMessage(q, 'user', 'iotQaLog');
  input.value = '';

  const ruleBasedAnswer = answerIotQuestion(q);
  if (ruleBasedAnswer !== IOT_QA_FALLBACK_MESSAGE) {
    appendQaMessage(ruleBasedAnswer, 'bot', 'iotQaLog');
    return;
  }

  const thinkingEl = appendQaMessage('กำลังคิดคำตอบ...', 'bot', 'iotQaLog');
  const aiAnswer = await tryAiAnswer(q, buildFullQaContext());
  if (thinkingEl) thinkingEl.remove();
  appendQaMessage(aiAnswer || ruleBasedAnswer, 'bot', 'iotQaLog');
}

function maybeRenderIotMap() {
  if (geoProvinces && allIotRows.length) {
    document.getElementById('iotMapLoading').style.display = 'none';
    document.getElementById('iotSvg').style.display = 'block';
    renderIotCountryProvinces();
  }
}

function provinceNameFromIotCode(code) {
  if (!code || typeof geoProvinces === 'undefined' || !geoProvinces) return '';
  const f = geoProvinces.features.find(x => x.properties.pro_code === code);
  return f ? f.properties.pro_th : '';
}
// scoreboard ปรับตามขอบเขตที่กำลังดูบนแผนที่: ทั้งประเทศ / จังหวัดที่กดเข้า / อำเภอที่กดเข้า
function renderIotScoreboard() {
  const all = getIotVisibleRows();
  let rows = all, label = 'ผลรวมทั่วประเทศ';
  if (iotMapView === 'province' && iotCurrentProvinceCode) {
    const pv = provinceNameFromIotCode(iotCurrentProvinceCode);
    rows = all.filter(r => normName(r[IOT_FIELDS.province]) === normName(pv));
    label = 'จังหวัด' + pv;
  } else if (iotMapView === 'district' && iotCurrentProvinceCode && iotCurrentDistrictName) {
    const pv = provinceNameFromIotCode(iotCurrentProvinceCode);
    rows = all.filter(r => normName(r[IOT_FIELDS.province]) === normName(pv) && normName(r[IOT_FIELDS.district]) === normName(iotCurrentDistrictName));
    label = pv + ' · ' + iotCurrentDistrictName;
  }
  const y = rows.filter(r => r[IOT_FIELDS.status] === IOT_FIELDS.done).length;
  const n = rows.filter(r => r[IOT_FIELDS.status] === IOT_FIELDS.notDone).length;
  const total = y + n;
  const pctY = total ? Math.round((y / total) * 100) : 50;
  const pctN = 100 - pctY;
  const scopeEl = document.getElementById('iotScoreScope');
  if (scopeEl) scopeEl.textContent = label;

  animateNumber(document.getElementById('iotScoreY'), y, 900);
  animateNumber(document.getElementById('iotScoreN'), n, 900);
  document.getElementById('iotScoreBarY').style.width = pctY + '%';
  document.getElementById('iotScoreBarN').style.width = pctN + '%';
  document.getElementById('iotScorePctY').textContent = pctY + '%';
  document.getElementById('iotScorePctN').textContent = pctN + '%';
}

function renderIotLeaderboard(rows) {
  const byProvince = aggregateByProvince(rows, IOT_FIELDS.province, IOT_FIELDS.status, IOT_FIELDS.done, IOT_FIELDS.notDone)
    .slice().sort((a, b) => b.pct - a.pct || b.total - a.total);
  const rankClass = (i) => i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
  const el = document.getElementById('iotLeaderboard');
  el.innerHTML = byProvince.map((p, i) => `
    <div class="lb-row" onclick="zoomToIotProvinceByName('${p.province}')">
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

function renderIotDistrictLeaderboard(provName, pro_code) {
  const byDistrict = aggregateByProvinceDistrict(getIotVisibleRows(), IOT_FIELDS.province, IOT_FIELDS.district, IOT_FIELDS.status, IOT_FIELDS.done, IOT_FIELDS.notDone)
    .filter(d => normName(d.province) === normName(provName))
    .slice()
    .sort((a, b) => b.pct - a.pct || b.total - a.total);
  const rankClass = (i) => i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
  const el = document.getElementById('iotLeaderboard');
  document.getElementById('iotLbTitle').textContent = 'อันดับอำเภอ (% ติดตั้งแล้ว) · ' + provName;
  const multiBtn = document.getElementById('iotLbMultiDistrictBtn');
  multiBtn.style.display = 'block';
  multiBtn.setAttribute('onclick', `showIotProvinceAllDistrictsPeople('${provName.replace(/'/g, "\\'")}')`);
  el.innerHTML = byDistrict.map((d, i) => `
    <div class="lb-row" data-district="${d.district}" onclick="zoomToIotDistrict('${pro_code}','${d.district}')">
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

function restoreIotProvinceLeaderboard() {
  document.getElementById('iotLbTitle').textContent = 'อันดับจังหวัด (% ติดตั้งแล้ว)';
  document.getElementById('iotLbMultiDistrictBtn').style.display = 'none';
  renderIotLeaderboard(getIotVisibleRows());
}

function renderIotCountryProvinces() {
  const g = document.getElementById('iotMapG');
  const byProvince = aggregateByProvince(getIotVisibleRows(), IOT_FIELDS.province, IOT_FIELDS.status, IOT_FIELDS.done, IOT_FIELDS.notDone);
  g.innerHTML = geoProvinces.features.map(f => {
    const name = f.properties.pro_th;
    const code = f.properties.pro_code;
    const d = countryPathGen(f);
    const agg = byProvince.find(p => normName(p.province) === normName(name));
    if (!agg) {
      return `<path class="prov-path no-data" data-code="${code}" d="${d}"><title>${name}</title></path>`;
    }
    const b = countryPathGen.bounds(f);
    const fillMarkup = fillClipMarkup(d, b, agg.pct, 'iotprov-' + code);
    return `<g class="prov-path has-data" data-code="${code}" onclick="zoomToIotProvince('${code}')"><title>${name}: ${agg.pct}% ติดตั้งแล้ว (Y ${agg.Y} · N ${agg.N})</title>${fillMarkup}<path class="prov-outline" d="${d}"></path></g>`;
  }).join('');
  applyIotMapHomeBox(byProvince);
  renderIotCountryLabels();
}

// ตั้ง "กรอบบ้าน" ของแผนที่ IoT จากจังหวัดที่มีข้อมูล = มุมมองเริ่มต้น + ซูมออกได้ไม่เกินนี้
// ทำครั้งเดียวตอนวาดประเทศครั้งแรก (ถ้าผู้ใช้กำลังดูจังหวัด/อำเภออยู่ ไม่ต้องเด้งกลับ)
function applyIotMapHomeBox(byProvince) {
  if (typeof computeGeoHomeBox !== 'function') return;
  const dataNames = new Set((byProvince || []).map(p => normName(p.province)));
  const feats = geoProvinces.features.filter(f => dataNames.has(normName(f.properties.pro_th)));
  const home = computeGeoHomeBox(feats, countryPathGen.bounds);
  setGeoHomeBox('iotSvg', home);
  if (iotMapView === 'country') {
    iotCurrentViewBox = home.slice();
    const svg = document.getElementById('iotSvg');
    if (svg) svg.setAttribute('viewBox', home.join(' '));
    if (typeof geoRepositionLabels === 'function') geoRepositionLabels('iotSvg');
  }
}

// ป้ายชื่อจังหวัดครบทั้งประเทศ (จังหวัดไม่มีข้อมูล = ตัวเทาจาง) เหมือนฝั่งอบรม
function renderIotCountryLabels() {
  const labelLayer = document.getElementById('iotLabelLayer');
  const dataProvinceNames = new Set(getIotVisibleRows().map(r => normName(r[IOT_FIELDS.province])));
  labelLayer.innerHTML = geoProvinces.features
    .filter(f => dataProvinceNames.has(normName(f.properties.pro_th)))
    .map(f => {
      const fit = labelFit(f);
      const fs = provinceLabelFontSize(f, fit);
      return `<text class="map-label" x="${fit.pt[0]}" y="${fit.pt[1]}" font-size="${fs.toFixed(2)}">${f.properties.pro_th}</text>`;
    }).join('');
}

function animateIotViewBox(target, duration, onDone) {
  if (iotViewBoxAnimId) cancelAnimationFrame(iotViewBoxAnimId);
  const svg = document.getElementById('iotSvg');
  const start = iotCurrentViewBox.slice();
  const startTime = performance.now();

  function frame(now) {
    const t = Math.min(1, (now - startTime) / duration);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const cur = start.map((s, i) => s + (target[i] - s) * eased);
    svg.setAttribute('viewBox', cur.join(' '));
    if (t < 1) {
      iotViewBoxAnimId = requestAnimationFrame(frame);
    } else {
      iotCurrentViewBox = target.slice();
      iotViewBoxAnimId = null;
      if (onDone) onDone();
    }
  }
  iotViewBoxAnimId = requestAnimationFrame(frame);
}

function zoomToIotProvinceByName(name) {
  const code = provinceNameToCode[normName(name)];
  if (code) zoomToIotProvince(code);
}

function zoomToIotProvince(pro_code, cb) {
  if (!geoProvinces) return;
  const provFeature = geoProvinces.features.find(f => f.properties.pro_code === pro_code);
  if (!provFeature) return;
  const provName = provFeature.properties.pro_th;

  iotMapView = 'province';
  iotCurrentProvinceCode = pro_code;
  setProvinceFocus('iotMapG', pro_code);
  iotCurrentDistrictName = null;

  document.getElementById('iotDistrictLayer').innerHTML = '';
  document.getElementById('iotLabelLayer').innerHTML = '';
  document.getElementById('iotMapLabelsHtml').innerHTML = '';
  document.getElementById('iotPeoplePanel').style.display = 'none';
  document.getElementById('iotMapBackBtn').classList.add('visible');
  const titleOverlay = document.getElementById('iotMapTitleOverlay');
  titleOverlay.style.display = 'block';
  titleOverlay.textContent = provName;
  renderIotScoreboard(); // อัปเดตกราฟสรุปด้านบนให้เป็นยอดของจังหวัดนี้

  const b = countryPathGen.bounds(provFeature);
  const target = fitViewBoxToBounds(b[0][0], b[0][1], b[1][0], b[1][1], 1.25);
  renderNeighborProvinceLabels('iotLabelLayer', pro_code, target, new Set(getIotVisibleRows().map(r => normName(r[IOT_FIELDS.province]))));
  setGeoFocusGuard('iotSvg', target[2] * 2, backToIotCountryMap);

  animateIotViewBox(target, 500, () => {
    const districtFeatures = geoDistricts.features.filter(f => f.properties.pro_code === pro_code);
    const ourDistricts = aggregateByProvinceDistrict(getIotVisibleRows(), IOT_FIELDS.province, IOT_FIELDS.district, IOT_FIELDS.status, IOT_FIELDS.done, IOT_FIELDS.notDone)
      .filter(d => normName(d.province) === normName(provName));
    const ourDistrictMap = {};
    ourDistricts.forEach(d => { ourDistrictMap[normName(d.district)] = d; });

    let matched = 0;
    const districtLayer = document.getElementById('iotDistrictLayer');
    districtLayer.innerHTML = districtFeatures.map((f, i) => {
      const name = f.properties.amp_th;
      const match = ourDistrictMap[normName(name)];
      const d = countryPathGen(f);
      if (!match) {
        return `<path class="dist-path-flat dist-appear" style="--d:${(i * 55).toFixed(0)}ms" d="${d}" fill="#e9ece9"><title>${name}</title></path>`;
      }
      matched++;
      const b = countryPathGen.bounds(f);
      const fillMarkup = fillClipMarkup(d, b, match.pct, 'iotdist-' + f.properties.amp_code);
      const title = `${name}: Y ${match.Y} · N ${match.N} · รวม ${match.total} (${match.pct}%)`;
      return `<g class="dist-path dist-appear" style="--d:${(i * 55).toFixed(0)}ms" onclick="zoomToIotDistrict('${pro_code}','${name}')"><title>${title}</title>${fillMarkup}<path class="dist-outline" d="${d}"></path></g>`;
    }).join('') + `<path class="prov-focus-outline" d="${countryPathGen(provFeature)}"></path>`;

    function dbgCP(s) { return Array.from(s || '').map(c => c.codePointAt(0).toString(16)).join(' '); }
    console.log('[iot-debug] === ' + provName + ' ===');
    console.log('[iot-debug] GEO district names (จาก geojson):');
    districtFeatures.forEach(f => console.log('  "' + f.properties.amp_th + '"  codepoints: ' + dbgCP(f.properties.amp_th)));
    console.log('[iot-debug] OUR district names (จากตาราง iot_farmers):');
    ourDistricts.forEach(d => console.log('  "' + d.district + '"  codepoints: ' + dbgCP(d.district) + '  (Y=' + d.Y + ' N=' + d.N + ')'));

    const matchedFeatures = districtFeatures.filter(f => ourDistrictMap[normName(f.properties.amp_th)]);
    renderIotDistrictHtmlLabels(matchedFeatures);
    renderIotDistrictLeaderboard(provName, pro_code);

    titleOverlay.textContent = provName + ' · จับคู่ข้อมูลได้ ' + matched + '/' + ourDistricts.length + ' อำเภอ';
    document.getElementById('iotMapCaption').textContent = 'สีเขียว = ติดตั้งแล้วมากกว่า · สีแดง = ยังไม่ติดตั้งมากกว่า · เทาอ่อน = ไม่มีข้อมูล (กดไม่ได้) · คลิกอำเภอสีเขียว/แดงเพื่อดูรายชื่อ';
    if (cb) cb();
  });
}

function renderIotDistrictHtmlLabels(districtFeatures) {
  const container = document.getElementById('iotMapLabelsHtml');
  const areas = districtFeatures.map(f => { const b = countryPathGen.bounds(f); return (b[1][0] - b[0][0]) * (b[1][1] - b[0][1]); });
  const maxA = Math.max(...areas, 1);
  container.innerHTML = districtFeatures.map((f, i) => {
    const [cx, cy] = labelPoint(f);
    const fs = Math.max(8.5, Math.min(13.5, 8 + 5.5 * Math.sqrt(areas[i] / maxA)));
    return `<div class="html-label" data-cx="${cx}" data-cy="${cy}" style="font-size:${fs.toFixed(1)}px;">${f.properties.amp_th}</div>`;
  }).join('');
  geoRepositionLabels('iotSvg');
}

function zoomToIotDistrict(pro_code, districtName, cb) {
  geoHighlightDistrict('#tab-iot-map', districtName);
  const distFeature = geoDistricts.features.find(f => f.properties.pro_code === pro_code && normName(f.properties.amp_th) === normName(districtName));
  if (!distFeature) return;
  const provFeature = geoProvinces.features.find(f => f.properties.pro_code === pro_code);
  const provName = provFeature ? provFeature.properties.pro_th : '';

  iotMapView = 'district';
  iotCurrentProvinceCode = pro_code;
  iotCurrentDistrictName = districtName;
  setProvinceFocus('iotMapG', pro_code);
  renderIotScoreboard(); // อัปเดตกราฟสรุปด้านบนให้เป็นยอดของอำเภอนี้

  const b = countryPathGen.bounds(distFeature);
  const target = fitViewBoxToBounds(b[0][0], b[0][1], b[1][0], b[1][1], 1.9);

  const titleOverlay = document.getElementById('iotMapTitleOverlay');
  titleOverlay.textContent = districtName + ' · ' + provName;

  renderNeighborProvinceLabels('iotLabelLayer', pro_code, target, new Set(getIotVisibleRows().map(r => normName(r[IOT_FIELDS.province]))));
  if (provFeature) {
    const pb = countryPathGen.bounds(provFeature);
    setGeoFocusGuard('iotSvg', fitViewBoxToBounds(pb[0][0], pb[0][1], pb[1][0], pb[1][1], 1.25)[2] * 2, backToIotCountryMap);
  }
  document.getElementById('iotMapLabelsHtml').innerHTML = '';
  animateIotViewBox(target, 450, () => {
    const districtFeatures = geoDistricts.features.filter(f => f.properties.pro_code === pro_code);
    const ourDistricts = aggregateByProvinceDistrict(getIotVisibleRows(), IOT_FIELDS.province, IOT_FIELDS.district, IOT_FIELDS.status, IOT_FIELDS.done, IOT_FIELDS.notDone)
      .filter(d => normName(d.province) === normName(provName));
    const ourDistrictMap = {};
    ourDistricts.forEach(d => { ourDistrictMap[normName(d.district)] = d; });
    const matchedFeatures = districtFeatures.filter(f => ourDistrictMap[normName(f.properties.amp_th)]);
    renderIotDistrictHtmlLabels(matchedFeatures);

    showIotDistrictPeople(provName, districtName);
    if (cb) cb();
  });
}

function backOneIotLevel() {
  geoHighlightDistrict('#tab-iot-map', null);
  if (iotMapView === 'district') {
    zoomToIotProvince(iotCurrentProvinceCode);
  } else if (iotMapView === 'province') {
    backToIotCountryMap();
  }
}

function backToIotCountryMap() {
  geoHighlightDistrict('#tab-iot-map', null);
  iotMapView = 'country';
  iotCurrentProvinceCode = null;
  iotCurrentDistrictName = null;
  setProvinceFocus('iotMapG', null);
  setGeoFocusGuard('iotSvg', null);
  renderIotScoreboard(); // กลับมาดูยอดทั้งประเทศ
  document.getElementById('iotMapBackBtn').classList.remove('visible');
  document.getElementById('iotMapTitleOverlay').style.display = 'none';
  document.getElementById('iotMapCaption').textContent = 'ขอบเขตจริงจาก OpenGISData-Thailand · ตำแหน่งอ้างอิงจากที่ตั้งสวน';
  document.getElementById('iotPeoplePanel').style.display = 'none';

  document.getElementById('iotMapLabelsHtml').innerHTML = '';
  restoreIotProvinceLeaderboard();
  animateIotViewBox(getGeoHomeBox('iotSvg'), 500, () => {
    document.getElementById('iotDistrictLayer').innerHTML = '';
    renderIotCountryLabels();
  });
}

// ตารางรายชื่อบนหน้าแผนที่ = อ่านอย่างเดียว ไม่มีการนัดตรงนี้แล้ว
// กลุ่ม "ยังไม่ติดตั้ง" (opts.callable) จะมีทางลัดไปเมนูโทรนัด: กดทั้งอำเภอ หรือกดรายคน
function renderIotPeopleGroup(title, icon, cls, groupRows, highlightId, opts) {
  opts = opts || {};
  const callable = !!(opts.callable || opts.selectable);   // selectable = ชื่อเดิม รองรับไว้กันโค้ดเก่าเรียก
  const groupId = opts.groupId || '';
  const esc = (s) => String(s || '').replace(/'/g, "\\'");
  const provJs = esc(opts.province), distJs = esc(opts.district);
  const colspan = callable ? 8 : 7;
  return `
    <div class="people-group">
      <div class="people-group-title ${cls}">${icon} ${title} <span class="badge">${groupRows.length} คน</span></div>
      ${callable && groupRows.length ? `
        <div class="people-group-actions">
          <button class="btn btn-brand btn-xs" onclick="goToIotCallArea('${provJs}','${distJs}')" title="เปิดเมนูโทรนัด พร้อมกรองเฉพาะพื้นที่นี้ให้เลย">
            <i data-icon="phone" data-size="14"></i> โทรนัดทั้งอำเภอนี้ (${groupRows.length} คน) →
          </button>
        </div>
      ` : ''}
      <div class="table-wrap" style="max-height:280px;">
        <table class="detail-table">
          <thead>
            <tr>
              <th>ชื่อ-นามสกุล</th><th class="col-extra">เลขบัตรประชาชน</th><th class="col-extra">เบอร์มือถือ</th><th>ตำบล</th>
              <th>สถานะ</th><th class="col-extra">SN ตู้</th><th class="col-extra">รอบการอนุมัติ</th>
              ${callable ? '<th style="width:96px;"></th>' : ''}
            </tr>
          </thead>
          <tbody id="${groupId ? groupId + 'Tbody' : ''}">
            ${groupRows.length ? groupRows.map(p => {
              const nidSafe = esc(p.national_id);
              const nameTxt = `${p.prefix || ''}${p.first_name || ''} ${p.last_name || ''}`;
              return `
              <tr class="${highlightId && p.national_id === highlightId ? 'row-highlight' : ''}" id="${highlightId && p.national_id === highlightId ? 'highlightedIotPersonRow' : ''}">
                <td>${callable
                  ? `<a class="iot-map-name-call" onclick="goToIotCallPerson('${nidSafe}')" title="ไปหน้าโทรนัดของคนนี้">${nameTxt}</a>`
                  : nameTxt}</td>
                <td class="col-extra">${p.national_id || ''}</td>
                <td class="col-extra">${p.phone || ''}</td>
                <td>${p.farm_subdistrict || ''}</td>
                <td>${getIotStatusDisplayHtml(p)}</td>
                <td class="col-extra">${getIotSnCellHtml(p)}</td>
                <td class="col-extra">${p.approval_round || ''}</td>
                ${callable ? `<td><button class="btn btn-outline btn-xs" onclick="goToIotCallPerson('${nidSafe}')"><i data-icon="phone" data-size="13"></i> โทรนัด</button></td>` : ''}
              </tr>
            `; }).join('') : `<tr><td colspan="${colspan}" style="text-align:center; opacity:.6;">ไม่มีข้อมูล</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ===== โหมดกรอกรายละเอียดติดตั้งบนหน้าแผนที่ (กดที่ชื่อคนเพื่อกาง/พับ) =====
// เก็บ nid ที่กางอยู่ไว้ใน Set เพื่อให้พาแนลวาดใหม่แล้วยังกางค้างอยู่ (เช่นหลังกด "เพิ่มเข้าแผน")
window.iotMapExpandedNids = new Set();

function toggleIotMapPersonDetail(nid) {
  const row = document.getElementById('iotMapDetailRow_' + nid);
  const body = document.getElementById('iotMapDetailBody_' + nid);
  if (!row || !body) return;
  const show = !iotMapExpandedNids.has(nid);
  if (show) {
    iotMapExpandedNids.add(nid);
    body.innerHTML = iotMapDetailEditorInner(nid);
    row.style.display = '';
  } else {
    iotMapExpandedNids.delete(nid);
    row.style.display = 'none';
  }
  // อัปเดตลูกศรหน้า/หลังชื่อ
  const link = document.querySelector(`.iot-map-name-toggle[onclick*="'${nid}'"] .caret`);
  if (link) link.classList.toggle('open', show);
}

// expose ฟังก์ชันของโมดูลนี้ให้ inline handlers และโมดูลอื่นเรียกผ่าน window ได้
Object.assign(window, {
  buildNameKey, addToMultiMap, loadAppConnections, getMatchedAppRecords, isAppFarmerConnected, getAppConfirmForPlanEntry,
  getIotVisibleRows, populateIotProjectFilter, applyIotProjectFilter, loadIotData, renderIotKpis, renderIotProvinceBreakdown,
  populateIotProvinceFilter, getIotFiltered, applyIotFilters, exportIotCsv, answerIotQuestion, buildIotQaContext,
  askIotPreset, askIotQuestion, maybeRenderIotMap, provinceNameFromIotCode, renderIotScoreboard, renderIotLeaderboard,
  renderIotDistrictLeaderboard, restoreIotProvinceLeaderboard, renderIotCountryProvinces, renderIotCountryLabels, animateIotViewBox, zoomToIotProvinceByName,
  zoomToIotProvince, renderIotDistrictHtmlLabels, zoomToIotDistrict, backOneIotLevel, backToIotCountryMap, renderIotPeopleGroup,
  toggleIotMapPersonDetail,
});
