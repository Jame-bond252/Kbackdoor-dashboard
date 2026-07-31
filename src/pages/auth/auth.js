// ===== หน้าล็อกอิน/สมัครสมาชิก (สลับ view ของ auth gate) =====
// แยกมาจาก main.js เดิม — ตัวแปร/ฟังก์ชันแชร์ผ่าน window (โค้ดเดิมออกแบบเป็น global scope)


function showAuthError(elId, message) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
}

function clearAuthError(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = '';
  el.classList.remove('show');
}

// ===================== หน้าทีมติดตั้ง (role = 'installer') =====================
// เปิด/ปิดโหมดทีมติดตั้ง: ซ่อน UI ปกติทั้งหมด แสดงเฉพาะหน้าของทีม (เห็นเฉพาะงานทีมตัวเอง)
function applyInstallerMode(on) {
  const shell = document.getElementById('installerShell');
  if (shell) shell.style.display = on ? 'block' : 'none';
  // ซ่อนส่วนของแอดมิน/ผู้ดูทั้งหมดเมื่อเป็นทีมติดตั้ง (หรือตอน master พรีวิว)
  ['.module-switcher', '.global-search-wrap', '#qaBubbleBtn']
    .forEach(sel => document.querySelectorAll(sel).forEach(el => { el.style.display = on ? 'none' : ''; }));
  document.querySelectorAll('.tab-content').forEach(el => { el.style.display = on ? 'none' : ''; });
  // แถบเมนู 2 ฝั่ง (อบรม/IoT): ตอนโหมดทีมติดตั้งซ่อนทั้งคู่ / ตอนกลับมาโชว์ตามโมดูลที่เปิดอยู่เท่านั้น
  // (กันบั๊ก: เดิมเผลอสั่งโชว์ทั้ง 2 แถบพร้อมกันตอนล็อกอิน/ออกจากพรีวิว)
  const tbTrain = document.getElementById('tabbarTraining');
  const tbIot = document.getElementById('tabbarIot');
  if (tbTrain) tbTrain.style.display = on ? 'none' : (currentModule === 'training' ? 'flex' : 'none');
  if (tbIot) tbIot.style.display = on ? 'none' : (currentModule === 'iot' ? 'flex' : 'none');
  // ป้าย "ดูอย่างเดียว" + ปุ่ม "ผู้ใช้": จัดการแยกตาม role ไม่เหมารวม
  // (กันบั๊ก: ตอนออกจากพรีวิว ป้ายดูอย่างเดียวเคยโผล่ผิดกับ master ที่ไม่ใช่ viewer)
  const roBadge = document.getElementById('readOnlyBadge');
  if (roBadge) roBadge.style.display = (!on && isReadOnlyUser) ? '' : 'none';
  const umBtn = document.getElementById('userMgmtBtn');
  if (umBtn) umBtn.style.display = (!on && isMasterUser) ? '' : 'none';
  const teamLabel = document.getElementById('installerTeamName');
  if (teamLabel) teamLabel.textContent = installerActiveTeam() || '(ยังไม่ได้ตั้งทีม)';
  const banner = document.getElementById('installerPreviewBanner');
  if (banner) banner.style.display = (on && installerPreviewTeam) ? 'flex' : 'none';
  const pt = document.getElementById('installerPreviewTeamName');
  if (pt) pt.textContent = installerPreviewTeam || '';
}

// expose ฟังก์ชันของโมดูลนี้ให้ inline handlers และโมดูลอื่นเรียกผ่าน window ได้
Object.assign(window, {
  showAuthError, clearAuthError, applyInstallerMode,
});
