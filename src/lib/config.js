// ===== ค่าตั้งต้น: Supabase env + Cloudinary/Google Drive (ที่เก็บรูปทีมหน้างาน) =====
// แยกมาจาก main.js เดิม — ตัวแปร/ฟังก์ชันแชร์ผ่าน window (โค้ดเดิมออกแบบเป็น global scope)


// ค่าเชื่อมต่อ Supabase: อ่านจากไฟล์ .env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
window.SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
window.SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ===== ที่เก็บรูป/วีดีโอของทีมหน้างาน: Cloudinary (ฟรี ~25GB, โชว์รูปในแอปได้เลย) =====
// วิธีเอาค่า 2 อันนี้ (ทำครั้งเดียว):
//   1) สมัคร cloudinary.com (ฟรี) -> หน้า Dashboard จะเห็น "Cloud name" -> เอามาใส่ CLOUDINARY_CLOUD_NAME
//   2) Settings (รูปเฟือง) -> Upload -> เลื่อนหา "Upload presets" -> Add upload preset
//      -> ตั้ง "Signing Mode" = Unsigned -> Save -> เอาชื่อ preset มาใส่ CLOUDINARY_UPLOAD_PRESET
// ค่าพวกนี้ไม่ใช่ความลับ ฝังในโค้ดฝั่งเว็บได้ (unsigned upload ปลอดภัยพอสำหรับงานภายใน)
window.CLOUDINARY_CLOUD_NAME = 'dca8zutx';     // <-- ใส่ cloud name ของคุณตรงนี้
window.CLOUDINARY_UPLOAD_PRESET = 'ml_default';  // <-- ใส่ชื่อ unsigned upload preset ของคุณตรงนี้

// ===== ส่งรูป/วีดีโอที่ตรวจแล้วเข้า Google Drive (แอดมิน IoT กดส่ง จัดเป็นโฟลเดอร์ตามชื่อเกษตรกร) =====
// วิธีเอาค่า (ทำครั้งเดียว): console.cloud.google.com -> สร้างโปรเจกต์ -> เปิด "Google Drive API"
//   -> OAuth consent screen (External, เพิ่มอีเมลแอดมินเป็น test user) -> Credentials -> Create OAuth client ID
//   -> Application type = Web application -> Authorized JavaScript origins = URL ที่โฮสต์เว็บนี้ (เช่น https://xxx)
//   -> เอา "Client ID" มาใส่ตรงนี้
// สำคัญ: ต้องเปิดเว็บผ่าน http(s) (โฮสต์ไว้) การเซ็นชื่อ Google ใช้กับ file:// ไม่ได้
window.GOOGLE_CLIENT_ID = '903242433455-kh71ggl1guakfr0f16f92ec1lqp2sqfm.apps.googleusercontent.com';  // <-- ใส่ OAuth Client ID (web) ของคุณตรงนี้
window.GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
window.DRIVE_ROOT_FOLDER_NAME = 'OTOD รูปติดตั้ง';

window.supabaseClient = null;
window.allRows = [];
window.PLAN_STORAGE_KEY = 'otod_training_plan_v1';
window.trainingPlan = [];
window.planLookbackDays = 7;
window.planTimelineChart = null;
window.planCalendarSelectedDate = null;
window.planCurrentView = 'table';
window.planCalendarMonth = null; // {year, month(0-11)} ของเดือนที่กำลังแสดงในปฏิทิน

window.IOT_PLAN_STORAGE_KEY = 'otod_iot_install_plan_v1';
window.iotInstallPlan = [];
window.iotPlanLookbackDays = 7;
window.iotPlanTimelineChart = null;
window.iotPlanCalendarSelectedDate = null;
window.iotPlanCurrentView = 'table';
window.iotPlanCalendarMonth = null; // {year, month(0-11)} ของเดือนที่กำลังแสดงในปฏิทิน
window.currentIotPeoplePanelProvince = null;
window.currentIotPeoplePanelDistrict = null;
window.currentIotPeoplePanelMode = null; // 'district' | 'province' | null — ใช้ตอน refresh พาแนลหลังเพิ่มคนเข้าแผน
window.provinceChart = null;

window.geoProvinces = null;
window.geoDistricts = null;
window.geoDataLoading = false;
window.countryProjection = null;
window.countryPathGen = null;
window.provinceNameToCode = {};

window.mapView = 'country';        // 'country' | 'province' | 'district'
window.currentProvinceCode = null;
window.currentDistrictName = null;
window.currentPeoplePanelProvince = null;
window.currentPeoplePanelDistrict = null;
window.currentPeoplePanelMode = null; // 'district' | 'province' | null — ใช้ตอน refresh พาแนลหลังเพิ่มคนเข้าแผน
window.hideAddedPeopleInPanel = true; // ซ่อนคนที่เพิ่มเข้าแผนแล้วออกจากรายชื่อที่เลือกได้ (ลดความรก โดยเฉพาะจังหวัดที่มีคนเยอะ)
// โหมด "เลือกวันที่ก่อน": ตั้งช่วงวันที่ไปอบรมไว้ล่วงหน้า แล้วคนที่เพิ่มเข้าแผนระหว่างเปิดโหมดนี้จะได้วันที่ (แบ่งตามตำบล) ให้อัตโนมัติ
window.mapPreschedule = { enabled: false, start: '', end: '', subdistrictDates: {} };
window.currentViewBox = [0, 0, 460, 620];
window.viewBoxAnimId = null;

window.SVG_W = 460;
window.SVG_H = 620;

function normName(s) { return (s || '').normalize('NFC').trim(); }

// ----- การแจ้งเตือนแบบสวยงาม (แทน alert/confirm ของเบราว์เซอร์) -----
function showToast(message, type, duration) {
  type = type || 'info';
  duration = duration || (type === 'error' ? 6000 : 3500);
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const icons = { success: 'done', error: 'danger', warn: 'warning', info: 'info' };
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  const iconSpan = document.createElement('span');
  iconSpan.className = 'toast-icon';
  iconSpan.innerHTML = icon(icons[type] || icons.info, 16);
  const msgSpan = document.createElement('span');
  msgSpan.className = 'toast-msg';
  msgSpan.textContent = message;
  toast.appendChild(iconSpan);
  toast.appendChild(msgSpan);
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// expose ฟังก์ชันของโมดูลนี้ให้ inline handlers และโมดูลอื่นเรียกผ่าน window ได้
Object.assign(window, {
  normName, showToast,
});
