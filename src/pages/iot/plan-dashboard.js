// ===== แดชบอร์ดสรุปแผนติดตั้ง IoT + สรุปทีมผลิตตู้ + จัดเส้นทาง + PDF ทีมผลิต =====
// แยกมาจาก main.js เดิม — ตัวแปร/ฟังก์ชันแชร์ผ่าน window (โค้ดเดิมออกแบบเป็น global scope)


// ----- แดชบอร์ดสรุปแผนติดตั้ง IoT (ย้อนหลัง/กำลังจะมาถึง) -----
// ----- แดชบอร์ดสรุปสำหรับทีมผลิตตู้ IoT: ตัวเลขสรุปล้วนๆ ไม่มีข้อมูลส่วนบุคคล -----
function renderIotBoxTeamDashboard() {
  const totalEl = document.getElementById('iotBoxKpiTotal');
  if (!totalEl) return; // แท็บยังไม่ถูกโหลด

  // ไม่รวมรายการที่ยกเลิก เพราะไม่ต้องเตรียมตู้ให้แล้ว
  const base = iotInstallPlan.filter(p => p.status !== 'cancelled');
  const withButton = base.filter(p => p.boxType === 'with_button').length;
  const noButton = base.filter(p => p.boxType === 'no_button').length;
  const unspecified = base.length - withButton - noButton;
  const provinceSet = new Set(base.map(p => p.province).filter(Boolean));

  document.getElementById('iotBoxKpiTotal').textContent = base.length.toLocaleString();
  document.getElementById('iotBoxKpiProvinces').textContent = `${provinceSet.size.toLocaleString()} จังหวัด`;
  document.getElementById('iotBoxKpiWithButton').textContent = withButton.toLocaleString();
  document.getElementById('iotBoxKpiWithButtonPct').textContent = base.length ? `${Math.round(withButton / base.length * 100)}%` : '-';
  document.getElementById('iotBoxKpiNoButton').textContent = noButton.toLocaleString();
  document.getElementById('iotBoxKpiNoButtonPct').textContent = base.length ? `${Math.round(noButton / base.length * 100)}%` : '-';
  document.getElementById('iotBoxKpiUnspecified').textContent = unspecified.toLocaleString();

  // สรุปรายทีม: เรียงทีมติดตั้ง1-5 ตามลำดับ แล้วตามด้วย "ยังไม่ระบุทีม" ถ้ามี (ซ่อนแถวที่ไม่มีใครเลย)
  const teamTbody = document.getElementById('iotBoxTeamTbody');
  if (teamTbody) {
    const teamKeys = [...IOT_INSTALL_TEAMS, ''];
    const teamRows = teamKeys.map(team => {
      const rows = base.filter(p => (p.installTeam || '') === team);
      if (!rows.length) return null;
      const wb = rows.filter(p => p.boxType === 'with_button').length;
      const nb = rows.filter(p => p.boxType === 'no_button').length;
      const un = rows.length - wb - nb;
      return { label: team || 'ยังไม่ระบุทีม', wb, nb, un, total: rows.length };
    }).filter(Boolean);

    teamTbody.innerHTML = teamRows.length
      ? teamRows.map(r => `
          <tr>
            <td>${r.label}</td>
            <td class="num">${r.wb.toLocaleString()}</td>
            <td class="num">${r.nb.toLocaleString()}</td>
            <td class="num">${r.un.toLocaleString()}</td>
            <td class="num"><b>${r.total.toLocaleString()}</b></td>
          </tr>
        `).join('')
      : `<tr><td colspan="5" style="text-align:center; opacity:.6; padding:16px;">ยังไม่มีรายการในแผนติดตั้ง IoT</td></tr>`;
  }

  // สรุปรายจังหวัด เรียงจากจำนวนตู้มากไปน้อย
  const provinceTbody = document.getElementById('iotBoxProvinceTbody');
  if (provinceTbody) {
    const byProvince = new Map();
    base.forEach(p => {
      const key = p.province || 'ไม่ระบุจังหวัด';
      if (!byProvince.has(key)) byProvince.set(key, { wb: 0, nb: 0, un: 0, total: 0 });
      const bucket = byProvince.get(key);
      if (p.boxType === 'with_button') bucket.wb++;
      else if (p.boxType === 'no_button') bucket.nb++;
      else bucket.un++;
      bucket.total++;
    });
    const provinceRows = [...byProvince.entries()].sort((a, b) => b[1].total - a[1].total);
    provinceTbody.innerHTML = provinceRows.length
      ? provinceRows.map(([name, r]) => `
          <tr>
            <td>${name}</td>
            <td class="num">${r.wb.toLocaleString()}</td>
            <td class="num">${r.nb.toLocaleString()}</td>
            <td class="num">${r.un.toLocaleString()}</td>
            <td class="num"><b>${r.total.toLocaleString()}</b></td>
          </tr>
        `).join('')
      : `<tr><td colspan="5" style="text-align:center; opacity:.6; padding:16px;">ยังไม่มีรายการในแผนติดตั้ง IoT</td></tr>`;
  }

  // สรุปว่าแต่ละทีมติดตั้งต้องไปจังหวัดไหนบ้าง และกี่ตู้ต่อจังหวัด (สำหรับทีมผลิตตู้)
  const teamProvinceTbody = document.getElementById('iotBoxTeamProvinceTbody');
  if (teamProvinceTbody) {
    const rows = getIotBoxTeamProvinceRows();
    teamProvinceTbody.innerHTML = rows.length
      ? rows.map(r => `
          <tr>
            <td>${r.team}</td>
            <td>${r.province}</td>
            <td class="num">${r.wb.toLocaleString()}</td>
            <td class="num">${r.nb.toLocaleString()}</td>
            <td class="num">${r.un.toLocaleString()}</td>
            <td class="num"><b>${r.count.toLocaleString()}</b></td>
          </tr>
        `).join('')
      : `<tr><td colspan="6" style="text-align:center; opacity:.6; padding:16px;">ยังไม่มีรายการในแผนติดตั้ง IoT</td></tr>`;
  }
}

// คืนรายการ (ทีมติดตั้ง, จังหวัด, จำนวนตู้) ใช้ร่วมกันทั้งตารางบนหน้าจอและรายงาน PDF ของทีมผลิตตู้
// เรียงตามลำดับทีมติดตั้ง1-5 ก่อน (ตามด้วย "ยังไม่ระบุทีม" ถ้ามี) แล้วในแต่ละทีมเรียงจังหวัดที่มีตู้เยอะสุดก่อน
function getIotBoxTeamProvinceRows() {
  const base = iotInstallPlan.filter(p => p.status !== 'cancelled');
  const teamKeys = [...IOT_INSTALL_TEAMS, ''];
  const rows = [];
  teamKeys.forEach(team => {
    const teamRows = base.filter(p => (p.installTeam || '') === team);
    if (!teamRows.length) return;
    const byProvince = new Map();
    teamRows.forEach(p => {
      const key = p.province || 'ไม่ระบุจังหวัด';
      if (!byProvince.has(key)) byProvince.set(key, { wb: 0, nb: 0, un: 0, total: 0 });
      const bucket = byProvince.get(key);
      if (p.boxType === 'with_button') bucket.wb++;
      else if (p.boxType === 'no_button') bucket.nb++;
      else bucket.un++;
      bucket.total++;
    });
    const provinceEntries = [...byProvince.entries()].sort((a, b) => b[1].total - a[1].total);
    provinceEntries.forEach(([province, bucket]) => {
      rows.push({ team: team || 'ยังไม่ระบุทีม', province, wb: bucket.wb, nb: bucket.nb, un: bucket.un, count: bucket.total });
    });
  });
  return rows;
}

// ----- รายงาน PDF สำหรับทีมผลิตตู้: ทีมติดตั้ง / จังหวัด / จำนวนตู้ เท่านั้น ไม่มีข้อมูลส่วนบุคคล -----
function buildIotBoxReportPdfHtml() {
  const rows = getIotBoxTeamProvinceRows();
  const totalBoxes = rows.reduce((sum, r) => sum + r.count, 0);
  const provinceCount = new Set(rows.map(r => r.province)).size;
  const generatedAt = new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

  const tableRowsHtml = rows.map(r => `
    <tr>
      <td>${r.team}</td>
      <td>${r.province}</td>
      <td style="text-align:right;">${r.wb.toLocaleString()}</td>
      <td style="text-align:right;">${r.nb.toLocaleString()}</td>
      <td style="text-align:right;">${r.un.toLocaleString()}</td>
      <td style="text-align:right;"><b>${r.count.toLocaleString()}</b></td>
    </tr>
  `).join('');

  return `
    <div class="pdf-header">
      <img src="${PDF_LOGO_DATA_URI}" class="pdf-logo" alt="Kasetkorn">
      <div class="pdf-header-text">
        <h1>รายงานทีมผลิตตู้ IoT</h1>
        <div class="pdf-header-sub">ตู้ทั้งหมด ${totalBoxes.toLocaleString()} ตู้ · ${provinceCount.toLocaleString()} จังหวัด</div>
      </div>
      <div class="pdf-header-meta">พิมพ์เมื่อ<br>${generatedAt}</div>
    </div>
    <table class="pdf-table">
      <colgroup>
        <col style="width:18%;"><col style="width:26%;"><col style="width:14%;"><col style="width:14%;"><col style="width:14%;"><col style="width:14%;">
      </colgroup>
      <thead>
        <tr><th>ทีมติดตั้ง</th><th>จังหวัด</th><th style="text-align:right;">ตู้มีปุ่มกด</th><th style="text-align:right;">ตู้ไม่มีปุ่มกด</th><th style="text-align:right;">ยังไม่ระบุ</th><th style="text-align:right;">รวม</th></tr>
      </thead>
      <tbody>
        ${tableRowsHtml || '<tr><td colspan="6" style="text-align:center;">ยังไม่มีรายการ</td></tr>'}
      </tbody>
    </table>
    <div class="pdf-footer">สร้างโดย Dashboard เกษตรกร — ทีมผลิตตู้ IoT (OTOD)</div>
  `;
}

function exportIotBoxReportPdf() {
  const rows = getIotBoxTeamProvinceRows();
  if (!rows.length) { showToast('ยังไม่มีรายการในแผนติดตั้ง IoT เลยครับ', 'warn'); return; }

  const root = document.createElement('div');
  root.className = 'pdf-report';
  root.innerHTML = buildIotBoxReportPdfHtml();
  document.body.appendChild(root);

  const cleanup = () => {
    window.removeEventListener('afterprint', cleanup);
    if (root.parentNode) document.body.removeChild(root);
  };
  window.addEventListener('afterprint', cleanup);

  showToast('เปิดหน้าต่างพิมพ์รายงานแล้ว — เลือก "บันทึกเป็น PDF" จากตัวเลือกเครื่องพิมพ์ได้เลยครับ', 'info');

  requestAnimationFrame(() => {
    window.print();
  });
}

// ===== ตรวจสอบเชื่อมต่อแอป: เทียบคนเชื่อมต่อแอปแล้ว กับข้อมูลในระบบ OTOD =====

// รวบรวม app_iot_id (SN ตู้) ทุกตัวที่จับคู่เจอกับใครสักคนใน iot_farmers (ใช้ allIotRows ทั้งหมด ไม่ใช้ตัวกรองโครงการ
// เพราะเราต้องรู้ว่า "จับคู่เจอไหม" โดยไม่ขึ้นกับตัวกรองที่ผู้ใช้เลือกดูอยู่)
function buildMatchedAppIotIds() {
  const matched = new Set();
  allIotRows.forEach(r => {
    getMatchedAppRecords(r).forEach(rec => { if (rec.app_iot_id) matched.add(rec.app_iot_id); });
  });
  return matched;
}

// expose ฟังก์ชันของโมดูลนี้ให้ inline handlers และโมดูลอื่นเรียกผ่าน window ได้
Object.assign(window, {
  renderIotBoxTeamDashboard, getIotBoxTeamProvinceRows, buildIotBoxReportPdfHtml, exportIotBoxReportPdf, buildMatchedAppIotIds,
});
