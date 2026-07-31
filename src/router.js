// ===== Hash router: ทุก action หลักของแต่ละหน้ามีทิศทางใน URL (#/module/tab/sub/view) =====
// ตัวอย่างเส้นทาง:
//   #/login  #/signup  #/pending                    — หน้า auth (ยังไม่ล็อกอิน)
//   #/training/dashboard  #/training/map            — โมดูลอบรม
//   #/training/plan/table  #/training/plan/calendar — มุมมองแผนอบรม
//   #/iot/dashboard  #/iot/box  #/iot/app-match     — โมดูล IoT
//   #/iot/plan/table/calendar  #/iot/plan/table/call — มุมมองแผนติดตั้ง
//   #/iot/plan/finalized  #/iot/plan/appmatch  #/iot/plan/legacycheck — แท็บย่อยแผนติดตั้ง
//   #/installer/jobs  #/installer/today  #/installer/nav — หน้าทีมติดตั้ง
// รองรับปุ่ม back/forward ของเบราว์เซอร์ และ deep link (เปิดลิงก์แล้วเข้าหน้านั้นทันทีหลังล็อกอิน)

const TRAINING_TABS = { dashboard: 'dashboard', map: 'map', confirm: 'training-confirm', plan: 'plan' };
const IOT_TABS = {
  dashboard: 'iot-dashboard', map: 'iot-map', plan: 'iot-plan', box: 'iot-box',
  'app-match': 'iot-app-match', 'manual-code': 'iot-manual-code', blockers: 'iot-blockers',
};
const DOM_TO_PATH = {};
Object.entries(TRAINING_TABS).forEach(([k, v]) => { DOM_TO_PATH[v] = ['training', k]; });
Object.entries(IOT_TABS).forEach(([k, v]) => { DOM_TO_PATH[v] = ['iot', k]; });

const AUTH_VIEWS = ['login', 'signup', 'pending'];
const IOT_PLAN_SUBS = ['table', 'finalized', 'appmatch', 'legacycheck'];

let applying = false;      // กำลัง apply route -> ห้าม wrapper เขียน hash ซ้อน
let appReady = false;      // ล็อกอินแล้ว (appShell โชว์อยู่)
let authView = 'login';
let installerTab = 'jobs';
let lastWritten = '';
// จำ deep link ที่เปิดมาก่อนล็อกอิน ไว้พาไปหน้านั้นทันทีที่เข้าระบบสำเร็จ
let pendingRoute = /^#\/(training|iot|installer)\b/.test(location.hash) ? location.hash : '';

function visible(el) { return !!el && getComputedStyle(el).display !== 'none'; }

// อ่านสถานะปัจจุบันจาก DOM ตรงๆ (DOM คือ source of truth — กันพลาดจากการเรียกฟังก์ชันภายในข้ามกัน)
function currentAppPath() {
  const inst = document.getElementById('installerShell');
  if (visible(inst)) {
    const b = inst.querySelector('.inst-tab-btn.active');
    return ['installer', (b && b.dataset.itab) || installerTab];
  }
  const active = document.querySelector('.tab-content.active');
  const domTab = active ? active.id.replace(/^tab-/, '') : 'dashboard';
  const path = (DOM_TO_PATH[domTab] || ['training', 'dashboard']).slice();

  if (domTab === 'plan') {
    if (visible(document.getElementById('planCalendarView'))) path.push('calendar');
  }
  if (domTab === 'iot-plan') {
    const subBtn = document.querySelector('#tab-iot-plan .view-toggle-btn[data-subtab].active');
    const sub = (subBtn && subBtn.dataset.subtab) || 'table';
    path.push(sub);
    if (sub === 'table') {
      if (visible(document.getElementById('iotPlanCalendarView'))) path.push('calendar');
      else if (visible(document.getElementById('iotPlanCallView'))) path.push('call');
    }
  }
  return path;
}

function buildHash() {
  if (!appReady) return '#/' + authView;
  return '#/' + currentAppPath().join('/');
}

function syncHash() {
  if (applying) return;
  const h = buildHash();
  if (location.hash !== h) { lastWritten = h; location.hash = h; }
}

function applyRoute(h) {
  const seg = (h || '').replace(/^#\/?/, '').split('/').filter(Boolean);

  if (!appReady) {
    if (AUTH_VIEWS.includes(seg[0]) && typeof window.showAuthView === 'function') {
      applying = true;
      try { window.showAuthView(seg[0]); } finally { applying = false; }
      authView = seg[0];
    }
    return;
  }

  applying = true;
  try {
    if (seg[0] === 'installer') {
      if (seg[1] && typeof window.switchInstallerTab === 'function') window.switchInstallerTab(seg[1]);
      return;
    }
    const mod = seg[0] === 'iot' ? 'iot' : 'training';
    const allowed = typeof window.getAllowedModules === 'function' ? window.getAllowedModules() : ['training', 'iot'];
    if (!allowed.includes(mod)) return;

    const tabs = mod === 'iot' ? IOT_TABS : TRAINING_TABS;
    const tabKey = tabs[seg[1]] ? seg[1] : 'dashboard';
    if (window.currentModule !== mod && typeof window.switchModule === 'function') window.switchModule(mod);
    if (typeof window.switchTab === 'function') window.switchTab(tabs[tabKey]);

    if (mod === 'training' && tabKey === 'plan' && typeof window.switchPlanView === 'function') {
      window.switchPlanView(seg[2] === 'calendar' ? 'calendar' : 'table');
    }
    if (mod === 'iot' && tabKey === 'plan') {
      const sub = IOT_PLAN_SUBS.includes(seg[2]) ? seg[2] : 'table';
      if (typeof window.switchIotPlanSubTab === 'function') window.switchIotPlanSubTab(sub);
      if (sub === 'table' && typeof window.switchIotPlanView === 'function') {
        window.switchIotPlanView(['calendar', 'call'].includes(seg[3]) ? seg[3] : 'call');
      }
    }
  } finally {
    applying = false;
  }
  syncHash(); // normalize hash ให้ตรงกับสถานะจริง
}

// ---- wrap ฟังก์ชันนำทางทั้งหมดบน window: ทำงานเดิมก่อน แล้วค่อยอัปเดต hash ตาม DOM ----
const NAV_FNS = [
  'switchModule', 'switchTab', 'switchPlanView', 'switchIotPlanView', 'switchIotPlanSubTab',
  'switchInstallerTab', 'showAuthView', 'enterInstallerPreview', 'enterInstallerPreviewFromSelect',
  'exitInstallerPreview', 'handleLogout',
];
NAV_FNS.forEach((name) => {
  const orig = window[name];
  if (typeof orig !== 'function') return;
  window[name] = function (...args) {
    const r = orig.apply(this, args);
    if (name === 'showAuthView' && AUTH_VIEWS.includes(args[0])) authView = args[0];
    if (name === 'switchInstallerTab' && typeof args[0] === 'string') installerTab = args[0];
    queueMicrotask(syncHash); // รอให้ DOM นิ่งก่อนค่อยอ่านสถานะ
    return r;
  };
});

// ---- ตรวจว่าเข้า/ออกระบบเมื่อไหร่ ด้วยการเฝ้าดู style ของ appShell (ไม่ต้องยุ่งกับ flow ล็อกอินเดิม) ----
function updateReady() {
  const shell = document.getElementById('appShell');
  const nowVisible = visible(shell);
  if (nowVisible && !appReady) {
    appReady = true;
    if (pendingRoute) { const r = pendingRoute; pendingRoute = ''; applyRoute(r); }
    else syncHash();
  } else if (!nowVisible && appReady) {
    appReady = false;
    syncHash();
  }
}
const shellEl = document.getElementById('appShell');
if (shellEl) new MutationObserver(updateReady).observe(shellEl, { attributes: true, attributeFilter: ['style'] });

// ---- ปุ่ม back/forward + พิมพ์ URL เอง ----
window.addEventListener('hashchange', () => {
  if (location.hash === lastWritten) { lastWritten = ''; return; } // hash ที่เราเขียนเอง ไม่ต้อง apply ซ้ำ
  applyRoute(location.hash);
});

// ---- ตอนโหลดครั้งแรก ----
if (!location.hash) history.replaceState(null, '', '#/' + authView);
else if (AUTH_VIEWS.includes(location.hash.replace(/^#\//, ''))) applyRoute(location.hash);
updateReady();
