// ===== หน้าแผนที่อบรม: แผนที่ประเทศไทย D3 + scoreboard/leaderboard =====
// แยกมาจาก main.js เดิม — ตัวแปร/ฟังก์ชันแชร์ผ่าน window (โค้ดเดิมออกแบบเป็น global scope)


/* =========================================================
   Real Thailand map via D3 + OpenGISData-Thailand GeoJSON.
   Zoom is done by animating the SVG viewBox directly (the
   standard smooth technique for SVG pan/zoom), not CSS
   transform on a group — avoids jank on SVG elements.
   ========================================================= */

async function ensureMapDataLoaded() {
  if (geoProvinces && geoDistricts) { return; }
  if (geoDataLoading) return;
  geoDataLoading = true;
  document.getElementById('mapLoading').style.display = 'block';
  document.getElementById('thailandSvg').style.display = 'none';
  try {
    const provUrl = 'https://cdn.jsdelivr.net/gh/chingchai/OpenGISData-Thailand@master/provinces.geojson';
    const distUrl = 'https://cdn.jsdelivr.net/gh/chingchai/OpenGISData-Thailand@master/districts.geojson';
    const [provRes, distRes] = await Promise.all([fetch(provUrl), fetch(distUrl)]);
    geoProvinces = await provRes.json();
    geoDistricts = await distRes.json();

    countryProjection = d3.geoMercator().fitSize([SVG_W, SVG_H], geoProvinces);
    countryPathGen = d3.geoPath(countryProjection);
    geoProvinces.features.forEach(f => { provinceNameToCode[normName(f.properties.pro_th)] = f.properties.pro_code; });

    document.getElementById('mapLoading').style.display = 'none';
    document.getElementById('thailandSvg').style.display = 'block';
    renderCountryProvinces();
    maybeRenderIotMap();
  } catch (e) {
    document.getElementById('mapLoading').textContent = 'โหลดแผนที่ไม่สำเร็จ: ' + e.message + ' (ต้องมีอินเทอร์เน็ต)';
  }
  geoDataLoading = false;
}

function provinceHasData(pro_th) {
  const n = normName(pro_th);
  return allRows.some(r => normName(r.province) === n);
}

function renderCountryProvinces() {
  const g = document.getElementById('mapG');
  const byProvince = aggregateByProvince(allRows);
  g.innerHTML = geoProvinces.features.map(f => {
    const name = f.properties.pro_th;
    const code = f.properties.pro_code;
    const d = countryPathGen(f);
    const agg = byProvince.find(p => normName(p.province) === normName(name));
    if (!agg) {
      return `<path class="prov-path no-data" data-code="${code}" d="${d}"><title>${name}</title></path>`;
    }
    const b = countryPathGen.bounds(f);
    const fillMarkup = fillClipMarkup(d, b, agg.pct, 'prov-' + code);
    return `<g class="prov-path has-data" data-code="${code}" onclick="zoomToProvince('${code}')"><title>${name}: ${agg.pct}% (Y ${agg.Y} · N ${agg.N})</title>${fillMarkup}<path class="prov-outline" d="${d}"></path></g>`;
  }).join('');
  applyMapHomeBox(byProvince);
  renderCountryLabels();
}

// "กรอบบ้าน" ของแผนที่อบรม: ซูมให้พอดีจังหวัดที่มีข้อมูล และห้ามซูมออกกว้างกว่านี้
function applyMapHomeBox(byProvince) {
  if (typeof computeGeoHomeBox !== 'function') return;
  const dataNames = new Set((byProvince || []).map(p => normName(p.province)));
  const feats = geoProvinces.features.filter(f => dataNames.has(normName(f.properties.pro_th)));
  const home = computeGeoHomeBox(feats, countryPathGen.bounds);
  setGeoHomeBox('thailandSvg', home);
  if (mapView === 'country') {
    currentViewBox = home.slice();
    const svg = document.getElementById('thailandSvg');
    if (svg) svg.setAttribute('viewBox', home.join(' '));
    if (typeof geoRepositionLabels === 'function') geoRepositionLabels('thailandSvg');
  }
}

function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > pt[1]) !== (yj > pt[1])) &&
      (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygonWithHoles(pt, rings) {
  if (!pointInRing(pt, rings[0])) return false;
  for (let k = 1; k < rings.length; k++) {
    if (pointInRing(pt, rings[k])) return false;
  }
  return true;
}

function distToSegment(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = a[0] + t * dx, py = a[1] + t * dy;
  return Math.hypot(p[0] - px, p[1] - py);
}

function distToRings(pt, rings) {
  let min = Infinity;
  rings.forEach(ring => {
    for (let i = 0; i < ring.length - 1; i++) {
      const d = distToSegment(pt, ring[i], ring[i + 1]);
      if (d < min) min = d;
    }
  });
  return min;
}

/* หาจุดวางป้ายชื่อที่ "อยู่ตรงกลางจริง" ของรูปทรง (แม้เป็นรูปเว้า/เรียว) แทนการใช้ centroid ธรรมดา
   ซึ่งอาจตกไปอยู่นอกรูปทรงหรือใกล้ขอบสำหรับอำเภอที่มีรูปร่างซับซ้อน */
function labelFit(feature) {
  const geom = feature.geometry;
  let polygons;
  if (geom.type === 'Polygon') {
    polygons = [geom.coordinates];
  } else if (geom.type === 'MultiPolygon') {
    polygons = geom.coordinates;
  } else {
    return { pt: countryPathGen.centroid(feature), r: 0, poly: null };
  }

  const projectedPolys = polygons.map(poly => poly.map(ring => ring.map(pt => countryProjection(pt))));

  let best = null, bestArea = -1;
  projectedPolys.forEach(poly => {
    const ring = poly[0];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    ring.forEach(([x, y]) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });
    const area = (maxX - minX) * (maxY - minY);
    if (area > bestArea) { bestArea = area; best = { poly, minX, minY, maxX, maxY }; }
  });

  if (!best) return { pt: countryPathGen.centroid(feature), r: 0, poly: null };

  const { poly, minX, minY, maxX, maxY } = best;
  const steps = 24;
  const stepX = (maxX - minX) / steps || 1;
  const stepY = (maxY - minY) / steps || 1;
  let bestPt = null, bestDist = -1;
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const pt = [minX + i * stepX, minY + j * stepY];
      if (pointInPolygonWithHoles(pt, poly)) {
        const d = distToRings(pt, poly);
        if (d > bestDist) { bestDist = d; bestPt = pt; }
      }
    }
  }
  return bestPt ? { pt: bestPt, r: bestDist, poly } : { pt: countryPathGen.centroid(feature), r: 0, poly: null };
}

// คืนแค่พิกัด (ของเดิมที่โค้ดส่วนอื่นเรียกใช้)
function labelPoint(feature) {
  return labelFit(feature).pt;
}

// ความกว้างของพื้นที่ตามแนวนอน ณ ระดับ y ของป้าย — ใช้คุมไม่ให้ตัวหนังสือล้นออกนอกเขต
function horizontalSpanAt(poly, cx, cy) {
  if (!poly) return 0;
  const xs = [];
  poly.forEach(ring => {
    for (let i = 0; i + 1 < ring.length; i++) {
      const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
      if ((y1 <= cy && y2 > cy) || (y2 <= cy && y1 > cy)) {
        xs.push(x1 + ((cy - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
  });
  xs.sort((a, b) => a - b);
  for (let i = 0; i + 1 < xs.length; i += 2) {
    if (xs[i] <= cx && cx <= xs[i + 1]) return 2 * Math.min(cx - xs[i], xs[i + 1] - cx);
  }
  return 0;
}

// นับเฉพาะตัวอักษรที่กินความกว้างจริง (สระบน/ล่าง วรรณยุกต์ ไม่กินที่)
function thaiVisualLength(s) {
  return [...String(s)].filter(ch => !/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/.test(ch)).length || 1;
}

// ขนาดตัวอักษรของป้ายจังหวัด: ใหญ่ตามพื้นที่ แต่ต้องไม่ล้นออกนอกเขตจังหวัดตัวเอง
function provinceLabelFontSize(feature, fit, maxFs) {
  const b = countryPathGen.bounds(feature);
  const areaFs = Math.sqrt((b[1][0] - b[0][0]) * (b[1][1] - b[0][1])) * 0.24;
  const span = horizontalSpanAt(fit.poly, fit.pt[0], fit.pt[1]);
  const usable = Math.max(span > 0 ? span * 0.9 : fit.r * 1.8, 0.5);
  const fitFs = usable / (thaiVisualLength(feature.properties.pro_th) * 0.47);
  return Math.max(2.2, Math.min(maxFs || 10.5, areaFs, fitFs));
}
window.labelFit = labelFit;
window.provinceLabelFontSize = provinceLabelFontSize;

// ป้ายชื่อจังหวัด "ครบทั้งประเทศ" — จังหวัดที่ไม่มีข้อมูลก็มีชื่อ (เป็นตัวเทาจางบนพื้นเทา)
// เพื่อให้รู้เสมอว่าพื้นที่ตรงนั้นคือจังหวัดอะไร แบบแผนที่อ้างอิง
function renderCountryLabels() {
  const labelLayer = document.getElementById('labelLayer');
  const dataProvinceNames = new Set(allRows.map(r => normName(r.province)));
  labelLayer.innerHTML = geoProvinces.features
    .filter(f => dataProvinceNames.has(normName(f.properties.pro_th)))
    .map(f => {
      const fit = labelFit(f);
      const fs = provinceLabelFontSize(f, fit);
      return `<text class="map-label" x="${fit.pt[0]}" y="${fit.pt[1]}" font-size="${fs.toFixed(2)}">${f.properties.pro_th}</text>`;
    }).join('');
}

/* ---- viewBox-based zoom animation (smooth, standard technique) ---- */

function fitViewBoxToBounds(x0, y0, x1, y1, padRatio) {
  let w = Math.max(x1 - x0, 1) * padRatio;
  let h = Math.max(y1 - y0, 1) * padRatio;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const aspect = SVG_W / SVG_H;
  if (w / h > aspect) { h = w / aspect; } else { w = h * aspect; }
  return [cx - w / 2, cy - h / 2, w, h];
}

function animateViewBox(target, duration, onDone) {
  if (viewBoxAnimId) cancelAnimationFrame(viewBoxAnimId);
  const svg = document.getElementById('thailandSvg');
  const start = currentViewBox.slice();
  const startTime = performance.now();

  function frame(now) {
    const t = Math.min(1, (now - startTime) / duration);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const cur = start.map((s, i) => s + (target[i] - s) * eased);
    svg.setAttribute('viewBox', cur.join(' '));
    if (t < 1) {
      viewBoxAnimId = requestAnimationFrame(frame);
    } else {
      currentViewBox = target.slice();
      viewBoxAnimId = null;
      if (onDone) onDone();
    }
  }
  viewBoxAnimId = requestAnimationFrame(frame);
}

function zoomToProvinceByName(name) {
  const code = provinceNameToCode[normName(name)];
  if (code) zoomToProvince(code);
}

function districtPctColor(pct) {
  return pct >= 50 ? '#3f9e88' : '#d9695f';
}


// ป้ายชื่อจังหวัดรอบๆ ตอนซูมเข้าไปในจังหวัด/อำเภอ — จะได้รู้ว่าพื้นที่ข้างๆ คือจังหวัดอะไร (สไตล์แผนที่อ้างอิง)
function renderNeighborProvinceLabels(layerId, excludeCode, target, dataNames) {
  const layer = document.getElementById(layerId);
  if (!layer || !geoProvinces) return;
  const tw = target[2];
  const baseFs = Math.max(2.4, Math.min(6.5, tw * 0.05));
  // โชว์ชื่อ "ทุกจังหวัดที่มีข้อมูล" ไม่ใช่แค่ที่อยู่ในกรอบตอนนี้ — เลื่อน/ซูมออกแล้วเห็นชื่อได้ทันที
  layer.innerHTML = geoProvinces.features
    .filter(f => !dataNames || dataNames.has(normName(f.properties.pro_th)))
    .map(f => ({ f, fit: labelFit(f) }))
    .map(({ f, fit }) => {
      const isCurrent = f.properties.pro_code === excludeCode;
      const fs = provinceLabelFontSize(f, fit, isCurrent ? baseFs * 0.85 : baseFs);
      return `<text class="map-label is-dim ${isCurrent ? 'is-current' : ''}" x="${fit.pt[0]}" y="${fit.pt[1]}" font-size="${fs.toFixed(2)}">${f.properties.pro_th}</text>`;
    })
    .join('');
}
window.renderNeighborProvinceLabels = renderNeighborProvinceLabels;

function zoomToProvince(pro_code, cb) {
  if (!geoProvinces) return;
  const provFeature = geoProvinces.features.find(f => f.properties.pro_code === pro_code);
  if (!provFeature) return;
  const provName = provFeature.properties.pro_th;

  mapView = 'province';
  currentProvinceCode = pro_code;
  currentDistrictName = null;
  setProvinceFocus('mapG', pro_code);

  document.getElementById('districtLayer').innerHTML = '';
  document.getElementById('labelLayer').innerHTML = '';
  document.getElementById('mapLabelsHtml').innerHTML = '';
  document.getElementById('peoplePanel').style.display = 'none';
  document.getElementById('mapBackBtn').classList.add('visible');
  const titleOverlay = document.getElementById('mapTitleOverlay');
  titleOverlay.style.display = 'block';
  titleOverlay.textContent = provName;

  const b = countryPathGen.bounds(provFeature);
  const target = fitViewBoxToBounds(b[0][0], b[0][1], b[1][0], b[1][1], 1.25);
  renderNeighborProvinceLabels('labelLayer', pro_code, target, new Set(allRows.map(r => normName(r.province))));
  setGeoFocusGuard('thailandSvg', target[2] * 2, backToCountryMap);

  animateViewBox(target, 500, () => {
    const districtFeatures = geoDistricts.features.filter(f => f.properties.pro_code === pro_code);
    const ourDistricts = aggregateByProvinceDistrict(allRows).filter(d => normName(d.province) === normName(provName));
    const ourDistrictMap = {};
    ourDistricts.forEach(d => { ourDistrictMap[normName(d.district)] = d; });

    let matched = 0;
    const districtLayer = document.getElementById('districtLayer');
    districtLayer.innerHTML = districtFeatures.map((f, i) => {
      const name = f.properties.amp_th;
      const match = ourDistrictMap[normName(name)];
      const d = countryPathGen(f);
      const dl = `style="--d:${(i * 55).toFixed(0)}ms"`;
      if (!match) {
        return `<path class="dist-path-flat dist-appear" ${dl} d="${d}" fill="#e9ece9"><title>${name}</title></path>`;
      }
      matched++;
      const b = countryPathGen.bounds(f);
      const fillMarkup = fillClipMarkup(d, b, match.pct, 'dist-' + f.properties.amp_code);
      const title = `${name}: Y ${match.Y} · N ${match.N} · รวม ${match.total} (${match.pct}%)`;
      return `<g class="dist-path dist-appear" ${dl} onclick="zoomToDistrict('${pro_code}','${name}')"><title>${title}</title>${fillMarkup}<path class="dist-outline" d="${d}"></path></g>`;
    }).join('') + `<path class="prov-focus-outline" d="${countryPathGen(provFeature)}"></path>`;

    const matchedFeatures = districtFeatures.filter(f => ourDistrictMap[normName(f.properties.amp_th)]);
    renderDistrictHtmlLabels(matchedFeatures);
    renderDistrictLeaderboard(provName, pro_code);

    titleOverlay.textContent = provName + ' · จับคู่ข้อมูลได้ ' + matched + '/' + ourDistricts.length + ' อำเภอ';
    document.getElementById('mapCaption').textContent = 'สีเขียว = อบรมสำเร็จมากกว่า · สีแดง = ไม่ผ่านมากกว่า · เทาอ่อน = ไม่มีข้อมูล (กดไม่ได้) · คลิกอำเภอสีเขียว/แดงเพื่อดูรายชื่อ';
    if (cb) cb();
  });
}

function renderDistrictHtmlLabels(districtFeatures) {
  const container = document.getElementById('mapLabelsHtml');
  const areas = districtFeatures.map(f => { const b = countryPathGen.bounds(f); return (b[1][0] - b[0][0]) * (b[1][1] - b[0][1]); });
  const maxA = Math.max(...areas, 1);
  container.innerHTML = districtFeatures.map((f, i) => {
    const [cx, cy] = labelPoint(f);
    const fs = Math.max(8.5, Math.min(13.5, 8 + 5.5 * Math.sqrt(areas[i] / maxA)));
    return `<div class="html-label" data-cx="${cx}" data-cy="${cy}" style="font-size:${fs.toFixed(1)}px;">${f.properties.amp_th}</div>`;
  }).join('');
  geoRepositionLabels('thailandSvg');
}

function zoomToDistrict(pro_code, districtName, cb) {
  geoHighlightDistrict('#tab-map', districtName);
  const distFeature = geoDistricts.features.find(f => f.properties.pro_code === pro_code && normName(f.properties.amp_th) === normName(districtName));
  if (!distFeature) return;
  const provFeature = geoProvinces.features.find(f => f.properties.pro_code === pro_code);
  const provName = provFeature ? provFeature.properties.pro_th : '';

  mapView = 'district';
  currentProvinceCode = pro_code;
  currentDistrictName = districtName;
  setProvinceFocus('mapG', pro_code);

  const b = countryPathGen.bounds(distFeature);
  const target = fitViewBoxToBounds(b[0][0], b[0][1], b[1][0], b[1][1], 1.9);

  const titleOverlay = document.getElementById('mapTitleOverlay');
  titleOverlay.textContent = districtName + ' · ' + provName;

  renderNeighborProvinceLabels('labelLayer', pro_code, target, new Set(allRows.map(r => normName(r.province))));
  if (provFeature) {
    const pb = countryPathGen.bounds(provFeature);
    setGeoFocusGuard('thailandSvg', fitViewBoxToBounds(pb[0][0], pb[0][1], pb[1][0], pb[1][1], 1.25)[2] * 2, backToCountryMap);
  }
  document.getElementById('mapLabelsHtml').innerHTML = '';
  animateViewBox(target, 450, () => {
    const districtFeatures = geoDistricts.features.filter(f => f.properties.pro_code === pro_code);
    const ourDistricts = aggregateByProvinceDistrict(allRows).filter(d => normName(d.province) === normName(provName));
    const ourDistrictMap = {};
    ourDistricts.forEach(d => { ourDistrictMap[normName(d.district)] = d; });
    const matchedFeatures = districtFeatures.filter(f => ourDistrictMap[normName(f.properties.amp_th)]);
    renderDistrictHtmlLabels(matchedFeatures);

    showDistrictPeople(provName, districtName);
    if (cb) cb();
  });
}

function backOneLevel() {
  geoHighlightDistrict('#tab-map', null);
  if (mapView === 'district') {
    zoomToProvince(currentProvinceCode);
  } else if (mapView === 'province') {
    backToCountryMap();
  }
}

function backToCountryMap() {
  geoHighlightDistrict('#tab-map', null);
  mapView = 'country';
  currentProvinceCode = null;
  currentDistrictName = null;
  setProvinceFocus('mapG', null);
  setGeoFocusGuard('thailandSvg', null);
  document.getElementById('mapBackBtn').classList.remove('visible');
  document.getElementById('mapTitleOverlay').style.display = 'none';
  document.getElementById('mapCaption').textContent = 'ขอบเขตจริงจาก OpenGISData-Thailand';
  document.getElementById('provinceDetail').style.display = 'none';
  document.getElementById('peoplePanel').style.display = 'none';

  document.getElementById('mapLabelsHtml').innerHTML = '';
  restoreProvinceLeaderboard();
  animateViewBox(getGeoHomeBox('thailandSvg'), 500, () => {
    document.getElementById('districtLayer').innerHTML = '';
    renderCountryLabels();
  });
}

function showProvinceDetail(province) {
  const districts = aggregateByProvinceDistrict(allRows)
    .filter(d => normName(d.province) === normName(province))
    .sort((a, b) => a.pct - b.pct || b.N - a.N);

  const totalPeople = districts.reduce((s, d) => s + d.total, 0);
  const needAttention = districts.filter(d => d.pct < 100).length;

  const panel = document.getElementById('provinceDetail');
  panel.style.display = 'block';
  panel.innerHTML = `
    <div class="detail-header">
      <h3><i data-icon="pin" data-size="15"></i> ${province} <span class="badge">${totalPeople.toLocaleString()} คน · ${districts.length} อำเภอ · ${needAttention} อำเภอยังต้องติดตาม</span></h3>
      <button class="btn btn-brand" onclick="showProvinceAllDistrictsPeople('${province.replace(/'/g, "\\'")}')" title="ดูรายชื่อยังไม่อบรมของทุกอำเภอรวมหน้าเดียว เลือกข้ามอำเภอได้"><i data-icon="users" data-size="15"></i> ดูรายชื่อทุกอำเภอ (เลือกได้หลายอำเภอ)</button>
      <button class="btn btn-outline" onclick="closeProvinceDetail()">ปิด <i data-icon="close" data-size="15"></i></button>
    </div>
    <div class="district-list">
      ${districts.map(d => `
        <div class="district-row ${d.pct < 100 ? 'needs-attention' : ''}" data-district="${d.district}" onclick="zoomToDistrict('${currentProvinceCode}','${d.district}')">
          <div class="dr-name">${d.district || 'ไม่ระบุ'}</div>
          <div class="dr-bar-track"><div class="dr-bar-fill" style="width:${d.pct}%; background:${d.pct < 100 ? 'var(--red)' : 'var(--brand)'};"></div></div>
          <div class="dr-stats">Y ${d.Y} · N ${d.N} · รวม ${d.total}</div>
          <div class="dr-pct">${d.pct}%</div>
        </div>
      `).join('')}
    </div>
  `;
}

function closeProvinceDetail() {
  document.getElementById('provinceDetail').style.display = 'none';
}

// จำ/คืนตำแหน่ง scroll ของลิสต์ย่อยๆ (แต่ละกลุ่มคนมี .table-wrap ของตัวเอง สูงจำกัด เลื่อนเองได้)
// ที่อยู่ภายในพาแนลคนก่อน/หลังเขียนทับ innerHTML ทั้งก้อน (ไม่งั้นทุกครั้งที่กด +เพิ่ม/ยกเลิกแค่คนเดียว
// ลิสต์ทั้งหมดจะเด้งกลับไปบนสุดเพราะพาแนลถูกวาดใหม่ทั้งหมด อ้างอิงตามลำดับกลุ่มที่ปรากฏ ไม่ใช่ id
// เพราะบางกลุ่ม (เช่น "อบรมแล้ว"/"ติดตั้งแล้ว") ไม่มี groupId ให้อ้างอิงตรงๆ)
function capturePeoplePanelScroll(panel) {
  return [...panel.querySelectorAll('.table-wrap')].map(el => el.scrollTop);
}

function restorePeoplePanelScroll(panel, positions) {
  const boxes = panel.querySelectorAll('.table-wrap');
  boxes.forEach((el, i) => { if (positions[i] !== undefined) el.scrollTop = positions[i]; });
}

function renderPeopleGroup(title, icon, cls, groupRows, highlightId, opts) {
  opts = opts || {};
  const selectable = !!opts.selectable;
  const groupId = opts.groupId || '';
  const addAllOnClick = opts.addAllOnClick || 'addAllDistrictUntrainedToPlan()';
  const colspan = selectable ? 8 : 6;
  const totalCount = groupRows.length;
  // ถ้าเปิด "ซ่อนคนที่เพิ่มแล้ว" ไว้ (ค่าเริ่มต้นเปิด) กรองคนที่อยู่ในแผนแล้วออกจากรายชื่อที่เลือกได้ (เฉพาะกลุ่มที่เลือกได้เท่านั้น)
  const visibleRows = (selectable && hideAddedPeopleInPanel)
    ? groupRows.filter(p => !trainingPlan.some(e => e.nationalId === p.national_id))
    : groupRows;
  const hiddenCount = totalCount - visibleRows.length;
  return `
    <div class="people-group">
      <div class="people-group-title ${cls}">${icon} ${title} <span class="badge">${totalCount} คน</span>${hiddenCount ? ` <span class="badge" style="opacity:.65;" title="ซ่อนคนที่เพิ่มเข้าแผนแล้ว">ซ่อนแล้ว ${hiddenCount} คน</span>` : ''}</div>
      ${selectable && visibleRows.length ? `
        <div class="people-group-actions">
          <button class="btn btn-outline btn-xs" onclick="toggleSelectAllPeople('${groupId}')">เลือก/ยกเลิกทั้งหมด</button>
          <button class="btn btn-brand btn-xs" onclick="addSelectedPeopleToPlan('${groupId}')">+ เพิ่มที่เลือกเข้าแผนอบรม</button>
          <button class="btn btn-brand btn-xs" onclick="${addAllOnClick}">+ เพิ่มทั้งอำเภอเข้าแผน (${visibleRows.length} คน)</button>
        </div>
      ` : ''}
      <div class="table-wrap" style="max-height:280px;">
        <table class="detail-table">
          <thead>
            <tr>
              ${selectable ? '<th style="width:28px;"></th>' : ''}
              <th>ชื่อ-นามสกุล</th><th>เลขบัตรประชาชน</th><th class="col-extra">เบอร์ติดต่อ</th><th>ตำบล</th>
              <th class="col-extra">รอบการอนุมัติ</th><th class="col-extra">เวลาอัพโหลด</th>
              ${selectable ? '<th></th>' : ''}
            </tr>
          </thead>
          <tbody id="${groupId ? groupId + 'Tbody' : ''}">
            ${visibleRows.length ? visibleRows.map(p => {
              const inPlan = trainingPlan.some(e => e.nationalId === p.national_id);
              return `
              <tr class="${highlightId && p.national_id === highlightId ? 'row-highlight' : ''}" id="${highlightId && p.national_id === highlightId ? 'highlightedPersonRow' : ''}">
                ${selectable ? `<td><input type="checkbox" class="plan-select-checkbox" data-nid="${p.national_id}" ${inPlan ? 'disabled checked' : ''}></td>` : ''}
                <td>${p.prefix || ''}${p.first_name || ''} ${p.last_name || ''}</td>
                <td>${p.national_id || ''}</td>
                <td class="col-extra">${p.phone || ''}</td>
                <td>${p.subdistrict || ''}</td>
                <td class="col-extra">${p.approval_round || ''}</td>
                <td class="col-extra">${p.uploaded_at || ''}</td>
                ${selectable ? `<td>${inPlan ? `<span class="plan-added-tag"><i data-icon="check" data-size="15"></i> เพิ่มแล้ว</span> <button class="btn btn-outline btn-xs" onclick="removePersonFromPlanByNid('${p.national_id}')">ยกเลิก</button>` : `<button class="btn btn-outline btn-xs" onclick="addPersonToPlanByNid('${p.national_id}')">+ เพิ่ม</button>`}</td>` : ''}
              </tr>
            `; }).join('') : `<tr><td colspan="${colspan}" style="text-align:center; opacity:.6;">${selectable && hiddenCount ? 'ทุกคนอยู่ในแผนแล้ว (ซ่อนไว้)' : 'ไม่มีข้อมูล'}</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function showDistrictPeople(province, district, highlightId) {
  currentPeoplePanelProvince = province;
  currentPeoplePanelDistrict = district;
  currentPeoplePanelMode = 'district';
  const people = allRows.filter(r => normName(r.province) === normName(province) && normName(r.district) === normName(district));
  const trained = people.filter(p => p.training_status === 'Y');
  const untrained = people.filter(p => p.training_status === 'N');
  const panel = document.getElementById('peoplePanel');
  const prevScroll = capturePeoplePanelScroll(panel);
  panel.style.display = 'block';
  panel.innerHTML = `
    <div class="detail-header">
      <h3><i data-icon="users" data-size="15"></i> คนในอำเภอ${district} <span class="badge">${people.length} คน</span></h3>
      <label class="hide-added-toggle" style="display:flex; align-items:center; gap:6px; font-size:12.5px; color:var(--muted); cursor:pointer;">
        <input type="checkbox" ${hideAddedPeopleInPanel ? 'checked' : ''} onchange="toggleHideAddedPeople(this.checked)"> ซ่อนคนที่เพิ่มแล้ว
      </label>
      <button class="btn btn-outline" onclick="closePeoplePanel()">ปิด <i data-icon="close" data-size="15"></i></button>
    </div>
    ${renderPeopleGroup('อบรมแล้ว', '', 'group-yes', trained, highlightId)}
    ${renderPeopleGroup('ยังไม่อบรม', '', 'group-no', untrained, highlightId, { selectable: true, groupId: 'peopleUntrained'})}
  `;
  restorePeoplePanelScroll(panel, prevScroll);
  if (highlightId) {
    const row = document.getElementById('highlightedPersonRow');
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// รายชื่อ "ยังไม่อบรม" ของทุกอำเภอในจังหวัดเดียวกัน รวมไว้หน้าเดียว แยกหัวข้อเป็นอำเภอๆ
// เพื่อให้เลือกคนข้ามอำเภอได้ในทีเดียว ไม่ต้องกดเข้า-ออกทีละอำเภอเหมือนเดิม
function showProvinceAllDistrictsPeople(province) {
  currentPeoplePanelProvince = province;
  currentPeoplePanelDistrict = null;
  currentPeoplePanelMode = 'province';
  const provinceRows = allRows.filter(r => normName(r.province) === normName(province));
  const districts = [...new Set(provinceRows.map(r => r.district))].filter(Boolean).sort();
  const panel = document.getElementById('peoplePanel');
  const prevScroll = capturePeoplePanelScroll(panel);
  panel.style.display = 'block';
  panel.innerHTML = `
    <div class="detail-header">
      <h3><i data-icon="users" data-size="15"></i> คนทั้งจังหวัด${province} <span class="badge">${districts.length} อำเภอ</span></h3>
      <label class="hide-added-toggle" style="display:flex; align-items:center; gap:6px; font-size:12.5px; color:var(--muted); cursor:pointer;">
        <input type="checkbox" ${hideAddedPeopleInPanel ? 'checked' : ''} onchange="toggleHideAddedPeople(this.checked)"> ซ่อนคนที่เพิ่มแล้ว
      </label>
      <button class="btn btn-outline" onclick="closePeoplePanel()">ปิด <i data-icon="close" data-size="15"></i></button>
    </div>
    ${districts.map(d => {
      const untrained = provinceRows.filter(r => normName(r.district) === normName(d) && r.training_status === 'N');
      const groupId = 'peopleUntrained_' + districts.indexOf(d);
      const provinceJs = province.replace(/'/g, "\\'");
      const districtJs = d.replace(/'/g, "\\'");
      return `
        <h4 style="margin:16px 0 4px; font-size:14px;"><i data-icon="pin" data-size="15"></i> อำเภอ${d}</h4>
        ${renderPeopleGroup('ยังไม่อบรม', '', 'group-no', untrained, null, { selectable: true, groupId, addAllOnClick: `addAllUntrainedToPlanFor('${provinceJs}','${districtJs}')`})}
      `;
    }).join('')}
  `;
  restorePeoplePanelScroll(panel, prevScroll);
}

// เรียก render พาแนลปัจจุบันซ้ำ (ใช้หลังเพิ่มคนเข้าแผน) — รองรับทั้งโหมดดูทีละอำเภอ และโหมดดูทั้งจังหวัด
function refreshPeoplePanel() {
  if (currentPeoplePanelMode === 'province' && currentPeoplePanelProvince) {
    showProvinceAllDistrictsPeople(currentPeoplePanelProvince);
  } else if (currentPeoplePanelProvince && currentPeoplePanelDistrict) {
    showDistrictPeople(currentPeoplePanelProvince, currentPeoplePanelDistrict);
  }
}

function toggleHideAddedPeople(checked) {
  hideAddedPeopleInPanel = !!checked;
  refreshPeoplePanel();
}

function closePeoplePanel() {
  document.getElementById('peoplePanel').style.display = 'none';
  currentPeoplePanelProvince = null;
  currentPeoplePanelDistrict = null;
  currentPeoplePanelMode = null;
}

function searchAndZoomPerson() {
  const q = document.getElementById('mapPersonSearch').value.trim().toLowerCase();
  const statusEl = document.getElementById('mapSearchStatus');
  if (!q) { statusEl.textContent = ''; return; }
  if (!geoProvinces) { statusEl.textContent = 'กรุณารอให้แผนที่โหลดเสร็จก่อน'; return; }

  const match = allRows.find(r => {
    const hay = `${r.prefix || ''}${r.first_name || ''} ${r.last_name || ''} ${r.national_id || ''}`.toLowerCase();
    return hay.includes(q);
  });

  if (!match) {
    statusEl.textContent = 'ไม่พบข้อมูลที่ตรงกับ "' + q + '"';
    return;
  }

  const code = provinceNameToCode[normName(match.province)];
  if (!code) {
    statusEl.textContent = 'พบข้อมูลแต่ไม่พบตำแหน่งบนแผนที่สำหรับจังหวัด ' + match.province;
    return;
  }

  statusEl.textContent = `พบ: ${match.prefix || ''}${match.first_name} ${match.last_name} — ${match.province} / ${match.district} · กำลังซูมไปหา...`;

  zoomToProvince(code, () => {
    zoomToDistrict(code, match.district, () => {
      showDistrictPeople(match.province, match.district, match.national_id);
      statusEl.textContent = `พบ: ${match.prefix || ''}${match.first_name} ${match.last_name} — ${match.province} / ${match.district}`;
    });
  });
}

document.getElementById('mapPersonSearch').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') searchAndZoomPerson();
});

/* =========================================================
   แท็บ "ติดตั้ง IoT" — ใช้ระบบแผนที่/leaderboard แบบเดียวกับหน้าอบรม
   แต่อ้างอิงจากตาราง iot_farmers และฟิลด์ตำแหน่ง/สถานะคนละชุด
   (จังหวัด/อำเภอ "ที่ตั้งสวน" + install_status Y/N)
   ใช้ geoProvinces/geoDistricts ชุดเดียวกับแผนที่หน้าอบรม (โหลดครั้งเดียวพอ)
   ========================================================= */

window.allIotRows = [];
window.iotDataLoaded = false;
window.iotMapView = 'country';
window.iotCurrentProvinceCode = null;
window.iotCurrentDistrictName = null;
window.iotCurrentViewBox = [0, 0, SVG_W, SVG_H];
window.iotViewBoxAnimId = null;

window.IOT_FIELDS = { province: 'farm_province', district: 'farm_district', status: 'install_status', done: 'Y', notDone: 'N', project: 'otod_project' };

window.iotProjectFilter = '';

// ===== สถานะ "ติดตั้งแล้ว รอยืนยันเอกสาร" จากข้อมูลเกษตรกร IoT ชุดเก่า (iot_farmers_legacy) =====
// จับคู่เกษตรกรในตาราง iot_farmers (ปัจจุบัน) กับแถวข้อมูลชุดเก่า โดยถือเป็น "คนเดียวกัน" ถ้าตรงกันข้อใดข้อหนึ่งพอ:
// รหัสอ้างอิงตรงกัน หรือ เบอร์โทรตรงกัน หรือ ชื่อ-นามสกุลตรงกัน (เหมือนตรรกะจับคู่ app_connections ที่ใช้อยู่แล้วใน getMatchedAppRecords)
// กันปัญหารหัสอ้างอิงไม่ตรงฟอร์แมตระหว่างจังหวัด/ชีต หรือข้อมูลบางฟิลด์พิมพ์คลาดเคลื่อนจากแหล่งใดแหล่งหนึ่ง
window.iotLegacyByRefId = new Map();  // reference_id -> รหัสฐาน
window.iotLegacyByPhone = new Map();  // เบอร์โทร (trim) -> รหัสฐาน
window.iotLegacyByName = new Map();

// expose ฟังก์ชันของโมดูลนี้ให้ inline handlers และโมดูลอื่นเรียกผ่าน window ได้
Object.assign(window, {
  ensureMapDataLoaded, provinceHasData, renderCountryProvinces, pointInRing, pointInPolygonWithHoles, distToSegment,
  distToRings, labelPoint, renderCountryLabels, fitViewBoxToBounds, animateViewBox, zoomToProvinceByName,
  districtPctColor, zoomToProvince, renderDistrictHtmlLabels, zoomToDistrict, backOneLevel, backToCountryMap,
  showProvinceDetail, closeProvinceDetail, capturePeoplePanelScroll, restorePeoplePanelScroll, renderPeopleGroup, showDistrictPeople,
  showProvinceAllDistrictsPeople, refreshPeoplePanel, toggleHideAddedPeople, closePeoplePanel, searchAndZoomPerson,
});
