// ===== จุดเข้าโปรแกรม: ลำดับ import ต้องตรงกับลำดับโค้ดใน monolith เดิม =====
import './styles/tokens.css';      // ตัวแปรสี/ระยะ/ตัวอักษร (ชุดใหม่ สีแบรนด์เดิม)
import './styles/base.css';        // reset + typography + ฟอร์ม
import './styles/main.css';        // สไตล์เดิม (หน้าที่ยังไม่ปรับใช้ชุดนี้)
import './styles/components.css';  // ปุ่ม/ป้ายสถานะ/การ์ด/ตาราง (ทับของเดิม)
import './styles/shell.css';       // หัวเว็บ/เมนู/กรอบหน้า
import './styles/pages.css';       // restyle คลาสเดิมทุกหน้า (โหลดท้ายสุด)

import './lib/icons.js';           // ระบบไอคอน (ต้องมาก่อน mount เพราะ partial ใช้ data-icon)
import './layout/mount.js';        // ประกอบ DOM จาก partial ทุกหน้า (ต้องมาก่อนโค้ดทั้งหมด)
import './lib/vendor.js';          // supabase-js / chart.js / d3 / xlsx จาก npm

import './lib/config.js';
import './core/ui.js';
import './features/global-search.js';
import './features/ask-ai.js';
import './pages/auth/auth.js';
import './pages/installer/installer.js';
import './features/user-mgmt.js';
import './pages/auth/session.js';
import './pages/training/dashboard.js';
import './pages/training/map.js';
import './features/iot-data.js';
import './features/app-connect.js';
import './pages/training/map-fill.js';
import './pages/training/plan.js';
import './pages/iot/plan.js';
import './pages/iot/call-mode.js';
import './pages/iot/plan-dashboard.js';
import './pages/iot/app-match.js';
import './pages/iot/ownership-check.js';
import './pages/iot/plan-export.js';

import './core/boot.js';           // ผูก event + เริ่มตรวจ auth
import './lib/geopan.js';          // แผนที่: ลากเลื่อน/ซูมลื่นๆ (ต้องมาหลัง mount + โมดูลแผนที่)
import './router.js';              // hash router — ต้องมาหลังทุกโมดูล (wrap ฟังก์ชันบน window)
