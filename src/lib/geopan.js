// ===== geopan: ทำให้แผนที่ SVG ลื่นแบบแอปแผนที่จริง =====
// ลากเพื่อเลื่อน (pan) + สกรอลล์/ปุ่มเพื่อซูม โดยคุมผ่าน viewBox ของ SVG โดยตรง
// ทำงานร่วมกับระบบซูมจังหวัด/อำเภอเดิม (animateViewBox) ได้ เพราะใช้ state ตัวเดียวกันบน window
// + ลิ้นชักรายชื่อบุคคลฝั่งขวา (พับ/ขยายได้) + อนิเมชันคลื่นน้ำบนสีเขียว/แดง

const MAPS = {
  thailandSvg: { labels: 'mapLabelsHtml', get: () => window.currentViewBox, set: (v) => { window.currentViewBox = v; } },
  iotSvg: { labels: 'iotMapLabelsHtml', get: () => window.iotCurrentViewBox, set: (v) => { window.iotCurrentViewBox = v; } },
};

const BASE_W = 460, BASE_H = 620;
const MIN_W = 18;    // ซูมเข้าสุด
const MAX_W = 920;   // ซูมออกสุด (ค่าเริ่มต้น ถ้ายังไม่ได้ตั้ง "กรอบบ้าน" ของแผนที่นั้น)

// "กรอบบ้าน" ของแต่ละแผนที่ = มุมมองเริ่มต้น + ขอบเขตซูมออกสุด (ซูมออกกว่านี้ไม่ได้)
// คำนวณจากจังหวัดที่มีข้อมูลจริง จะได้ไม่เหลือพื้นที่ว่างเยอะจนแผนที่ดูเล็ก
const homeBox = {};
function maxWFor(svgId) {
  return homeBox[svgId] ? homeBox[svgId][2] : MAX_W;
}
window.setGeoHomeBox = function (svgId, vb) {
  if (vb && vb.length === 4) homeBox[svgId] = vb.slice();
};
window.getGeoHomeBox = function (svgId) {
  return homeBox[svgId] ? homeBox[svgId].slice() : [0, 0, BASE_W, BASE_H];
};

/** รวมกรอบของ features ที่ส่งมา แล้วขยายให้ได้สัดส่วนเท่าเฟรมแผนที่ + เผื่อขอบ
 *  คืนค่าเป็น viewBox [x, y, w, h] — ถ้าไม่มี feature เลย คืนกรอบเต็มประเทศ */
window.computeGeoHomeBox = function (features, boundsOf, pad) {
  const full = [0, 0, BASE_W, BASE_H];
  if (!features || !features.length || typeof boundsOf !== 'function') return full;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  features.forEach((f) => {
    let b;
    try { b = boundsOf(f); } catch (err) { return; }
    if (!b || !isFinite(b[0][0])) return;
    x0 = Math.min(x0, b[0][0]); y0 = Math.min(y0, b[0][1]);
    x1 = Math.max(x1, b[1][0]); y1 = Math.max(y1, b[1][1]);
  });
  if (!isFinite(x0) || x1 <= x0 || y1 <= y0) return full;

  const p = (pad === undefined ? 0.07 : pad);
  const padX = (x1 - x0) * p, padY = (y1 - y0) * p;
  x0 -= padX; x1 += padX; y0 -= padY; y1 += padY;

  // ยืดด้านที่แคบกว่าให้ได้สัดส่วนเดียวกับกรอบฐาน (ภาพจะไม่บิด)
  const ratio = BASE_H / BASE_W;
  let w = x1 - x0, h = y1 - y0;
  if (h / w < ratio) h = w * ratio; else w = h / ratio;
  // ห้ามใหญ่เกินกรอบเต็มประเทศ (ซูมออกสุดก็แค่เห็นทั้งประเทศ)
  if (w > BASE_W) { w = BASE_W; h = BASE_H; }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  // เลื่อนกลับให้อยู่ในกรอบประเทศ จะได้ไม่เหลือพื้นที่ว่างเปล่านอกแผนที่
  let x = cx - w / 2, y = cy - h / 2;
  x = Math.max(0, Math.min(x, BASE_W - w));
  y = Math.max(0, Math.min(y, BASE_H - h));
  return [x, y, w, h];
};

// คำนวณพื้นที่วาดจริงของ viewBox ใน container (เผื่อ letterbox จาก preserveAspectRatio)
function renderBox(svg, vb) {
  const rect = svg.getBoundingClientRect();
  const scale = Math.min(rect.width / vb[2], rect.height / vb[3]);
  const w = vb[2] * scale, h = vb[3] * scale;
  return { rect, scale, offX: (rect.width - w) / 2, offY: (rect.height - h) / 2 };
}

/** จัดตำแหน่งป้าย HTML (ที่มี data-cx/data-cy เป็นพิกัด svg) ให้ตรง viewBox ปัจจุบัน */
export function geoRepositionLabels(svgId) {
  const cfg = MAPS[svgId];
  const svg = document.getElementById(svgId);
  if (!cfg || !svg) return;
  const vb = cfg.get();
  if (!vb) return;
  const { scale, offX, offY } = renderBox(svg, vb);
  document.querySelectorAll('#' + cfg.labels + ' [data-cx]').forEach((el) => {
    el.style.left = (offX + (Number(el.dataset.cx) - vb[0]) * scale) + 'px';
    el.style.top = (offY + (Number(el.dataset.cy) - vb[1]) * scale) + 'px';
  });
}

// ยามเฝ้า "ซูมออกจนเห็นหลายจังหวัด" -> ออกจากโหมดเลือกจังหวัดอัตโนมัติ
const focusGuard = {};
window.setGeoFocusGuard = function (svgId, maxW, onExit) {
  focusGuard[svgId] = (maxW && onExit) ? { maxW, onExit } : null;
};

// เขียน viewBox แบบรวมเฟรม (rAF) — ลากรัวๆ แล้วไม่กระตุก
const pending = {};
function applyVB(svgId, vb) {
  pending[svgId] = vb;
  MAPS[svgId].set(vb);

  // ผู้ใช้ซูมออกเองจนกว้างเกินเกณฑ์ -> เด้งกลับไปดูทั้งประเทศ (ยิงครั้งเดียว)
  const g = focusGuard[svgId];
  if (g && vb[2] > g.maxW) {
    focusGuard[svgId] = null;
    requestAnimationFrame(() => g.onExit());
  }
  if (applyVB._raf) return;
  applyVB._raf = requestAnimationFrame(() => {
    applyVB._raf = null;
    for (const id of Object.keys(pending)) {
      const svg = document.getElementById(id);
      if (svg && pending[id]) svg.setAttribute('viewBox', pending[id].join(' '));
      geoRepositionLabels(id);
      pending[id] = null;
    }
  });
}

/** ซูมด้วยปุ่ม +/- รอบจุดกึ่งกลางจอ (มีอนิเมชันสั้นๆ ให้ลื่น) */
export function geoZoom(svgId, dir) {
  const cfg = MAPS[svgId];
  const vb = (cfg.get() || [0, 0, BASE_W, BASE_H]).slice();
  const factor = dir > 0 ? 1 / 1.45 : 1.45;
  const nw = Math.min(maxWFor(svgId), Math.max(MIN_W, vb[2] * factor));
  const nh = nw * (vb[3] / vb[2]);
  const cx = vb[0] + vb[2] / 2, cy = vb[1] + vb[3] / 2;
  const target = [cx - nw / 2, cy - nh / 2, nw, nh];
  const start = vb.slice();
  const t0 = performance.now();
  const D = 220;
  (function step(now) {
    const t = Math.min(1, (now - t0) / D);
    const e = 1 - Math.pow(1 - t, 3);
    applyVB(svgId, start.map((s, i) => s + (target[i] - s) * e));
    if (t < 1) requestAnimationFrame(step);
  })(t0);
}

function attach(svgId) {
  const cfg = MAPS[svgId];
  const svg = document.getElementById(svgId);
  if (!svg || svg.dataset.geopan) return;
  svg.dataset.geopan = '1';
  svg.style.touchAction = 'none';

  let dragging = false, moved = false, start = null, capturedId = null;

  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const vb = cfg.get(); if (!vb) return;
    dragging = true; moved = false; capturedId = e.pointerId;
    start = { x: e.clientX, y: e.clientY, vb: vb.slice() };
    // สำคัญ: อย่า capture pointer ตรงนี้ — ไม่งั้น click บนจังหวัด/อำเภอจะไม่ทำงาน
  });

  svg.addEventListener('pointermove', (e) => {
    if (!dragging || !start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!moved) {
      if (Math.abs(dx) + Math.abs(dy) < 6) return; // ยังไม่ถือว่าลาก (กันชนกับ click)
      moved = true;
      try { svg.setPointerCapture(capturedId); } catch (err) {} // เริ่มลากจริงค่อย capture
    }
    const { scale } = renderBox(svg, start.vb);
    applyVB(svgId, [start.vb[0] - dx / scale, start.vb[1] - dy / scale, start.vb[2], start.vb[3]]);
  });

  const endDrag = () => { dragging = false; start = null; setTimeout(() => { moved = false; }, 0); };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  // ถ้าเพิ่งลากเสร็จ อย่าให้ click ทะลุไปเปิดจังหวัด/อำเภอ
  svg.addEventListener('click', (e) => {
    if (moved) { e.stopPropagation(); e.preventDefault(); }
  }, true);

  // สกรอลล์เพื่อซูมที่ตำแหน่งเมาส์
  svg.addEventListener('wheel', (e) => {
    const vb = cfg.get(); if (!vb) return;
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.14 : 1 / 1.14;
    const nw = Math.min(maxWFor(svgId), Math.max(MIN_W, vb[2] * factor));
    if (nw === vb[2]) return;
    const nh = nw * (vb[3] / vb[2]);
    const { rect, scale, offX, offY } = renderBox(svg, vb);
    const mx = vb[0] + (e.clientX - rect.left - offX) / scale;
    const my = vb[1] + (e.clientY - rect.top - offY) / scale;
    const rx = (mx - vb[0]) / vb[2], ry = (my - vb[1]) / vb[3];
    applyVB(svgId, [mx - rx * nw, my - ry * nh, nw, nh]);
  }, { passive: false });

  window.addEventListener('resize', () => geoRepositionLabels(svgId));
}

attach('thailandSvg');
attach('iotSvg');

/* ===== ลิ้นชักรายชื่อบุคคล (ฝั่งขวา): เปิดอัตโนมัติเมื่อมีรายชื่อ พับ/ขยายได้ ===== */
function setupDrawer(drawerId, panelId) {
  const drawer = document.getElementById(drawerId);
  const panel = document.getElementById(panelId);
  if (!drawer || !panel) return;
  const update = () => {
    const visible = panel.style.display !== 'none' && panel.innerHTML.trim() !== '';
    drawer.classList.toggle('open', visible);
    if (!visible) drawer.classList.remove('is-min');
  };
  new MutationObserver(update).observe(panel, { attributes: true, attributeFilter: ['style'], childList: true });
  update();
}
window.geoDrawerMin = function (drawerId, min) {
  const d = document.getElementById(drawerId);
  if (d) d.classList.toggle('is-min', min);
};
window.geoDrawerWide = function (drawerId) {
  const d = document.getElementById(drawerId);
  if (d) d.classList.toggle('is-wide');
};
setupDrawer('geoDrawer', 'peoplePanel');
setupDrawer('iotGeoDrawer', 'iotPeoplePanel');

/* ไฮไลท์อำเภอที่เลือกอยู่ ในลิสต์ฝั่งซ้าย (ทั้ง .district-row และ .lb-row ที่มี data-district) */
window.geoHighlightDistrict = function (scope, district) {
  document.querySelectorAll(scope + ' [data-district]').forEach((el) => {
    const on = !!district && el.dataset.district === district;
    el.classList.toggle('is-active', on);
    if (on) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
};

/* โฟกัสจังหวัดเดียว: จังหวัดที่เหลือดรอปสีลงเป็นพื้นหลังเทา จะได้ไม่สับสนว่ากำลังดูจังหวัดไหน */
window.setProvinceFocus = function (layerId, code) {
  const layer = document.getElementById(layerId);
  if (!layer) return;
  layer.classList.toggle('is-focused', !!code);
  layer.querySelectorAll('[data-code]').forEach((el) => {
    el.classList.toggle('is-focus', !!code && el.dataset.code === code);
  });
};

Object.assign(window, { geoZoom, geoRepositionLabels });
