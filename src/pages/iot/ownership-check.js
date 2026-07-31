// ===== ตรวจสอบเจ้าของตู้ (ข้อมูลเก่า) จาก view iot_sn_ownership_check =====
// แยกมาจาก main.js เดิม — ตัวแปร/ฟังก์ชันแชร์ผ่าน window (โค้ดเดิมออกแบบเป็น global scope)


function getIotLegacyCheckFiltered() {
  const statusSel = document.getElementById('iotLegacyFilterStatus');
  const searchInput = document.getElementById('iotLegacyFilterSearch');
  const statusFilter = statusSel ? statusSel.value : '';
  const search = (searchInput ? searchInput.value : '').trim().toLowerCase();
  return iotLegacyCheckRows.filter(r => {
    if (statusFilter && r.match_status !== statusFilter) return false;
    if (search) {
      const hay = [
        r.intended_owner_name, r.intended_owner_phone, r.serial_board,
        r.actual_app_owner_name, r.actual_app_owner_phone, r.base_code,
      ].map(v => (v || '').toString().toLowerCase()).join(' ');
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

// ใช้สีป้ายเดียวกับ pdf-status-badge ที่มีอยู่แล้ว (status-done เขียว / status-cancelled แดง / status-pending เทา)
function iotLegacyMatchStatusBadgeClass(status) {
  if (status === 'ตรงกัน') return 'status-done';
  if (status === 'ยังไม่เชื่อมแอป') return 'status-pending';
  return 'status-cancelled'; // 'ไม่ตรงกัน (ตรวจสอบ)'
}

function renderIotLegacyCheckSection() {
  const total = iotLegacyCheckRows.length;
  const matchCount = iotLegacyCheckRows.filter(r => r.match_status === 'ตรงกัน').length;
  const mismatchCount = iotLegacyCheckRows.filter(r => r.match_status === 'ไม่ตรงกัน (ตรวจสอบ)').length;
  const noAppCount = iotLegacyCheckRows.filter(r => r.match_status === 'ยังไม่เชื่อมแอป').length;

  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText('iotLegacyKpiTotal', total.toLocaleString());
  setText('iotLegacyKpiMatch', matchCount.toLocaleString());
  setText('iotLegacyKpiMismatch', mismatchCount.toLocaleString());
  setText('iotLegacyKpiNoApp', noAppCount.toLocaleString());

  applyIotLegacyCheckFilters();
}

function applyIotLegacyCheckFilters() {
  const tbody = document.getElementById('iotLegacyCheckTbody');
  if (!tbody) return;
  const filtered = getIotLegacyCheckFiltered();
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--muted);">ไม่พบข้อมูลตามเงื่อนไขที่เลือก</td></tr>';
    return;
  }
  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td>${r.base_code || ''}</td>
      <td>${r.intended_owner_name || ''}</td>
      <td>${r.intended_owner_phone || ''}</td>
      <td>${r.intended_owner_province || ''}</td>
      <td>${r.serial_board || ''}</td>
      <td>${r.cabinet_status || ''}</td>
      <td>${r.actual_app_owner_name || ''}</td>
      <td>${r.actual_app_owner_phone || ''}</td>
      <td><span class="pdf-status-badge ${iotLegacyMatchStatusBadgeClass(r.match_status)}">${r.match_status || ''}</span></td>
    </tr>
  `).join('');
}

function exportIotLegacyCheckCsv() {
  const filtered = getIotLegacyCheckFiltered();
  if (!filtered.length) { showToast('ไม่มีข้อมูลจะส่งออกครับ', 'warn'); return; }
  const headers = ['รหัสฐาน','เจ้าของที่ตั้งใจ','เบอร์ (ตั้งใจ)','จังหวัด (ตั้งใจ)','SN ตู้','สถานะตู้','เจ้าของจริงในแอป','เบอร์ (จริง)','ผลตรวจสอบ'];
  const rows = filtered.map(r => [r.base_code, r.intended_owner_name, r.intended_owner_phone, r.intended_owner_province, r.serial_board, r.cabinet_status, r.actual_app_owner_name, r.actual_app_owner_phone, r.match_status]);
  const csv = [headers, ...rows].map(row => row.map(v => `"${(v ?? '').toString().replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'iot_legacy_ownership_check.csv';
  link.click();
}

// สลับแท็บย่อยภายในแท็บ "แผนติดตั้ง IoT"—  แผนติดตั้ง /  เชื่อมต่อแอป /  ตรวจสอบเจ้าของตู้ (ข้อมูลเก่า)
function switchIotPlanSubTab(sub) {
  document.querySelectorAll('#tab-iot-plan .view-toggle-btn[data-subtab]').forEach(b => {
    b.classList.toggle('active', b.dataset.subtab === sub);
  });
  const tableEl = document.getElementById('iotPlanSubtabTable');
  const finalizedEl = document.getElementById('iotPlanSubtabFinalized');
  const appMatchEl = document.getElementById('iotPlanSubtabAppMatch');
  const legacyCheckEl = document.getElementById('iotPlanSubtabLegacyCheck');
  if (tableEl) tableEl.style.display = sub === 'table' ? '' : 'none';
  if (finalizedEl) finalizedEl.style.display = sub === 'finalized' ? '' : 'none';
  if (appMatchEl) appMatchEl.style.display = sub === 'appmatch' ? '' : 'none';
  if (legacyCheckEl) legacyCheckEl.style.display = sub === 'legacycheck' ? '' : 'none';
  if (sub === 'finalized') {
    renderIotPlanFinalizedSection();
  } else if (sub === 'appmatch') {
    if (!iotDataLoaded) {
      loadIotData().then(renderIotPlanAppMatchSection);
    } else {
      renderIotPlanAppMatchSection();
    }
  } else if (sub === 'legacycheck') {
    loadIotOwnershipCheck(false);
  }
}

function exportIotPlanExcel() {
  const sortedPlan = iotInstallPlan
    .filter(p => p.installDate)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  if (!sortedPlan.length) { showToast('ยังไม่มีรายการที่ตั้งวันที่ติดตั้งเลยครับ ลองตั้งวันที่ก่อนแล้วค่อยส่งออกอีกครั้ง', 'warn'); return; }
  const data = sortedPlan.map((p, i) => ({
    'ลำดับ': i + 1,
    'ชื่อ-นามสกุล': (p.name || '') + (getIotInstallBlockerStateByNationalId(p.nationalId) ? ' (ติดตั้งไม่ได้)' : ''),
    'เลขบัตรประชาชน': p.nationalId || '',
    'เบอร์ติดต่อ': p.phone || '',
    'จังหวัด': p.province,
    'อำเภอ': p.district || '',
    'ตำบล': p.subdistrict || '',
    'กำหนดติดตั้ง (เดือน/สัปดาห์)': formatIotPlanWeekLabel(p.installDate) || 'ยังไม่นัด',
    'สถานะ': IOT_PLAN_STATUS_LABELS[p.status || 'pending'],
    'ทีมติดตั้ง': p.installTeam || '',
    'ผู้ดำเนินการ': p.operatorName || '',
    'ประเภทตู้': p.boxType ? IOT_BOX_TYPE_LABELS[p.boxType] : '',
    'ปั๊มน้ำ': p.pumpType || '',
    'ขนาดท่อ': p.pipeSize || '',
    'ขนาดวาล์ว': p.valveSize || '',
    'แหล่งน้ำ': planWaterVal(p) || '',
    'รูปแบบการให้น้ำ': planIrrigationVal(p) || '',
    'การชำระเงิน': p.boxType === 'no_button' ? '-' : (p.paymentStatus || ''),
    'ยอดชำระ (บาท)': p.boxType === 'no_button' ? '-' : ((p.paymentAmount === '' || p.paymentAmount === undefined || p.paymentAmount === null) ? '' : Number(p.paymentAmount)),
    'ตำแหน่ง (Google Maps)': p.mapLink || '',
    'หมายเหตุ': p.note || '',
    'SN ตู้ (สแกน)': p.scannedSn || '',
    'เลขฐาน (AR)': p.baseCode || ''
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  prettifyExcelSheet(ws, data);

  const mapLinkColIndex = 19;
  sortedPlan.forEach((p, i) => {
    if (p.mapLink) {
      const cellRef = XLSX.utils.encode_cell({ r: i + 1, c: mapLinkColIndex });
      if (ws[cellRef]) {
        ws[cellRef].l = { Target: p.mapLink, Tooltip: 'เปิดใน Google Maps' };
      }
    }
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'แผนติดตั้ง IoT');
  XLSX.writeFile(wb, 'แผนติดตั้ง_IoT.xlsx');
}

// ----- ส่งออกรายงาน PDF แผนติดตั้ง IoT (ใช้ระบบพิมพ์ของเบราว์เซอร์เหมือนแผนอบรม เพื่อให้ตัวอักษรไทยไม่เพี้ยน) -----
// สร้างเซคชันของทีมเดียว (จัดกลุ่มตามวันที่ภายในทีมนั้น) — ไม่มีคอลัมน์ "ทีมติดตั้ง" ต่อแถวแล้ว เพราะหัวข้อทีมบอกอยู่แล้ว
function buildIotPlanTeamSectionHtml(items, teamName) {
  const total = items.length;
  const doneCount = items.filter(p => p.status === 'done').length;
  const cancelledCount = items.filter(p => p.status === 'cancelled').length;
  const pendingCount = total - doneCount - cancelledCount;

  const groups = groupByDate(items, 'installDate').sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  groups.forEach(g => g.items.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));

  const statsLabel = `${total} คน • ติดตั้งแล้ว ${doneCount} • รอติดตั้ง ${pendingCount}${cancelledCount ? ' • สละสิทธิ์ ' + cancelledCount : ''}`;

  const groupsHtml = groups.map(g => `
    <div class="pdf-date-section">
      <div class="pdf-date-heading">
        <span><i data-icon="calendar-range" data-size="15"></i> ${formatIotPlanWeekLabel(g.date)}</span>
        <span class="pdf-date-count">${g.items.length} คน</span>
      </div>
      <table class="pdf-table">
        <colgroup>
          <col style="width:3%;"><col style="width:10%;"><col style="width:7%;"><col style="width:9%;">
          <col style="width:6%;"><col style="width:5%;"><col style="width:6%;"><col style="width:5%;">
          <col style="width:5%;"><col style="width:6%;"><col style="width:6%;"><col style="width:6%;">
          <col style="width:5%;"><col style="width:5%;"><col style="width:5%;"><col style="width:8%;">
        </colgroup>
        <thead>
          <tr><th>#</th><th>ชื่อ-นามสกุล</th><th>เบอร์ติดต่อ</th><th>พื้นที่ (จังหวัด/อำเภอ/ตำบล)</th><th>ผู้ดำเนินการ</th><th>ตู้</th><th>ปั๊มน้ำ</th><th>ขนาดท่อ</th><th>ขนาดวาล์ว</th><th>แหล่งน้ำ</th><th>รูปแบบการให้น้ำ</th><th>การชำระเงิน</th><th>ยอดชำระ</th><th>พิกัด</th><th>สถานะ</th><th>หมายเหตุ</th></tr>
        </thead>
        <tbody>
          ${g.items.map((p, i) => {
            const isBlocked = !!getIotInstallBlockerStateByNationalId(p.nationalId);
            return `
            <tr>
              <td>${i + 1}</td>
              <td>${p.name || '-'}${isBlocked ? ' <span class="pdf-status-badge status-cancelled" title="ติดตั้งไม่ได้"><i data-icon="blocked" data-size="15"></i></span>' : ''}</td>
              <td>${p.phone || '-'}</td>
              <td>${p.province || '-'} / ${p.district || '-'} / ${p.subdistrict || '-'}</td>
              <td>${p.operatorName || '-'}</td>
              <td>${p.boxType ? IOT_BOX_TYPE_LABELS[p.boxType] : '-'}</td>
              <td>${p.pumpType || '-'}</td>
              <td>${p.pipeSize || '-'}</td>
              <td>${p.valveSize || '-'}</td>
              <td>${planWaterVal(p) || '-'}</td>
              <td>${planIrrigationVal(p) || '-'}</td>
              <td>${p.boxType === 'no_button' ? '-' : (p.paymentStatus || '-')}</td>
              <td>${p.boxType === 'no_button' ? '-' : ((p.paymentAmount === '' || p.paymentAmount === undefined || p.paymentAmount === null) ? '-' : Number(p.paymentAmount).toLocaleString())}</td>
              <td class="pdf-loc-cell">${p.mapLink ? '<span class="pdf-loc-badge has-loc">มีพิกัด</span>' : '<span class="pdf-loc-badge no-loc">-</span>'}</td>
              <td><span class="pdf-status-badge status-${p.status || 'pending'}">${IOT_PLAN_STATUS_LABELS[p.status || 'pending']}</span></td>
              <td>${p.note || '-'}</td>
            </tr>
          `; }).join('')}
        </tbody>
      </table>
    </div>
  `).join('');

  return `
    <div class="pdf-team-section">
      <div class="pdf-team-heading">
        <span><i data-icon="wrench" data-size="15"></i> ${teamName}</span>
        <span class="pdf-team-stats">${statsLabel}</span>
      </div>
      ${groupsHtml}
    </div>
  `;
}

// expose ฟังก์ชันของโมดูลนี้ให้ inline handlers และโมดูลอื่นเรียกผ่าน window ได้
Object.assign(window, {
  getIotLegacyCheckFiltered, iotLegacyMatchStatusBadgeClass, renderIotLegacyCheckSection, applyIotLegacyCheckFilters, exportIotLegacyCheckCsv, switchIotPlanSubTab,
  exportIotPlanExcel, buildIotPlanTeamSectionHtml,
});
