// ===== ส่งออกรายงาน PDF แผนติดตั้ง IoT (ระบบพิมพ์ของเบราว์เซอร์) =====
// แยกมาจาก main.js เดิม — ตัวแปร/ฟังก์ชันแชร์ผ่าน window (โค้ดเดิมออกแบบเป็น global scope)


function buildIotPlanPdfHtml(dated, teamLabel, reportTitleOverride) {
  const total = dated.length;
  const doneCount = dated.filter(p => p.status === 'done').length;
  const cancelledCount = dated.filter(p => p.status === 'cancelled').length;
  const pendingCount = total - doneCount - cancelledCount;

  const sortedDates = [...new Set(dated.map(p => p.installDate))].sort();
  const dayCount = sortedDates.length;
  const rangeLabel = formatIotPlanWeekRangeLabel(sortedDates);

  const generatedAt = new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  const blockedCount = dated.filter(p => getIotInstallBlockerStateByNationalId(p.nationalId)).length;

  const kpiHtml = `
    <div class="pdf-kpi-grid">
      <div class="pdf-kpi-card"><div class="pdf-kpi-num">${total}</div><div class="pdf-kpi-label">คนที่นัดแล้ว</div></div>
      <div class="pdf-kpi-card"><div class="pdf-kpi-num">${dayCount}</div><div class="pdf-kpi-label">สัปดาห์ที่นัดหมาย</div></div>
      <div class="pdf-kpi-card done"><div class="pdf-kpi-num">${doneCount}</div><div class="pdf-kpi-label">ติดตั้งแล้ว</div></div>
      <div class="pdf-kpi-card pending"><div class="pdf-kpi-num">${pendingCount}</div><div class="pdf-kpi-label">รอติดตั้ง</div></div>
      <div class="pdf-kpi-card cancelled"><div class="pdf-kpi-num">${cancelledCount}</div><div class="pdf-kpi-label">สละสิทธิ์</div></div>
      <div class="pdf-kpi-card blocked"><div class="pdf-kpi-num">${blockedCount}</div><div class="pdf-kpi-label">ติดตั้งไม่ได้</div></div>
    </div>
  `;

  // แยกเป็นทีม ๆ: เลือกทีมเดียวมาแล้ว (teamLabel) ก็มีทีมเดียว, ไม่ได้เลือก (ทุกทีม) แยกตามลำดับ IOT_INSTALL_TEAMS แล้วปิดท้ายด้วย "ยังไม่ระบุทีม" ถ้ามี
  // แต่ละทีมขึ้นหน้าใหม่ (page-break) พร้อมหัวข้อชื่อทีมของตัวเอง ไม่รวมทุกทีมไว้ในตารางเดียวกันอีกต่อไป
  const teamKeys = teamLabel ? [teamLabel] : [...IOT_INSTALL_TEAMS, ''];
  const teamSectionsHtml = teamKeys.map(team => {
    const items = dated.filter(p => (p.installTeam || '') === team);
    if (!items.length) return '';
    return buildIotPlanTeamSectionHtml(items, team || 'ยังไม่ระบุทีม');
  }).join('');

  return `
    <div class="pdf-topbar"></div>
    <div class="pdf-header">
      <img src="${PDF_LOGO_DATA_URI}" class="pdf-logo" alt="Kasetkorn">
      <div class="pdf-header-text">
        <div class="pdf-header-eyebrow">เอกสารสรุปแผนปฏิบัติงานทีมติดตั้ง</div>
        <h1>${reportTitleOverride || ('รายงานแผนติดตั้ง IoT' + (teamLabel ? ' — ' + teamLabel : ' — ทุกทีม'))}</h1>
        <div class="pdf-header-sub">ช่วงกำหนดติดตั้ง: ${rangeLabel}</div>
      </div>
      <div class="pdf-header-meta">
        <div>พิมพ์เมื่อ ${generatedAt}</div>
        ${currentUserName ? `<div>โดย ${currentUserName}</div>` : ''}
      </div>
    </div>
    ${kpiHtml}
    ${teamSectionsHtml}
    <div class="pdf-signoff">
      <div class="pdf-signoff-box"><div class="pdf-signoff-line"></div><div class="pdf-signoff-label">ผู้จัดทำรายงาน</div></div>
      <div class="pdf-signoff-box"><div class="pdf-signoff-line"></div><div class="pdf-signoff-label">ผู้ตรวจสอบ/อนุมัติ</div></div>
    </div>
    <div class="pdf-footer">สร้างโดย Dashboard เกษตรกร — แผนติดตั้ง IoT (OTOD)</div>
  `;
}

function exportIotPlanPdf() {
  // ใช้ตัวกรอง "ทีมติดตั้ง" ที่เลือกอยู่ในหน้าจอเป็นตัวกำหนดขอบเขตรายงาน: เลือกทีมใดทีมหนึ่ง -> ออกเฉพาะทีมนั้น,
  // ไม่ได้เลือก (ทุกทีม) -> ออกรวมทุกคน แต่มีคอลัมน์ "ทีมติดตั้ง" ต่อแถวให้แยกออกว่าใครอยู่ทีมไหน
  const teamSel = document.getElementById('iotPlanFilterTeam');
  const teamLabel = teamSel ? teamSel.value : '';
  const dated = iotInstallPlan.filter(p => p.installDate && (!teamLabel || p.installTeam === teamLabel));
  if (!dated.length) {
    showToast(teamLabel
      ? `ยังไม่มีรายการที่ตั้งวันที่ติดตั้งของ${teamLabel}เลยครับ ลองตั้งวันที่ก่อนแล้วค่อยส่งออกรายงาน`
      : 'ยังไม่มีรายการที่ตั้งวันที่ติดตั้งเลยครับ ลองตั้งวันที่ก่อนแล้วค่อยส่งออกรายงาน', 'warn');
    return;
  }

  const root = document.createElement('div');
  root.className = 'pdf-report';
  root.innerHTML = buildIotPlanPdfHtml(dated, teamLabel);
  document.body.appendChild(root);
  enableLandscapePrint();

  const cleanup = () => {
    window.removeEventListener('afterprint', cleanup);
    if (root.parentNode) document.body.removeChild(root);
    disableLandscapePrint();
  };
  window.addEventListener('afterprint', cleanup);

  showToast('เปิดหน้าต่างพิมพ์รายงานแล้ว — เลือก "บันทึกเป็น PDF" จากตัวเลือกเครื่องพิมพ์ได้เลยครับ', 'info');

  requestAnimationFrame(() => {
    window.print();
  });
}

// ส่งออก Excel เฉพาะรายการ "วางแผนเสร็จแล้ว" ที่ตรงกับตัวกรอง (จังหวัด/อำเภอ/ตำบล/คำค้นหา) ในแท็บนี้
function exportIotPlanFinalizedExcel() {
  const sortedPlan = getFilteredIotPlanFinalized();
  if (!sortedPlan.length) { showToast('ไม่มีรายการที่ตรงกับตัวกรองให้ส่งออกครับ', 'warn'); return; }
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
  XLSX.utils.book_append_sheet(wb, ws, 'วางแผนเสร็จแล้ว');
  XLSX.writeFile(wb, 'แผนติดตั้ง_IoT_วางแผนเสร็จแล้ว.xlsx');
}

// ส่งออกรายงาน PDF เฉพาะรายการ "วางแผนเสร็จแล้ว" ที่ตรงกับตัวกรองในแท็บนี้ — แยกตามทีมเหมือนรายงานแผนหลัก
function exportIotPlanFinalizedPdf() {
  const filtered = getFilteredIotPlanFinalized();
  if (!filtered.length) { showToast('ไม่มีรายการที่ตรงกับตัวกรองให้ออกรายงานครับ', 'warn'); return; }

  const root = document.createElement('div');
  root.className = 'pdf-report';
  root.innerHTML = buildIotPlanPdfHtml(filtered, '', 'รายงานแผนติดตั้ง IoT (วางแผนเสร็จแล้ว) — ทุกทีม');
  document.body.appendChild(root);
  enableLandscapePrint();

  const cleanup = () => {
    window.removeEventListener('afterprint', cleanup);
    if (root.parentNode) document.body.removeChild(root);
    disableLandscapePrint();
  };
  window.addEventListener('afterprint', cleanup);

  showToast('เปิดหน้าต่างพิมพ์รายงานแล้ว — เลือก "บันทึกเป็น PDF" จากตัวเลือกเครื่องพิมพ์ได้เลยครับ', 'info');

  requestAnimationFrame(() => {
    window.print();
  });
}

document.getElementById('filterProvince').addEventListener('change', applyFilters);
document.getElementById('filterStatus').addEventListener('change', applyFilters);
document.getElementById('filterSearch').addEventListener('input', applyFilters);

document.getElementById('iotFilterProvince').addEventListener('change', applyIotFilters);
document.getElementById('iotFilterStatus').addEventListener('change', applyIotFilters);

// expose ฟังก์ชันของโมดูลนี้ให้ inline handlers และโมดูลอื่นเรียกผ่าน window ได้
Object.assign(window, {
  buildIotPlanPdfHtml, exportIotPlanPdf, exportIotPlanFinalizedExcel, exportIotPlanFinalizedPdf,
});
