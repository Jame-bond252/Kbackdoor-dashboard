// ===== หน้าทีมติดตั้ง (role installer): งานทีม + สแกน QR + ส่งงานหน้างาน + ส่งเข้า Drive =====
// แยกมาจาก main.js เดิม — ตัวแปร/ฟังก์ชันแชร์ผ่าน window (โค้ดเดิมออกแบบเป็น global scope)


function switchInstallerTab(tab) {
  installerCurrentTab = tab;
  document.querySelectorAll('.inst-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.itab === tab));
  document.getElementById('installerTabJobs').style.display = tab === 'jobs' ? '' : 'none';
  document.getElementById('installerTabToday').style.display = tab === 'today' ? '' : 'none';
  document.getElementById('installerTabNav').style.display = tab === 'nav' ? '' : 'none';
  renderInstallerView();
}

// งานทั้งหมดของทีมนี้ (iotInstallPlan ถูก RLS กรองเหลือเฉพาะทีมนี้อยู่แล้ว แต่กันเหนียวกรองซ้ำด้วยชื่อทีม)
// ถ้าเป็น master พรีวิวทีมอื่นอยู่ ใช้ชื่อทีมที่กำลังพรีวิวแทน
function installerActiveTeam() { return installerPreviewTeam || currentUserTeam; }
function getInstallerTeamJobs() {
  const team = installerActiveTeam();
  return iotInstallPlan.filter(p => !team || p.installTeam === team);
}

function getFilteredInstallerJobs() {
  const dist = (document.getElementById('instFilterDistrict') || {}).value || '';
  const subd = (document.getElementById('instFilterSubdistrict') || {}).value || '';
  const week = (document.getElementById('instFilterWeek') || {}).value || '';
  const status = (document.getElementById('instFilterStatus') || {}).value || '';
  const q = ((document.getElementById('instFilterSearch') || {}).value || '').trim().toLowerCase();
  return getInstallerTeamJobs().filter(p => {
    if (dist && p.district !== dist) return false;
    if (subd && p.subdistrict !== subd) return false;
    if (week && (p.installDate ? formatIotPlanWeekLabel(p.installDate) : 'ยังไม่นัด') !== week) return false;
    if (status && (p.status || 'pending') !== status) return false;
    if (q) {
      const hay = `${p.name || ''} ${p.phone || ''} ${p.nationalId || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => (a.installDate || '9999').localeCompare(b.installDate || '9999') || (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

function populateInstallerFilters() {
  const jobs = getInstallerTeamJobs();
  const distSel = document.getElementById('instFilterDistrict');
  const subdSel = document.getElementById('instFilterSubdistrict');
  const weekSel = document.getElementById('instFilterWeek');
  if (!distSel) return;
  const curD = distSel.value, curS = subdSel.value, curW = weekSel.value;
  const districts = [...new Set(jobs.map(p => p.district).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));
  distSel.innerHTML = '<option value="">ทุกอำเภอ</option>' + districts.map(d => `<option value="${d}">${d}</option>`).join('');
  distSel.value = districts.includes(curD) ? curD : '';
  const subs = [...new Set(jobs.filter(p => !distSel.value || p.district === distSel.value).map(p => p.subdistrict).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));
  subdSel.innerHTML = '<option value="">ทุกตำบล</option>' + subs.map(s => `<option value="${s}">${s}</option>`).join('');
  subdSel.value = subs.includes(curS) ? curS : '';
  const weeks = [...new Set(jobs.map(p => p.installDate ? formatIotPlanWeekLabel(p.installDate) : 'ยังไม่นัด'))];
  weekSel.innerHTML = '<option value="">ทุกช่วง</option>' + weeks.map(w => `<option value="${w}">${w}</option>`).join('');
  weekSel.value = weeks.includes(curW) ? curW : '';
}

window.INSTALLER_STATUS_BADGE = {
  pending: '<span class="inst-badge s-pending">รอติดตั้ง</span>',
  done: '<span class="inst-badge s-done">ติดตั้งแล้ว</span>',
  cancelled: '<span class="inst-badge s-cancelled">สละสิทธิ์</span>'
};

// การ์ดงาน 1 ใบ (สำหรับทีมติดตั้ง) — โทร/นำทาง/อัปเดตสถานะ-เก็บเงิน-หมายเหตุ ได้ในใบเดียว
function installerJobCardHtml(p) {
  const status = p.status || 'pending';
  const phoneSafe = (p.phone || '').replace(/[^0-9+]/g, '');
  const mapLinkSafe = (p.mapLink || '').replace(/"/g, '&quot;');
  const idSafe = (p.id || '').replace(/'/g, "\\'");
  const paid = p.paymentStatus === 'ชำระแล้ว';
  const amountVal = (p.paymentAmount === '' || p.paymentAmount === undefined || p.paymentAmount === null) ? '' : String(p.paymentAmount).replace(/"/g, '&quot;');
  const details = [
    p.boxType ? IOT_BOX_TYPE_LABELS[p.boxType] : null,
    p.pumpType ? 'ปั๊ม: ' + p.pumpType : null,
    p.pipeSize ? 'ท่อ: ' + p.pipeSize : null,
    p.valveSize ? 'วาล์ว: ' + p.valveSize : null
  ].filter(Boolean).join(' · ');
  return `
    <div class="inst-job-card row-${status}">
      <div class="inst-job-top">
        <div class="inst-job-name">${p.name || '-'} ${INSTALLER_STATUS_BADGE[status] || ''}</div>
        <div class="inst-job-when">${p.installDate ? '<i data-icon="calendar-range" data-size="15"></i> ' + formatIotPlanWeekLabel(p.installDate) : '<span style="color:var(--muted);">ยังไม่นัด</span>'}</div>
      </div>
      <div class="inst-job-area"><i data-icon="pin" data-size="15"></i> ${p.district || '-'} / ${p.subdistrict || '-'}${details ? ' · <span class="inst-job-detail">' + details + '</span>' : ''}</div>
      ${p.note ? `<div class="note-flag"><i data-icon="edit-square" data-size="15"></i> หมายเหตุ: ${escNoteText(p.note)}</div>` : ''}
      <div class="inst-job-actions">
        ${phoneSafe ? `<a class="inst-act-btn call" href="tel:${phoneSafe}"><i data-icon="phone" data-size="15"></i> โทร ${p.phone}</a>` : '<span class="inst-act-btn disabled">ไม่มีเบอร์</span>'}
        ${p.mapLink ? `<a class="inst-act-btn nav" href="${mapLinkSafe}" target="_blank" rel="noopener"><i data-icon="compass" data-size="15"></i> นำทาง</a>` : ''}
      </div>
      <div class="inst-job-edit">
        <label>สถานะ
          <select onchange="installerSetStatus('${idSafe}',this.value)">
            <option value="pending" ${status==='pending'?'selected':''}>รอติดตั้ง</option>
            <option value="not_contacted" ${status==='not_contacted'?'selected':''}>ยังไม่ติดต่อ</option>
            <option value="survey" ${status==='survey'?'selected':''}>นัดดูหน้างาน</option>
            <option value="site_not_ready" ${status==='site_not_ready'?'selected':''}>หน้างานไม่พร้อม</option>
            <option value="ready" ${status==='ready'?'selected':''}>พร้อมติดตั้ง</option>
            <option value="done" ${status==='done'?'selected':''}>ติดตั้งแล้ว</option>
            <option value="cancelled" ${status==='cancelled'?'selected':''}>สละสิทธิ์</option>
          </select>
        </label>
        <label>ตู้
          <select onchange="installerSetEquip('${idSafe}','boxType',this.value)">
            <option value="" ${!p.boxType?'selected':''}>ยังไม่ระบุ</option>
            <option value="no_button" ${p.boxType==='no_button'?'selected':''}>ตู้ไม่มีปุ่มกด</option>
            <option value="with_button" ${p.boxType==='with_button'?'selected':''}>ตู้มีปุ่มกด</option>
          </select>
        </label>
        <label>ปั๊มน้ำ
          <select data-dropcat="pump_type" onchange="installerSetEquip('${idSafe}','pumpType',this.value)"><option value="" ${!p.pumpType?'selected':''}>ยังไม่ระบุ</option>${getIotDropdownOptions('pump_type').map(t=>`<option value="${t}" ${p.pumpType===t?'selected':''}>${t}</option>`).join('')}</select>
        </label>
        <label>ขนาดท่อ
          <select data-dropcat="pipe_size" onchange="installerSetEquip('${idSafe}','pipeSize',this.value)"><option value="" ${!p.pipeSize?'selected':''}>ยังไม่ระบุ</option>${getIotDropdownOptions('pipe_size').map(t=>`<option value="${t}" ${p.pipeSize===t?'selected':''}>${t}</option>`).join('')}</select>
        </label>
        <label>ขนาดวาล์ว
          <select data-dropcat="valve_size" onchange="installerSetEquip('${idSafe}','valveSize',this.value)"><option value="" ${!p.valveSize?'selected':''}>ยังไม่ระบุ</option>${getIotDropdownOptions('valve_size').map(t=>`<option value="${t}" ${p.valveSize===t?'selected':''}>${t}</option>`).join('')}</select>
        </label>
        <label class="inst-note-wide"><i data-icon="camera" data-size="15"></i> SN ตู้ (สแกน QR หน้าตู้)
          <span style="display:flex; gap:6px;">
            <input type="text" value="${(p.scannedSn||'').replace(/"/g,'&quot;')}" placeholder="สแกน หรือพิมพ์ SN เอง" onchange="installerSetEquip('${idSafe}','scannedSn',this.value)" style="flex:1; min-width:0;">
            <button type="button" class="btn btn-brand" style="white-space:nowrap; padding:8px 12px;" onclick="scanInstallerQr('${idSafe}')"><i data-icon="camera" data-size="15"></i> สแกน</button>
          </span>
        </label>
        <label>เลขฐาน (AR)
          <input type="text" value="${(p.baseCode||'').replace(/"/g,'&quot;')}" placeholder="เช่น AR_0008" onchange="installerSetEquip('${idSafe}','baseCode',this.value)">
        </label>
        ${p.boxType === 'no_button' ? '' : `
        <label class="inst-pay-check"><input type="checkbox" ${paid?'checked':''} onchange="installerSetPaid('${idSafe}',this.checked)"> เก็บเงินแล้ว</label>
        <label>ยอดเก็บ (บาท)
          <input type="number" min="0" step="1" inputmode="numeric" value="${amountVal}" placeholder="บาท" onchange="installerSetAmount('${idSafe}',this.value)">
        </label>`}
        <label class="inst-note-wide">หมายเหตุ
          <input type="text" value="${(p.note||'').replace(/"/g,'&quot;')}" placeholder="เช่น ติดไม่ได้เพราะ..." onchange="installerSetNote('${idSafe}',this.value)">
        </label>
      </div>
    </div>`;
}

function escNoteText(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// แถวรายชื่อแบบย่อ (โชว์ก่อน) — กดแล้วเข้าไปดูรายละเอียด/แก้ไขของคนนั้น
function installerListRowHtml(p) {
  const status = p.status || 'pending';
  const idSafe = (p.id || '').replace(/'/g, "\\'");
  const when = p.installDate ? formatIotPlanWeekLabel(p.installDate) : 'ยังไม่นัด';
  return `<div class="inst-list-row row-${status}" onclick="openInstallerDetail('${idSafe}')">
    <div style="flex:1; min-width:0;">
      <div class="inst-list-name">${p.name || '-'} ${INSTALLER_STATUS_BADGE[status] || ''}</div>
      <div class="inst-list-sub"><i data-icon="pin" data-size="15"></i> ${p.subdistrict || '-'} · <i data-icon="calendar-range" data-size="15"></i> ${when}${p.phone ? ' · <i data-icon="phone" data-size="15"></i> ' + p.phone : ''}</div>
      ${p.note ? `<div class="note-flag"><i data-icon="edit-square" data-size="15"></i> ${escNoteText(p.note)}</div>` : ''}
    </div>
    <span class="inst-list-go">›</span>
  </div>`;
}

// เปิด/ปิดหน้ารายละเอียดของคน 1 คน (รองรับปุ่มย้อนกลับของมือถือด้วย history)
window.installerDetailId = null;
function openInstallerDetail(id) {
  installerDetailId = id;
  try { history.pushState({ instDetail: id }, ''); } catch (e) {}
  renderInstallerView();
  window.scrollTo(0, 0);
}
function closeInstallerDetail() {
  if (!installerDetailId) return;
  try { history.back(); } catch (e) { installerDetailId = null; renderInstallerView(); }
}
window.addEventListener('popstate', function () {
  if (installerDetailId) { installerDetailId = null; renderInstallerView(); window.scrollTo(0, 0); }
});

// จัดกลุ่มงานเป็น อำเภอ -> ตำบล แบบพับ/กางได้
function installerGroupedHtml(jobs) {
  if (!jobs.length) return '<div class="empty-state-cell"><span class="empty-icon"><i data-icon="sparkles" data-size="15"></i></span><span class="empty-text">ไม่มีงานที่ตรงกับตัวกรองครับ</span></div>';
  const byDist = {};
  jobs.forEach(p => {
    const d = p.district || 'ไม่ระบุอำเภอ';
    const s = p.subdistrict || 'ไม่ระบุตำบล';
    byDist[d] = byDist[d] || {};
    byDist[d][s] = byDist[d][s] || [];
    byDist[d][s].push(p);
  });
  return Object.keys(byDist).sort((a, b) => a.localeCompare(b, 'th')).map(d => {
    const subs = byDist[d];
    const distTotal = Object.values(subs).reduce((n, arr) => n + arr.length, 0);
    const subHtml = Object.keys(subs).sort((a, b) => a.localeCompare(b, 'th')).map(s => `
      <div class="inst-group sub" onclick="toggleGroupBody(this)"><span class="chevron open">▶</span><strong>ตำบล${s}</strong> <span class="inst-group-count">${subs[s].length} งาน</span></div>
      <div>${subs[s].map(installerListRowHtml).join('')}</div>
    `).join('');
    return `
      <div class="inst-group dist" onclick="toggleGroupBody(this)"><span class="chevron open">▶</span><strong><i data-icon="pin" data-size="15"></i> อำเภอ${d}</strong> <span class="inst-group-count">${distTotal} งาน</span></div>
      <div style="padding-left:6px;">${subHtml}</div>`;
  }).join('');
}

function renderInstallerSummary() {
  const el = document.getElementById('installerSummary');
  if (!el) return;
  const jobs = getInstallerTeamJobs();
  const total = jobs.length;
  const done = jobs.filter(p => p.status === 'done').length;
  const cancelled = jobs.filter(p => p.status === 'cancelled').length;
  const pending = total - done - cancelled;
  const toCollect = jobs.filter(p => p.boxType !== 'no_button' && p.paymentStatus !== 'ชำระแล้ว')
    .reduce((sum, p) => sum + (Number(p.paymentAmount) || 0), 0);
  el.innerHTML = `
    <div class="inst-kpi"><div class="inst-kpi-num">${total.toLocaleString()}</div><div class="inst-kpi-label">งานทั้งหมด</div></div>
    <div class="inst-kpi ok"><div class="inst-kpi-num">${done.toLocaleString()}</div><div class="inst-kpi-label">ติดตั้งแล้ว</div></div>
    <div class="inst-kpi pending"><div class="inst-kpi-num">${pending.toLocaleString()}</div><div class="inst-kpi-label">รอติดตั้ง</div></div>
    <div class="inst-kpi money"><div class="inst-kpi-num">${toCollect.toLocaleString()}</div><div class="inst-kpi-label">ยอดที่ต้องเก็บ (บาท)</div></div>`;
}

function renderInstallerView() {
  // วาดได้ทั้งกรณีเป็นทีมติดตั้งจริง และกรณี master กำลังพรีวิวหน้าทีม
  if (currentUserRole !== 'installer' && !installerPreviewTeam) return;
  const _instListWrap = document.getElementById('installerListWrap');
  const _instDetailBox = document.getElementById('installerDetailView');
  // โหมดดูรายละเอียดคนเดียว: ซ่อนรายชื่อ แสดงการ์ดเต็ม + ปุ่มย้อนกลับ
  if (installerDetailId) {
    const job = iotInstallPlan.find(p => p.id === installerDetailId);
    if (job) {
      if (_instListWrap) _instListWrap.style.display = 'none';
      if (_instDetailBox) {
        _instDetailBox.style.display = 'block';
        _instDetailBox.innerHTML = '<button class="btn btn-outline inst-detail-back" onclick="closeInstallerDetail()">← กลับไปรายชื่อ</button>' + installerJobCardHtml(job);
      }
      return;
    }
    installerDetailId = null;
  }
  if (_instListWrap) _instListWrap.style.display = '';
  if (_instDetailBox) { _instDetailBox.style.display = 'none'; _instDetailBox.innerHTML = ''; }
  renderInstallerSummary();
  populateInstallerFilters();
  if (installerCurrentTab === 'jobs') {
    const jobs = getFilteredInstallerJobs();
    const info = document.getElementById('instFilterCountInfo');
    if (info) info.textContent = `แสดง ${jobs.length.toLocaleString()} จาก ${getInstallerTeamJobs().length.toLocaleString()} งาน`;
    const box = document.getElementById('installerJobGroups');
    if (box) box.innerHTML = installerGroupedHtml(jobs);
  } else if (installerCurrentTab === 'today') {
    renderInstallerToday();
  } else if (installerCurrentTab === 'nav') {
    renderInstallerNav();
  }
}

// วันนี้/สัปดาห์นี้: งานที่กำหนดติดตั้งตกอยู่ในสัปดาห์เดียวกับวันนี้
function renderInstallerToday() {
  const box = document.getElementById('installerTabToday');
  if (!box) return;
  const today = todayDateStr();
  const tMonth = getIotMonthYearFromDate(today), tWeek = getIotWeekOfMonthFromDate(today);
  const thisWeek = getInstallerTeamJobs().filter(p => p.installDate &&
    getIotMonthYearFromDate(p.installDate) === tMonth && getIotWeekOfMonthFromDate(p.installDate) === tWeek);
  box.innerHTML = `
    <h3 style="margin:6px 0 10px;"><i data-icon="calendar-range" data-size="15"></i> งานสัปดาห์นี้ (${formatIotPlanWeekLabel(today)}) <span class="badge">${thisWeek.length} งาน</span></h3>
    ${installerGroupedHtml(thisWeek)}`;
}

// นำทาง: เฉพาะงานที่มีลิงก์ Google Maps จัดกลุ่มพื้นที่ให้ไล่เป็นเส้นทางได้
function renderInstallerNav() {
  const box = document.getElementById('installerTabNav');
  if (!box) return;
  const withMap = getInstallerTeamJobs().filter(p => p.mapLink && p.status !== 'done' && p.status !== 'cancelled');
  const without = getInstallerTeamJobs().filter(p => !p.mapLink && p.status !== 'done' && p.status !== 'cancelled');
  box.innerHTML = `
    <p style="font-size:13px; color:var(--muted); margin:6px 0 10px;">งานที่มีพิกัด กดปุ่ม "เปิดแผนที่นำทาง" เพื่อเปิด Google Maps ได้เลย (แสดงเฉพาะงานที่ยังไม่ติดตั้ง)</p>
    ${withMap.length ? installerGroupedHtml(withMap) : '<div class="empty-state-cell"><span class="empty-text">ยังไม่มีงานที่ระบุพิกัด Google Maps</span></div>'}
    ${without.length ? `<div class="inst-nomap"><b><i data-icon="warning" data-size="15"></i> ${without.length} งานยังไม่มีพิกัด</b> — ให้แอดมินใส่ลิงก์ Google Maps ในหน้าแผนก่อน</div>` : ''}`;
}

// ---- ทีมติดตั้งแก้ได้เฉพาะ สถานะ/การชำระเงิน/ยอดชำระ/หมายเหตุ ----
function installerFindJob(id) {
  const e = iotInstallPlan.find(p => p.id === id);
  if (!e) return null;
  const team = installerActiveTeam();
  if (team && e.installTeam !== team) return null; // กันเหนียว: ห้ามแตะงานทีมอื่น
  return e;
}
function installerSyncJob(entry) {
  if (!supabaseClient) return;
  // ส่งขึ้นเฉพาะฟิลด์ที่ทีมติดตั้งแก้ได้ (สถานะ/เงิน/หมายเหตุ + อุปกรณ์ ตู้/ปั๊ม/ท่อ/วาล์ว) — ไม่ใช้ upsert เพราะจะชนสิทธิ์ insert
  supabaseClient.from('iot_install_plan').update({
    status: entry.status || 'pending',
    payment_status: entry.paymentStatus || null,
    payment_amount: (entry.paymentAmount === '' || entry.paymentAmount === undefined || entry.paymentAmount === null) ? null : Number(entry.paymentAmount),
    note: entry.note || null,
    box_type: entry.boxType || null,
    pump_type: entry.pumpType || null,
    pipe_size: entry.pipeSize || null,
    valve_size: entry.valveSize || null,
    scanned_sn: entry.scannedSn || null,
    base_code: entry.baseCode || null,
    updated_by: currentUserName || null,
    updated_at: new Date().toISOString()
  }).eq('id', entry.id).then(({ error }) => {
    if (error) showToast('บันทึกขึ้นระบบไม่สำเร็จ: ' + error.message, 'warn');
  });
}
// ทีมติดตั้งแก้อุปกรณ์หน้างาน (ตู้/ปั๊ม/ท่อ/วาล์ว) เผื่อเกษตรกรเปลี่ยนใจ
function installerSetEquip(id, field, value) {
  const e = installerFindJob(id); if (!e) return;
  e[field] = value;
  if (field === 'boxType' && value === 'no_button') e.paymentStatus = '';
  saveIotPlanToStorage(); renderInstallerView(); installerSyncJob(e);
  showToast('อัปเดตอุปกรณ์แล้ว', 'success');
}

// ===== สแกน QR หน้าตู้ (ได้ค่าเป็น SN) ด้วยกล้องมือถือ (ใช้ jsQR) =====
window._qrStream = null;
window._qrRAF = null;
window._qrOverlay = null;
window._qrTargetId = null;
window._qrDetector = null;
// โหลด jsQR แบบมี fallback หลาย CDN (ที่บอก "ไม่มีเน็ต" เดิม เพราะไฟล์ .min.js ที่ระบุไม่มีจริงบน cdnjs)
function ensureJsQr() {
  return new Promise((resolve, reject) => {
    if (window.jsQR) return resolve();
    const urls = [
      'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
      'https://unpkg.com/jsqr@1.4.0/dist/jsQR.js',
      'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.js'
    ];
    let i = 0;
    const tryNext = () => {
      if (window.jsQR) return resolve();
      if (i >= urls.length) return reject(new Error('โหลดตัวอ่าน QR ไม่ได้'));
      const s = document.createElement('script');
      s.src = urls[i++];
      s.onload = () => (window.jsQR ? resolve() : tryNext());
      s.onerror = () => tryNext();
      document.head.appendChild(s);
    };
    tryNext();
  });
}
async function scanInstallerQr(id) {
  if (isReadOnlyUser) { showToast('บัญชีนี้ดูอย่างเดียว สแกนไม่ได้', 'warn'); return; }
  _qrTargetId = id;
  // 1) ใช้ตัวอ่าน QR ในตัวเครื่องก่อน (BarcodeDetector — Android/Chrome/Edge) ไม่ต้องโหลดเน็ตเลย
  _qrDetector = null;
  if ('BarcodeDetector' in window) {
    try { _qrDetector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { _qrDetector = null; }
  }
  // 2) ถ้าเครื่องไม่มี ค่อยโหลด jsQR (เช่น iOS) — ถ้าโหลดไม่ได้จริงๆ ก็ยังเปิดกล้อง+พิมพ์ SN เองได้
  let jsqrReady = false;
  if (!_qrDetector) { try { await ensureJsQr(); jsqrReady = !!window.jsQR; } catch (e) { jsqrReady = false; } }
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:#000;z-index:100000;display:flex;flex-direction:column;';
  ov.innerHTML =
    '<div style="color:#fff;padding:12px;display:flex;justify-content:space-between;align-items:center;">' +
    '<b><i data-icon="camera" data-size="15"></i> เล็งกล้องไปที่ QR หน้าตู้</b>' +
    '<button class="btn btn-outline" style="background:#fff;color:#111;" onclick="closeQrScan()">ปิด <i data-icon="close" data-size="15"></i></button></div>' +
    '<video id="qrVideo" playsinline muted style="flex:1;width:100%;object-fit:cover;background:#000;"></video>' +
    '<canvas id="qrCanvas" style="display:none;"></canvas>' +
    '<div id="qrHint" style="color:#fff;text-align:center;padding:12px;font-size:14px;">กำลังเปิดกล้อง...</div>';
  document.body.appendChild(ov);
  _qrOverlay = ov;
  const video = ov.querySelector('#qrVideo');
  try {
    _qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    video.srcObject = _qrStream;
    await video.play();
    if (!_qrDetector && !jsqrReady) {
      ov.querySelector('#qrHint').textContent = 'อ่าน QR อัตโนมัติไม่ได้บนเครื่องนี้ — อ่านตัวเลข SN ที่ใต้ QR แล้วปิดหน้านี้ พิมพ์เองได้เลย';
    } else {
      ov.querySelector('#qrHint').textContent = 'เล็งให้ QR อยู่กลางจอ ระบบจะอ่านให้อัตโนมัติ';
      tickQrScan();
    }
  } catch (e) {
    ov.querySelector('#qrHint').textContent = 'เปิดกล้องไม่ได้: ' + (e.message || e) + ' — ปิดแล้วพิมพ์ SN เองได้';
  }
}
async function tickQrScan() {
  const ov = _qrOverlay; if (!ov) return;
  const video = ov.querySelector('#qrVideo');
  try {
    if (_qrDetector && video && video.readyState >= 2 && video.videoWidth) {
      const codes = await _qrDetector.detect(video);
      if (codes && codes.length && codes[0].rawValue) { onQrDecoded(String(codes[0].rawValue).trim()); return; }
    } else if (window.jsQR && video && video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth) {
      const canvas = ov.querySelector('#qrCanvas');
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      if (code && code.data && code.data.trim()) { onQrDecoded(code.data.trim()); return; }
    }
  } catch (e) { /* อ่านเฟรมนี้ไม่ได้ ข้ามไปเฟรมถัดไป */ }
  if (_qrOverlay) _qrRAF = requestAnimationFrame(tickQrScan);
}
function onQrDecoded(text) {
  const id = _qrTargetId;
  closeQrScan();
  if (!id) return;
  installerSetEquip(id, 'scannedSn', text);
  showToast('สแกน SN ได้: ' + text, 'success');
}
function closeQrScan() {
  if (_qrRAF) { cancelAnimationFrame(_qrRAF); _qrRAF = null; }
  if (_qrStream) { try { _qrStream.getTracks().forEach(t => t.stop()); } catch (e) {} _qrStream = null; }
  if (_qrOverlay && _qrOverlay.parentNode) _qrOverlay.parentNode.removeChild(_qrOverlay);
  _qrOverlay = null; _qrTargetId = null;
}

// ===================== ส่งงานหน้างาน: รูป/วีดีโอ/หมุดแปลง (iot_field_submissions) =====================
window.FIELD_PHOTO_SLOTS = [
  { key: 'photo1_url', label: 'ภาพคู่สวนทุเรียน' },
  { key: 'photo2_url', label: 'ภาพคู่ IoT' },
  { key: 'photo3_url', label: 'ภาพการอบรม (2 คน)' },
  { key: 'photo4_url', label: 'ภาพตู้ (เห็นสติกเกอร์)' }
];
window.fieldSubmissionsByNid = new Map();
window.fieldSubModalNid = null;

async function loadFieldSubmissions() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient.from('iot_field_submissions').select('*');
    if (error) { console.warn('โหลดข้อมูลส่งงานไม่สำเร็จ:', error.message); return; }
    fieldSubmissionsByNid = new Map();
    (data || []).forEach(r => { if (r.national_id) fieldSubmissionsByNid.set(r.national_id, r); });
  } catch (e) { console.warn('โหลดข้อมูลส่งงานไม่สำเร็จ:', e.message); }
}

// หาบริบทของเกษตรกรจากเลขบัตร: ใช้ได้ทั้งจากแผนติดตั้ง (iotInstallPlan) และข้อมูลเกษตรกร (allIotRows)
// -> ทำให้แนบรูปได้จากทุกหน้า รวมถึงตาราง "ได้รับตู้แล้ว รอยืนยันเอกสาร"
function fieldSubContext(nid) {
  const p = iotInstallPlan.find(e => e.nationalId === nid);
  if (p) return { nationalId: nid, name: p.name || '', district: p.district || '', subdistrict: p.subdistrict || '', installTeam: p.installTeam || '' };
  const r = (typeof allIotRows !== 'undefined' && allIotRows) ? allIotRows.find(x => x.national_id === nid) : null;
  if (r) return { nationalId: nid, name: `${r.prefix || ''}${r.first_name || ''} ${r.last_name || ''}`.trim(), district: r.farm_district || '', subdistrict: r.farm_subdistrict || '', installTeam: '' };
  return { nationalId: nid, name: '', district: '', subdistrict: '', installTeam: '' };
}
// สิทธิ์แก้ไข: viewer แก้ไม่ได้ / installer แก้ได้เฉพาะงานทีมตัวเอง / แอดมิน IoT แก้ได้หมด
function fieldSubCanEdit(nid) {
  if (isReadOnlyUser) return false;
  // จำกัดสิทธิ์ตามทีมเฉพาะ "ทีมติดตั้งจริง" หรือตอน master กดพรีวิวทีมเท่านั้น
  // แอดมิน/แอดมิน IoT/มาสเตอร์ (แม้บังเอิญมีค่า team ติดในบัญชี) แก้/อัปรูปได้ทุกคนเสมอ
  const scoped = currentUserRole === 'installer' || !!installerPreviewTeam;
  if (!scoped) return true;
  const team = installerActiveTeam();
  if (!team) return false;
  const p = iotInstallPlan.find(e => e.nationalId === nid);
  return !!(p && p.installTeam === team);
}

function fieldSubProgress(nid) {
  const r = fieldSubmissionsByNid.get(nid);
  if (!r) return { photos: 0, hasVideo: false, hasPlot: false, driveSent: false };
  const photos = FIELD_PHOTO_SLOTS.filter(s => r[s.key]).length;
  return { photos, hasVideo: !!r.video_url, hasPlot: !!r.plot_location, driveSent: !!r.drive_sent_at };
}

function openFieldSubmission(nid) {
  if (!nid) return;
  fieldSubModalNid = nid;
  document.getElementById('fieldSubModal').style.display = 'flex';
  renderFieldSubmissionModal(nid);
}
function closeFieldSubmission() {
  fieldSubModalNid = null;
  document.getElementById('fieldSubModal').style.display = 'none';
}

function renderFieldSubmissionModal(nid) {
  const box = document.getElementById('fieldSubBody');
  const job = fieldSubContext(nid);
  if (!box) return;
  const editable = fieldSubCanEdit(nid);
  const r = fieldSubmissionsByNid.get(nid) || {};
  const plotSafe = (r.plot_location || '').replace(/"/g, '&quot;');
  const idSafe = (nid || '').replace(/'/g, "\\'");
  const dis = editable ? '' : 'disabled';
  const photoHtml = FIELD_PHOTO_SLOTS.map((s, i) => {
    const url = r[s.key];
    return `
      <div class="fs-slot">
        <div class="fs-slot-label">${s.label}</div>
        ${url ? `<a href="${url}" target="_blank" rel="noopener"><img src="${url}" class="fs-thumb" alt=""></a>` : '<div class="fs-thumb fs-empty">ยังไม่มีรูป</div>'}
        ${editable ? `<label class="fs-upload-btn">${url ? '<i data-icon="refresh" data-size="15"></i> เปลี่ยนรูป' : '<i data-icon="camera" data-size="15"></i> ถ่าย/เลือกรูป'}
          <input type="file" accept="image/*" capture="environment" style="display:none;" onchange="fieldSubUpload('${idSafe}','${s.key}',this.files[0])">
        </label>
        ${url ? `<button type="button" class="fs-del-btn" onclick="fieldSubDeleteFile('${idSafe}','${s.key}')"><i data-icon="trash" data-size="15"></i> ลบรูป</button>` : ''}` : ''}
      </div>`;
  }).join('');
  box.innerHTML = `
    <div class="fs-job">${job.name || '(ไม่ทราบชื่อ)'} · ${job.district || ''}/${job.subdistrict || ''}</div>

    <div class="fs-section">
      <h4><i data-icon="pin" data-size="15"></i> หมุดแปลง (ตำแหน่งจริง)</h4>
      <div class="fs-plot-row">
        ${editable ? `<button type="button" class="btn btn-brand" onclick="fieldSubUseGps('${idSafe}')"><i data-icon="pin" data-size="15"></i> ใช้ตำแหน่งปัจจุบัน (GPS)</button>` : ''}
        ${r.plot_location ? `<a href="${plotSafe}" target="_blank" rel="noopener" class="btn btn-outline">เปิดดูหมุด</a>` : ''}
      </div>
      <input type="text" value="${plotSafe}" ${dis} placeholder="วางลิงก์ Google Maps / พิกัดเอง (เลื่อนปรับเองได้)" onchange="fieldSubSave('${idSafe}',{plot_location:this.value.trim()})">
    </div>

    <div class="fs-section">
      <h4><i data-icon="camera" data-size="15"></i> รูปภาพ (${FIELD_PHOTO_SLOTS.length} หัวข้อ)</h4>
      <div class="fs-photos">${photoHtml}</div>
    </div>

    <div class="fs-section">
      <h4><i data-icon="video" data-size="15"></i> วีดีโอมอบงาน</h4>
      ${r.video_url ? `<a href="${r.video_url}" target="_blank" rel="noopener" class="btn btn-outline">▶ เปิดวีดีโอที่ส่งแล้ว</a>` : '<div class="fs-hint">ยังไม่ได้ส่งวีดีโอ</div>'}
      ${editable ? `<label class="fs-upload-btn">${r.video_url ? '<i data-icon="refresh" data-size="15"></i> เปลี่ยนวีดีโอ' : '<i data-icon="video" data-size="15"></i> ถ่าย/เลือกวีดีโอ'}
        <input type="file" accept="video/*" capture="environment" style="display:none;" onchange="fieldSubUpload('${idSafe}','video',this.files[0])">
      </label>
      ${r.video_url ? `<button type="button" class="fs-del-btn" onclick="fieldSubDeleteFile('${idSafe}','video_url')"><i data-icon="trash" data-size="15"></i> ลบวีดีโอ</button>` : ''}` : ''}
    </div>

    <div class="fs-section">
      <label class="fs-doc"><input type="checkbox" ${r.document_ok ? 'checked' : ''} ${dis} onchange="fieldSubSave('${idSafe}',{document_ok:this.checked})"> <i data-icon="done" data-size="15"></i> ส่งเอกสารต้นฉบับ (มีลายเซ็น) แล้ว</label>
    </div>
    ${canSendToDrive() ? `
    <div class="fs-section fs-drive">
      <h4><i data-icon="upload" data-size="15"></i> ส่งเข้า Google Drive (จัดโฟลเดอร์ตามชื่อเกษตรกร)</h4>
      <div class="fs-hint">ตรวจรูปให้เรียบร้อยก่อน (ไม่เบลอ/มุมถูก) แล้วกดส่ง — ระบบจะสร้างโฟลเดอร์ชื่อ "${(job.name || '').replace(/"/g, '&quot;')}" แล้วแยกรูปตามหัวข้อให้</div>
      <div class="fs-plot-row" style="margin-top:8px;">
        <button type="button" class="btn btn-brand" onclick="sendSubmissionToDrive('${idSafe}')"><i data-icon="upload" data-size="15"></i> ส่งเข้า Google Drive</button>
        ${r.drive_folder_url ? `<a href="${(r.drive_folder_url || '').replace(/"/g, '&quot;')}" target="_blank" rel="noopener" class="btn btn-outline"><i data-icon="folder" data-size="15"></i> เปิดโฟลเดอร์ใน Drive</a>` : ''}
        ${(isMasterUser && r.drive_sent_at) ? `<button type="button" class="fs-del-btn" onclick="fieldSubResetDrive('${idSafe}')"><i data-icon="trash" data-size="15"></i> ล้างสถานะส่ง Drive (master)</button>` : ''}
      </div>
      ${r.drive_sent_at ? `<div class="fs-hint" style="color:#16a34a;"><i data-icon="done" data-size="15"></i> ส่งเข้า Drive ล่าสุด: ${formatDateTimeThai(r.drive_sent_at)}</div>` : ''}
    </div>` : ''}
  `;
}

// ย่อรูปฝั่งเว็บก่อนอัปโหลด (ประหยัดพื้นที่มาก) คืนค่าเป็น Blob JPEG
function resizeImageFile(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width >= height) { height = Math.round(height * maxDim / width); width = maxDim; }
        else { width = Math.round(width * maxDim / height); height = maxDim; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('resize failed')), 'image/jpeg', quality || 0.72);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('โหลดรูปไม่ได้')); };
    img.src = url;
  });
}

async function fieldSubUpload(nid, slot, file) {
  if (!file || !fieldSubCanEdit(nid)) return;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
    showToast('ยังไม่ได้ตั้งค่า Cloudinary — แจ้งผู้ดูแลใส่ cloud name + upload preset ในโค้ดก่อนครับ', 'warn');
    return;
  }
  const isVideo = slot === 'video';
  if (isVideo && file.size > 100 * 1024 * 1024) { showToast('วีดีโอใหญ่เกิน 100MB ถ่ายสั้นลงหน่อยครับ', 'warn'); return; }
  showToast(isVideo ? 'กำลังอัปโหลดวีดีโอ...' : 'กำลังอัปโหลดรูป...', 'info');
  try {
    let body = file;
    if (!isVideo) body = await resizeImageFile(file, 1600, 0.75);
    const form = new FormData();
    form.append('file', body);
    form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    form.append('folder', 'field-uploads/' + nid);
    const resourceType = isVideo ? 'video' : 'image';
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`, { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok || !data.secure_url) throw new Error((data && data.error && data.error.message) ? data.error.message : 'อัปโหลดไม่สำเร็จ');
    const field = isVideo ? 'video_url' : slot;
    await fieldSubSave(nid, { [field]: data.secure_url });
    showToast('ส่งไฟล์เรียบร้อย', 'success');
  } catch (e) {
    showToast('อัปโหลดไม่สำเร็จ: ' + (e.message || e), 'warn');
  }
}

async function fieldSubDeleteFile(nid, field) {
  if (!fieldSubCanEdit(nid)) return;
  const cur = fieldSubmissionsByNid.get(nid) || {};
  const url = cur[field];
  if (!url) return;
  const ok = await showConfirmModal(field === 'video_url' ? 'ลบวีดีโอนี้ออกหรือไม่?' : 'ลบรูปนี้ออกหรือไม่?');
  if (!ok) return;
  if (supabaseClient && url.includes('supabase') && url.includes('/field-uploads/')) {
    const marker = '/field-uploads/';
    const idx = url.indexOf(marker);
    if (idx >= 0) {
      const p = url.slice(idx + marker.length).split('?')[0];
      try { await supabaseClient.storage.from('field-uploads').remove([decodeURIComponent(p)]); } catch (e) {}
    }
  }
  await fieldSubSave(nid, { [field]: null });
  showToast('ลบแล้ว', 'success');
}

function fieldSubUseGps(nid) {
  if (!fieldSubCanEdit(nid)) return;
  if (!navigator.geolocation) { showToast('อุปกรณ์นี้ไม่รองรับ GPS ครับ', 'warn'); return; }
  showToast('กำลังขอตำแหน่ง GPS...', 'info');
  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude.toFixed(6), lng = pos.coords.longitude.toFixed(6);
      fieldSubSave(nid, { plot_location: `https://www.google.com/maps?q=${lat},${lng}` });
      showToast('บันทึกหมุดจากตำแหน่งปัจจุบันแล้ว', 'success');
    },
    err => { showToast('ขอตำแหน่งไม่สำเร็จ: ' + err.message + ' (ต้องอนุญาตให้เว็บใช้ตำแหน่ง)', 'warn'); },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
}

async function fieldSubSave(nid, patch) {
  if (!fieldSubCanEdit(nid)) return;
  const ctx = fieldSubContext(nid);
  const p = iotInstallPlan.find(e => e.nationalId === nid);
  const cur = fieldSubmissionsByNid.get(nid) || { national_id: nid };
  const row = Object.assign({}, cur, patch, {
    national_id: nid,
    plan_id: p ? p.id : (cur.plan_id || null),
    install_team: ctx.installTeam || null,
    updated_by: currentUserName || null,
    updated_at: new Date().toISOString()
  });
  fieldSubmissionsByNid.set(nid, row);
  if (fieldSubModalNid === nid) renderFieldSubmissionModal(nid);
  renderInstallerView();
  if (currentUserRole !== 'installer') {
    renderIotPlanTable();
    if (typeof applyIotMatchPendingDocSearch === 'function' && document.getElementById('iotMatchPendingDocTbody')) {
      try { applyIotMatchPendingDocSearch(); } catch (e) {}
    }
  }
  if (!supabaseClient) return;
  const { error } = await supabaseClient.from('iot_field_submissions').upsert(row, { onConflict: 'national_id' });
  if (error) showToast('บันทึกไม่สำเร็จ: ' + error.message, 'warn');
}

// ===== ส่งเข้า Google Drive (เฉพาะแอดมิน IoT/ซูเปอร์/มาสเตอร์) =====
function canSendToDrive() {
  return ['admin', 'master', 'admin_iot'].includes(currentUserRole);
}
window.googleTokenClient = null;
window.googleAccessToken = null;
window.googleTokenExpiry = 0;

function loadGoogleGsi() {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) return resolve();
    let s = document.getElementById('gsiScript');
    if (s) { s.addEventListener('load', () => resolve()); s.addEventListener('error', () => reject(new Error('โหลด Google script ไม่ได้'))); return; }
    s = document.createElement('script');
    s.id = 'gsiScript'; s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('โหลด Google script ไม่ได้ (เช็คอินเทอร์เน็ต)'));
    document.head.appendChild(s);
  });
}

async function ensureGoogleToken() {
  if (!GOOGLE_CLIENT_ID) throw new Error('ยังไม่ได้ตั้งค่า Google Client ID ในโค้ด');
  if (googleAccessToken && Date.now() < googleTokenExpiry - 60000) return googleAccessToken;
  await loadGoogleGsi();
  return new Promise((resolve, reject) => {
    try {
      googleTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GOOGLE_DRIVE_SCOPE,
        callback: (resp) => {
          if (resp && resp.error) { reject(new Error(resp.error)); return; }
          googleAccessToken = resp.access_token;
          googleTokenExpiry = Date.now() + ((resp.expires_in ? resp.expires_in : 3600) * 1000);
          resolve(googleAccessToken);
        }
      });
      googleTokenClient.requestAccessToken({ prompt: googleAccessToken ? '' : 'consent' });
    } catch (e) { reject(e); }
  });
}

async function driveFindFolder(name, parentId, token) {
  let q = `name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  if (parentId) q += ` and '${parentId}' in parents`;
  const res = await fetch('https://www.googleapis.com/drive/v3/files?spaces=drive&fields=files(id,name)&q=' + encodeURIComponent(q), { headers: { Authorization: 'Bearer ' + token } });
  const data = await res.json();
  return (data.files && data.files[0]) ? data.files[0].id : null;
}
async function driveCreateFolder(name, parentId, token) {
  const body = { name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) body.parents = [parentId];
  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!data.id) throw new Error('สร้างโฟลเดอร์ใน Drive ไม่สำเร็จ');
  return data.id;
}
async function driveFindOrCreateFolder(name, parentId, token) {
  return (await driveFindFolder(name, parentId, token)) || (await driveCreateFolder(name, parentId, token));
}
async function driveUploadBlob(name, parentId, blob, token) {
  const metadata = { name, parents: [parentId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form });
  const data = await res.json();
  if (!data.id) throw new Error('อัปไฟล์เข้า Drive ไม่สำเร็จ');
  return data.id;
}

async function sendSubmissionToDrive(nid) {
  if (!canSendToDrive()) return;
  const job = fieldSubContext(nid);
  const r = fieldSubmissionsByNid.get(nid) || {};
  const items = [];
  FIELD_PHOTO_SLOTS.forEach((s, i) => { if (r[s.key]) items.push({ url: r[s.key], name: `${i + 1}_${s.label}.jpg` }); });
  if (r.video_url) items.push({ url: r.video_url, name: 'วีดีโอมอบงาน.mp4' });
  if (!items.length) { showToast('ยังไม่มีรูป/วีดีโอให้ส่งครับ ต้องอัปรูปก่อน', 'warn'); return; }
  showToast('กำลังเชื่อม Google Drive... (ครั้งแรกต้องเซ็นชื่อ Google)', 'info');
  try {
    const token = await ensureGoogleToken();
    const rootId = await driveFindOrCreateFolder(DRIVE_ROOT_FOLDER_NAME, null, token);
    const folderName = (job.name || ('เกษตรกร ' + nid)).trim() || ('เกษตรกร ' + nid);
    const folderId = await driveFindOrCreateFolder(folderName, rootId, token);
    let n = 0;
    for (const it of items) {
      showToast(`กำลังส่ง ${it.name} (${n + 1}/${items.length})...`, 'info');
      const blob = await fetch(it.url).then(x => { if (!x.ok) throw new Error('ดึงไฟล์จากที่พักไม่ได้'); return x.blob(); });
      await driveUploadBlob(it.name, folderId, blob, token);
      n++;
    }
    await fieldSubSave(nid, { drive_sent_at: new Date().toISOString(), drive_folder_url: 'https://drive.google.com/drive/folders/' + folderId });
    showToast(`ส่งเข้า Google Drive แล้ว ${n} ไฟล์ — โฟลเดอร์ "${folderName}"`, 'success');
  } catch (e) {
    showToast('ส่งเข้า Drive ไม่สำเร็จ: ' + (e.message || e), 'warn');
  }
}

// ===== master ล้างสถานะ "ส่งเข้า Drive" (เผื่อ test แล้วอยากส่งใหม่) =====
async function fieldSubResetDrive(nid) {
  if (!isMasterUser) { showToast('เฉพาะ master เท่านั้นที่ล้างสถานะได้', 'warn'); return; }
  const ok = await showConfirmModal('ล้างสถานะ "ส่งเข้า Drive" ของรายนี้ออกใช่ไหม?\n(ไฟล์ที่อยู่ใน Drive แล้วจะไม่ถูกลบ — แค่ล้างสถานะในระบบให้กดส่งใหม่ได้)');
  if (!ok) return;
  await fieldSubSave(nid, { drive_sent_at: null, drive_folder_url: null });
  showToast('ล้างสถานะส่ง Drive แล้ว — กดส่งใหม่ได้', 'success');
}

function installerSetStatus(id, value) {
  const e = installerFindJob(id); if (!e) return;
  e.status = value; saveIotPlanToStorage(); renderInstallerView(); installerSyncJob(e);
  showToast('อัปเดตสถานะแล้ว', 'success');
}
function installerSetPaid(id, checked) {
  const e = installerFindJob(id); if (!e) return;
  e.paymentStatus = checked ? 'ชำระแล้ว' : 'ยังไม่ชำระ'; saveIotPlanToStorage(); renderInstallerView(); installerSyncJob(e);
}
function installerSetAmount(id, value) {
  const e = installerFindJob(id); if (!e) return;
  e.paymentAmount = value; saveIotPlanToStorage(); renderInstallerSummary(); installerSyncJob(e);
}
function installerSetNote(id, value) {
  const e = installerFindJob(id); if (!e) return;
  e.note = value; saveIotPlanToStorage(); installerSyncJob(e);
}

// ===================== จัดการผู้ใช้ (เฉพาะ master) + พรีวิวหน้าทีมติดตั้ง =====================
window.umUsersCache = [];

function openUserMgmt() {
  if (!isMasterUser) return;
  document.getElementById('userMgmtModal').style.display = 'flex';
  onUmRoleChange();
  loadUserMgmtData();
}

// expose ฟังก์ชันของโมดูลนี้ให้ inline handlers และโมดูลอื่นเรียกผ่าน window ได้
Object.assign(window, {
  switchInstallerTab, installerActiveTeam, getInstallerTeamJobs, getFilteredInstallerJobs, populateInstallerFilters, installerJobCardHtml,
  escNoteText, installerListRowHtml, openInstallerDetail, closeInstallerDetail, installerGroupedHtml, renderInstallerSummary,
  renderInstallerView, renderInstallerToday, renderInstallerNav, installerFindJob, installerSyncJob, installerSetEquip,
  ensureJsQr, scanInstallerQr, tickQrScan, onQrDecoded, closeQrScan, loadFieldSubmissions,
  fieldSubContext, fieldSubCanEdit, fieldSubProgress, openFieldSubmission, closeFieldSubmission, renderFieldSubmissionModal,
  resizeImageFile, fieldSubUpload, fieldSubDeleteFile, fieldSubUseGps, fieldSubSave, canSendToDrive,
  loadGoogleGsi, ensureGoogleToken, driveFindFolder, driveCreateFolder, driveFindOrCreateFolder, driveUploadBlob,
  sendSubmissionToDrive, fieldSubResetDrive, installerSetStatus, installerSetPaid, installerSetAmount, installerSetNote,
  openUserMgmt,
});
