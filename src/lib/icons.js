// ===== ระบบไอคอน (Lucide) — ใช้แทนอิโมจิทั้งเว็บ =====
// ใช้ได้ 2 แบบ:
//   1) ใน template literal ของ JS:  ${icon('calendar')}
//   2) ใน HTML partial:             <i data-icon="calendar"></i>  แล้วเรียก mountIcons()
// ไอคอนสืบทอดสีจากตัวหนังสือ (currentColor) จึงคุมสีด้วย CSS ได้ทุกจุด
import {
  LayoutDashboard, Map, MapPin, CalendarDays, Calendar, CalendarRange, CircleCheck, Check, X,
  Search, Ban, CircleSlash2, ClipboardList, Users, RefreshCw, Trash2, Plus, CircleHelp, Pencil,
  PenLine, Clock, ChartColumn, Sparkles, Link2, TriangleAlert, Phone, Camera, Signal, Download,
  Upload, Sprout, RadioTower, Factory, Crown, Eye, Moon, Sun, Lock, Inbox, ChevronRight,
  ChevronDown, ChevronLeft, LogOut, TrendingUp, Trophy, FileText, Navigation, Compass, Filter,
  Settings, Bell, User, CircleAlert, Info, ArrowUpRight, ListFilter, Table, SquarePen, Send,
  FolderOpen, Wrench, Package, Truck, Wifi, QrCode, Image, Video, ExternalLink, Copy, Save,
  CircleX, CircleDot, Loader, Printer, Undo2, House, StickyNote,
} from 'lucide';

// ชื่อสั้น -> ไอคอน (ตั้งชื่อตามความหมายในระบบเรา ไม่ใช่ชื่อ lucide ตรงๆ เพื่อให้อ่านง่าย)
const ICONS = {
  // เมนู/โมดูล
  dashboard: LayoutDashboard, map: Map, calendar: CalendarDays, 'calendar-plain': Calendar,
  'calendar-range': CalendarRange, training: Sprout, iot: RadioTower, factory: Factory,
  link: Link2, 'pen-line': PenLine, blocked: Ban, table: Table,
  // สถานะ
  done: CircleCheck, check: Check, pending: Clock, progress: Loader, warning: TriangleAlert,
  danger: CircleX, alert: CircleAlert, info: Info, dot: CircleDot, 'not-allowed': CircleSlash2,
  // การกระทำ
  search: Search, refresh: RefreshCw, download: Download, upload: Upload, plus: Plus,
  trash: Trash2, edit: Pencil, 'edit-square': SquarePen, save: Save, send: Send, copy: Copy,
  filter: Filter, 'list-filter': ListFilter, settings: Settings, close: X, external: ExternalLink,
  // ข้อมูล/วัตถุ
  users: Users, user: User, chart: ChartColumn, trend: TrendingUp, trophy: Trophy,
  clipboard: ClipboardList, file: FileText, folder: FolderOpen, package: Package, truck: Truck,
  note: StickyNote,
  wrench: Wrench, phone: Phone, camera: Camera, video: Video, image: Image, qr: QrCode,
  signal: Signal, wifi: Wifi, pin: MapPin, navigate: Navigation, compass: Compass, inbox: Inbox,
  // ระบบ
  crown: Crown, eye: Eye, lock: Lock, logout: LogOut, bell: Bell, sun: Sun, moon: Moon,
  sparkles: Sparkles, help: CircleHelp, print: Printer, undo: Undo2, home: House,
  // ทิศทาง
  right: ChevronRight, down: ChevronDown, left: ChevronLeft,
};

const BASE = 'xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" ' +
  'stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"';

function attrs(o) {
  return Object.entries(o).map(([k, v]) => `${k}="${v}"`).join(' ');
}

/** คืนค่า SVG เป็นสตริง ใช้แทรกใน template literal ได้เลย */
export function icon(name, size = 16, cls = '') {
  const def = ICONS[name];
  if (!def) return '';
  const body = def.map(([tag, a]) => `<${tag} ${attrs(a)}/>`).join('');
  return `<svg class="ico${cls ? ' ' + cls : ''}" width="${size}" height="${size}" ${BASE} aria-hidden="true">${body}</svg>`;
}

/** แปลง <i data-icon="name"> ทุกตัวใน root ให้เป็น SVG (สำหรับ HTML partial) */
export function mountIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    const svg = icon(el.dataset.icon, Number(el.dataset.size) || 16);
    if (svg) el.outerHTML = svg;
  });
}

// แปลง data-icon อัตโนมัติทุกครั้งที่มี DOM ใหม่ถูกเพิ่ม (innerHTML จากทุก render ทั่วแอป)
const observer = new MutationObserver((muts) => {
  for (const m of muts) {
    for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.matches && n.matches('[data-icon]')) {
        const svg = icon(n.dataset.icon, Number(n.dataset.size) || 16);
        if (svg) n.outerHTML = svg;
      } else if (n.querySelector && n.querySelector('[data-icon]')) {
        mountIcons(n);
      }
    }
  }
});
observer.observe(document.documentElement, { childList: true, subtree: true });

window.icon = icon;
window.mountIcons = mountIcons;
