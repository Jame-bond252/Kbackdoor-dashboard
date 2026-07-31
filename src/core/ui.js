// ===== UI กลาง: toast/confirm แทน alert + สลับโมดูล (อบรม/IoT) + สลับแท็บ =====
// แยกมาจาก main.js เดิม — ตัวแปร/ฟังก์ชันแชร์ผ่าน window (โค้ดเดิมออกแบบเป็น global scope)


function showConfirmModal(message) {
  return new Promise(resolve => {
    const overlay = document.getElementById('confirmModalOverlay');
    const msgEl = document.getElementById('confirmModalMessage');
    const yesBtn = document.getElementById('confirmModalYes');
    const noBtn = document.getElementById('confirmModalNo');
    if (!overlay || !msgEl || !yesBtn || !noBtn) { resolve(window.confirm(message)); return; }
    msgEl.textContent = message;
    overlay.style.display = 'flex';
    function cleanup(result) {
      overlay.style.display = 'none';
      yesBtn.removeEventListener('click', onYes);
      noBtn.removeEventListener('click', onNo);
      overlay.removeEventListener('click', onOverlayClick);
      resolve(result);
    }
    function onYes() { cleanup(true); }
    function onNo() { cleanup(false); }
    function onOverlayClick(e) { if (e.target === overlay) cleanup(false); }
    yesBtn.addEventListener('click', onYes);
    noBtn.addEventListener('click', onNo);
    overlay.addEventListener('click', onOverlayClick);
  });
}

function fillClipMarkup(d, bounds, pct, uid) {
  const x0 = bounds[0][0], y0 = bounds[0][1], x1 = bounds[1][0], y1 = bounds[1][1];
  const p = Math.max(0, Math.min(100, pct));
  const fillTop = y1 - (y1 - y0) * (p / 100);
  const clipId = 'clip-' + uid;
  const w = Math.max(x1 - x0, 1);
  const h = Math.max(y1 - y0, 1);

  // เต็ม 100% หรือ 0% -> สีทึบไปเลย ไม่ต้องมีคลื่น
  if (p >= 99.5) {
    return `<clipPath id="${clipId}"><path d="${d}"></path></clipPath>` +
      `<path d="${d}" fill="#3f9e88" clip-path="url(#${clipId})"></path>`;
  }
  if (p <= 0.5) {
    return `<clipPath id="${clipId}"><path d="${d}"></path></clipPath>` +
      `<path d="${d}" fill="#d9695f" clip-path="url(#${clipId})"></path>`;
  }

  // ผิวน้ำ: เส้นแบ่งเขียว/แดงเป็นลูกคลื่น แล้วเลื่อนซ้าย-ขวาต่อเนื่อง (ลูปเนียนเพราะคลื่นเป็นคาบ)
  const wl = Math.max(w / 2.4, 4);                       // ความยาวลูกคลื่น
  const amp = Math.min(h * 0.045, Math.max(w * 0.035, 0.7)); // ความสูงคลื่น
  const startX = x0 - wl * 2;
  const n = Math.ceil((w + wl * 4) / wl);
  let wave = `M ${startX} ${fillTop}`;
  for (let i = 0; i < n; i++) {
    wave += ` q ${wl / 4} ${-amp} ${wl / 2} 0 q ${wl / 4} ${amp} ${wl / 2} 0`;
  }
  wave += ` L ${startX + n * wl} ${y1 + 4} L ${startX} ${y1 + 4} Z`;

  return `<clipPath id="${clipId}"><path d="${d}"></path></clipPath>` +
    `<path d="${d}" fill="#d9695f" clip-path="url(#${clipId})"></path>` +
    `<g clip-path="url(#${clipId})">` +
      `<path d="${wave}" fill="#3f9e88" opacity="0.55">` +
        `<animateTransform attributeName="transform" type="translate" values="${-wl} 0; 0 0" dur="5.2s" repeatCount="indefinite"/>` +
      `</path>` +
      `<path d="${wave}" fill="#3f9e88">` +
        `<animateTransform attributeName="transform" type="translate" values="0 ${amp * 0.7}; ${-wl} ${amp * 0.7}" dur="3.4s" repeatCount="indefinite"/>` +
      `</path>` +
    `</g>`;
}

function toggleTheme() {
  const root = document.documentElement;
  const isDark = root.getAttribute('data-theme') === 'dark';
  if (isDark) { root.removeAttribute('data-theme'); localStorage.setItem('otod_theme', 'light'); }
  else { root.setAttribute('data-theme', 'dark'); localStorage.setItem('otod_theme', 'dark'); }
  document.getElementById('themeToggleBtn').innerHTML = icon(isDark ? 'moon' : 'sun', 16);
  if (typeof refreshThemedCharts === 'function') refreshThemedCharts();
}

window.currentModule = 'training';
window.currentUserEmail = ''; // อีเมลผู้ใช้ที่ล็อกอินอยู่ตอนนี้ (ใช้บันทึกว่าใครแก้ไขข้อมูลล่าสุด)
window.currentUserName = '';  // ชื่อที่ใช้แสดง (จากตาราง allowed_users ถ้ามี ไม่งั้นใช้ส่วนหน้า @ ของอีเมล)
window.currentUserRole = 'admin'; // 'admin' = แก้ไขได้ / 'viewer' = ดูอย่างเดียว (อ่านจากคอลัมน์ role ใน allowed_users)
window.isReadOnlyUser = false;    // ทางลัดของ currentUserRole === 'viewer'
window.currentUserTeam = '';      // ทีมที่บัญชีนี้สังกัด (ใช้เฉพาะ role='installer')
window.isMasterUser = false;      // ทางลัดของ currentUserRole === 'master'
window.installerPreviewTeam = null; // master พรีวิวหน้าทีมติดตั้งของทีมนี้ (ไม่ต้องสลับรหัส)
window.installerCurrentTab = 'jobs'; // แท็บที่เปิดอยู่ในหน้าทีมติดตั้ง

// ใช้ขึ้นต้นทุกฟังก์ชันที่เขียนข้อมูล: ถ้าเป็นบัญชีดูอย่างเดียวให้หยุดทันทีแล้วบอกผู้ใช้
// (ด่านจริงอยู่ที่ RLS ฝั่งฐานข้อมูล ตรงนี้แค่กันไม่ให้กดแล้วงงว่าทำไมไม่มีอะไรเกิดขึ้น)
function blockIfReadOnly() {
  if (!isReadOnlyUser) return false;
  showToast('บัญชีนี้เป็นแบบ "ดูอย่างเดียว" จึงแก้ไขข้อมูลไม่ได้ครับ (ดูและส่งออกไฟล์ได้ตามปกติ)', 'warn');
  return true;
}

// ซ่อน/ปิดปุ่มแก้ไขทั้งหน้าเมื่อเป็นบัญชีดูอย่างเดียว
function applyReadOnlyUiMode() {
  document.body.classList.toggle('readonly-mode', isReadOnlyUser);
  const badge = document.getElementById('readOnlyBadge');
  if (badge) badge.style.display = isReadOnlyUser ? '' : 'none';
  // ปุ่มที่เป็นการแก้ไขล้วนๆ ในหน้าจอหลัก (ปุ่มพวกนี้อยู่ใน HTML ตายตัว เลยซ่อนด้วย id ตรงๆ ได้)
  READONLY_HIDDEN_BUTTON_SELECTORS.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => { el.style.display = isReadOnlyUser ? 'none' : ''; });
  });
}

// ปุ่ม/แถบที่ต้องซ่อนสำหรับบัญชีดูอย่างเดียว (ปุ่มส่งออก Excel/PDF ไม่อยู่ในลิสต์นี้ เพราะยังให้ใช้ได้)
window.READONLY_HIDDEN_BUTTON_SELECTORS = [
  '[onclick^="clearPlan"]', '[onclick^="clearIotPlan"]',
  '[onclick^="optimizePlanRoute"]', '[onclick^="optimizeIotPlanRoute"]',
  '[onclick^="toggleDateRangeTool"]', '[onclick^="confirmDateRangeTool"]',
  '#planBulkOperatorBar', '#iotPlanBulkOperatorBar',
  '#docChecklistModalSave', '#installBlockerModalSave', '#installBlockerModalRemove',
  '#trainingConfirmBulkBar'
];

// สิทธิ์เข้าเมนูรายฝั่ง: admin_training เห็นเฉพาะอบรม, admin_iot เห็นเฉพาะ IoT, ที่เหลือเห็นทั้ง 2
function getAllowedModules() {
  if (currentUserRole === 'admin_training') return ['training'];
  if (currentUserRole === 'admin_iot') return ['iot'];
  return ['training', 'iot'];
}
function applyModuleAccess() {
  const allowed = getAllowedModules();
  document.querySelectorAll('.module-btn[data-module]').forEach(btn => {
    btn.style.display = allowed.includes(btn.dataset.module) ? '' : 'none';
  });
  const switcher = document.querySelector('.module-switcher');
  if (switcher) switcher.style.display = allowed.length > 1 ? '' : 'none';
  if (!allowed.includes(currentModule)) switchModule(allowed[0]);
  // บังคับซ่อนแถบเมนู (tabbar) ของฝั่งที่ไม่มีสิทธิ์ไว้เสมอ (กันหลุดจากทางอื่น)
  const tbTrain = document.getElementById('tabbarTraining');
  const tbIot = document.getElementById('tabbarIot');
  if (tbTrain && !allowed.includes('training')) tbTrain.style.display = 'none';
  if (tbIot && !allowed.includes('iot')) tbIot.style.display = 'none';
}

function switchModule(module) {
  if (!getAllowedModules().includes(module)) { showToast('บัญชีนี้ไม่มีสิทธิ์เข้าเมนูฝั่งนี้ครับ', 'warn'); return; }
  currentModule = module;
  closeQaBubble();
  document.querySelectorAll('.module-btn').forEach(b => b.classList.remove('active'));
  const modBtn = document.querySelector('.module-btn[data-module="' + module + '"]');
  if (modBtn) modBtn.classList.add('active');
  document.getElementById('tabbarTraining').style.display = module === 'training' ? 'flex' : 'none';
  document.getElementById('tabbarIot').style.display = module === 'iot' ? 'flex' : 'none';
  // ชื่อแบรนด์บนหัวเว็บคงที่ — เปลี่ยนเฉพาะ title ของแท็บเบราว์เซอร์
  document.title = module === 'training' ? 'Kasetkorn OTOD — อบรม' : 'Kasetkorn OTOD — ติดตั้ง IoT';
  if (module === 'training') {
    switchTab('dashboard');
  } else {
    if (!iotDataLoaded) loadIotData();
    switchTab('iot-dashboard');
  }
}

function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  const btn = document.querySelector('.tab-btn[data-tab="' + tab + '"]');
  if (btn) btn.classList.add('active');
  if (tab === 'map' && allRows.length) {
    renderScoreboard(allRows);
    renderLeaderboard(allRows);
    ensureMapDataLoaded();
  }
  if (tab === 'iot-map') {
    ensureMapDataLoaded();
    if (!iotDataLoaded) {
      loadIotData();
    } else {
      const visible = getIotVisibleRows();
      renderIotScoreboard(visible);
      renderIotLeaderboard(visible);
      maybeRenderIotMap();
    }
  }
  if (tab === 'iot-dashboard' && iotDataLoaded) {
    const visible = getIotVisibleRows();
    renderIotKpis(visible);
    renderIotProvinceBreakdown(visible);
    applyIotFilters();
  }
  // กราฟนัดหมายรายวันย้ายมาอยู่แดชบอร์ด — วาดใหม่ตอนแท็บโชว์ (canvas ที่ซ่อนอยู่วาดไม่ได้)
  if (tab === 'iot-dashboard') {
    try { renderIotPlanDashboard(); } catch (e) { /* ยังไม่มีข้อมูลแผน ไม่เป็นไร */ }
  }
  if (tab === 'dashboard') {
    try { renderPlanDashboard(); } catch (e) { /* ยังไม่มีข้อมูลแผน ไม่เป็นไร */ }
  }
  if (tab === 'qa') {
    const log = document.getElementById('qaLog');
    if (log && !log.dataset.greeted) {
      log.dataset.greeted = '1';
      appendQaMessage('สวัสดีครับ ถามได้เลยเช่น "จังหวัดสุโขทัยอบรมไปกี่คน" หรือกดปุ่มคำถามแนะนำด้านบนก็ได้ครับ', 'bot');
    }
  }
  if (tab === 'iot-qa') {
    const log = document.getElementById('iotQaLog');
    if (log && !log.dataset.greeted) {
      log.dataset.greeted = '1';
      appendQaMessage('สวัสดีครับ ถามได้เลยเช่น "จังหวัดเลยติดตั้งไปกี่คน" หรือกดปุ่มคำถามแนะนำด้านบนก็ได้ครับ', 'bot', 'iotQaLog');
    }
  }
  if (tab === 'plan') {
    renderPlanTable();
  }
  if (tab === 'training-confirm') {
    renderTrainingConfirmTab();
  }
  if (tab === 'iot-plan') {
    renderIotPlanTable();
    // มุมมองเริ่มต้นคือโทรนัด — วาดคิวทันทีที่เปิดแท็บ
    try { if (getComputedStyle(document.getElementById('iotPlanCallView')).display !== 'none') renderIotCallView(); } catch (e) { /* ข้อมูลยังไม่มา */ }
  }
  if (tab === 'iot-box') {
    renderIotBoxTeamDashboard();
  }
  if (tab === 'iot-app-match') {
    if (!iotDataLoaded) {
      loadIotData().then(renderIotAppMatchDashboard);
    } else {
      renderIotAppMatchDashboard();
    }
  }
  if (tab === 'iot-manual-code') {
    const afterLoad = () => { renderIotManualCodeSearchResults(); renderIotManualCodeList(); };
    if (!iotDataLoaded) {
      loadIotData().then(afterLoad);
    } else {
      afterLoad();
    }
  }
  if (tab === 'iot-blockers') {
    const afterLoad = () => { renderIotBlockerSearchResults(); renderIotBlockerList(); renderIotCancelledLegacyList(); };
    if (!iotDataLoaded) {
      loadIotData().then(afterLoad);
    } else {
      afterLoad();
    }
    renderIotCancelledLegacyList();
  }
}

// ===== ค้นหาข้ามทุกเมนู (แผนอบรม / แผนติดตั้ง IoT / เชื่อมต่อแอป / ข้อมูล OTOD) =====
window.globalSearchDebounceTimer = null;

function onGlobalSearchInput(value) {
  clearTimeout(globalSearchDebounceTimer);
  globalSearchDebounceTimer = setTimeout(() => renderGlobalSearchResults(value), 150);
}

// expose ฟังก์ชันของโมดูลนี้ให้ inline handlers และโมดูลอื่นเรียกผ่าน window ได้
Object.assign(window, {
  showConfirmModal, fillClipMarkup, toggleTheme, blockIfReadOnly, applyReadOnlyUiMode, getAllowedModules,
  applyModuleAccess, switchModule, switchTab, onGlobalSearchInput,
});
