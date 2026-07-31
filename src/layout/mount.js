// ===== ประกอบหน้าเว็บจาก partial HTML ของแต่ละหน้า =====
// รันเป็นโมดูลแรกสุด เพื่อให้ DOM พร้อมก่อนโค้ดของทุกหน้าเริ่มทำงาน
// โครงสร้าง DOM ที่ได้ต้องเหมือนไฟล์ monolith เดิม 100% (ลำดับ element เดิมทุกตัว)
import authHtml from '../pages/auth/auth.html?raw';
import topbarHtml from './topbar.html?raw';
import installerHtml from '../pages/installer/installer.html?raw';
import statusHtml from '../components/status.html?raw';
import trainingDashboardHtml from '../pages/training/dashboard.html?raw';
import trainingMapHtml from '../pages/training/map.html?raw';
import trainingConfirmHtml from '../pages/training/confirm.html?raw';
import trainingQaHtml from '../pages/training/qa.html?raw';
import trainingPlanHtml from '../pages/training/plan.html?raw';
import iotDashboardHtml from '../pages/iot/dashboard.html?raw';
import iotMapHtml from '../pages/iot/map.html?raw';
import iotQaHtml from '../pages/iot/qa.html?raw';
import iotPlanHtml from '../pages/iot/plan.html?raw';
import iotBoxHtml from '../pages/iot/box.html?raw';
import iotAppMatchHtml from '../pages/iot/app-match.html?raw';
import iotManualCodeHtml from '../pages/iot/manual-code.html?raw';
import iotBlockersHtml from '../pages/iot/blockers.html?raw';
import overlaysHtml from '../components/overlays.html?raw';
import { mountIcons } from '../lib/icons.js';

const page = [
  authHtml,
  '<div id="appShell" style="display:none;">',
  topbarHtml.replace('@@INSTALLER@@', installerHtml),
  '<div class="container">',
  statusHtml,
  trainingDashboardHtml,
  trainingMapHtml,
  trainingConfirmHtml,
  iotDashboardHtml,
  iotMapHtml,
  iotQaHtml,
  trainingQaHtml,
  trainingPlanHtml,
  iotPlanHtml,
  iotBoxHtml,
  iotAppMatchHtml,
  iotManualCodeHtml,
  iotBlockersHtml,
  '</div>', // .container
  '</div>', // #appShell
  overlaysHtml,
].join('\n');

document.body.insertAdjacentHTML('afterbegin', page);

// แปลง <i data-icon="..."> ใน partial ทั้งหมดให้เป็น SVG จริง
mountIcons(document);
