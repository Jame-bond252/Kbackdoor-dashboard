// ===== ค้นหาข้ามทุกเมนู (แผนอบรม / แผนติดตั้ง IoT / เชื่อมต่อแอป / ข้อมูล OTOD) =====
// แยกมาจาก main.js เดิม — ตัวแปร/ฟังก์ชันแชร์ผ่าน window (โค้ดเดิมออกแบบเป็น global scope)


function searchGlobalAll(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return [];
  const results = [];

  trainingPlan.forEach(p => {
    const hay = `${p.name || ''} ${p.nationalId || ''} ${p.phone || ''}`.toLowerCase();
    if (hay.includes(q)) {
      results.push({
        tag: 'แผนอบรม',
        title: p.name || p.nationalId || '(ไม่มีชื่อ)',
        sub: [p.nationalId, p.phone].filter(Boolean).join(' · '),
        action: () => jumpToPlanEntry(p),
      });
    }
  });

  iotInstallPlan.forEach(p => {
    const hay = `${p.name || ''} ${p.nationalId || ''} ${p.phone || ''}`.toLowerCase();
    if (hay.includes(q)) {
      results.push({
        tag: 'แผนติดตั้ง IoT',
        title: p.name || p.nationalId || '(ไม่มีชื่อ)',
        sub: [p.nationalId, p.phone].filter(Boolean).join(' · '),
        action: () => jumpToIotPlanEntry(p),
      });
    }
  });

  appConnections.forEach(c => {
    const name = `${c.first_name || ''} ${c.last_name || ''}`.trim();
    const hay = `${name} ${c.national_id || ''} ${c.phone || ''} ${c.app_iot_id || ''}`.toLowerCase();
    if (hay.includes(q)) {
      results.push({
        tag: 'เชื่อมต่อแอป',
        title: name || c.national_id || '(ไม่มีชื่อ)',
        sub: [c.app_iot_id ? 'SN: ' + c.app_iot_id : '', c.national_id].filter(Boolean).join(' · '),
        action: () => { switchModule('iot'); switchTab('iot-app-match'); closeGlobalSearch(); },
      });
    }
  });

  const seenOtod = new Set();
  allRows.forEach(r => {
    const hay = `${r.prefix || ''}${r.first_name || ''} ${r.last_name || ''} ${r.national_id || ''}`.toLowerCase();
    if (hay.includes(q)) {
      const key = 'train:' + r.national_id;
      if (seenOtod.has(key)) return;
      seenOtod.add(key);
      results.push({
        tag: 'ข้อมูลอบรม (OTOD)',
        title: `${r.prefix || ''}${r.first_name || ''} ${r.last_name || ''}`.trim(),
        sub: [r.national_id, r.province, r.district].filter(Boolean).join(' · '),
        action: () => jumpToOtodMap(r),
      });
    }
  });

  allIotRows.forEach(r => {
    const hay = `${r.prefix || ''}${r.first_name || ''} ${r.last_name || ''} ${r.national_id || ''}`.toLowerCase();
    if (hay.includes(q)) {
      const key = 'iot:' + r.national_id;
      if (seenOtod.has(key)) return;
      seenOtod.add(key);
      results.push({
        tag: 'ข้อมูล IoT (OTOD)',
        title: `${r.prefix || ''}${r.first_name || ''} ${r.last_name || ''}`.trim(),
        sub: [r.national_id, r[IOT_FIELDS.province], r[IOT_FIELDS.district]].filter(Boolean).join(' · '),
        action: () => jumpToIotMap(r),
      });
    }
  });

  return results.slice(0, 25);
}

function renderGlobalSearchResults(query) {
  const box = document.getElementById('globalSearchResults');
  if (!box) return;
  const q = (query || '').trim();
  if (!q) { box.style.display = 'none'; box.innerHTML = ''; return; }

  const results = searchGlobalAll(q);
  if (!results.length) {
    box.innerHTML = `<div class="global-search-empty">ไม่พบข้อมูลที่ตรงกับ "${q}"</div>`;
  } else {
    box.innerHTML = results.map((r, i) => `
      <div class="global-search-item" onclick="runGlobalSearchAction(${i})">
        <span class="gs-tag">${r.tag}</span>
        <span class="gs-title">${r.title}</span>
        <span class="gs-sub">${r.sub}</span>
      </div>
    `).join('');
  }
  box.style.display = 'block';
  window.__globalSearchResults = results;
}

function runGlobalSearchAction(i) {
  const results = window.__globalSearchResults || [];
  const r = results[i];
  if (r && r.action) r.action();
}

function closeGlobalSearch() {
  const box = document.getElementById('globalSearchResults');
  if (box) { box.style.display = 'none'; box.innerHTML = ''; }
  const input = document.getElementById('globalSearchInput');
  if (input) input.value = '';
}

function jumpToPlanEntry(p) {
  switchModule('training');
  switchTab('plan');
  const el = document.getElementById('planFilterSearch');
  planHighlightEntryId = p.id;
  if (el) { el.value = p.name || p.nationalId || ''; applyPlanFilters(); }
  closeGlobalSearch();
  const row = document.getElementById('highlightedPlanTableRow');
  if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function jumpToIotPlanEntry(p) {
  switchModule('iot');
  switchTab('iot-plan');
  const el = document.getElementById('iotPlanFilterSearch');
  iotPlanHighlightEntryId = p.id;
  if (el) { el.value = p.name || p.nationalId || ''; applyIotPlanFilters(); }
  closeGlobalSearch();
  const row = document.getElementById('highlightedIotPlanTableRow');
  if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function jumpToOtodMap(r) {
  switchModule('training');
  switchTab('map');
  const el = document.getElementById('mapPersonSearch');
  if (el) el.value = `${r.prefix || ''}${r.first_name || ''} ${r.last_name || ''}`.trim();
  closeGlobalSearch();
  setTimeout(() => searchAndZoomPerson(), 400);
}

function jumpToIotMap(r) {
  switchModule('iot');
  switchTab('iot-map');
  const el = document.getElementById('iotPersonSearch');
  if (el) el.value = `${r.prefix || ''}${r.first_name || ''} ${r.last_name || ''}`.trim();
  closeGlobalSearch();
  setTimeout(() => searchAndZoomIotPerson(), 400);
}

document.addEventListener('click', (e) => {
  const wrap = document.getElementById('globalSearchInput');
  const box = document.getElementById('globalSearchResults');
  if (!wrap || !box) return;
  if (e.target !== wrap && !box.contains(e.target)) {
    box.style.display = 'none';
  }
});

function getQaPopupIdForModule() {
  return currentModule === 'iot' ? 'tab-iot-qa' : 'tab-qa';
}

function openQaBubble() {
  const targetId = getQaPopupIdForModule();
  document.querySelectorAll('.qa-popup-panel').forEach(el => el.classList.remove('open'));
  const panel = document.getElementById(targetId);
  if (panel) panel.classList.add('open');
  if (targetId === 'tab-qa') {
    const log = document.getElementById('qaLog');
    if (log && !log.dataset.greeted) {
      log.dataset.greeted = '1';
      appendQaMessage('สวัสดีครับ ถามได้เลยเช่น "จังหวัดสุโขทัยอบรมไปกี่คน" หรือกดปุ่มคำถามแนะนำด้านบนก็ได้ครับ', 'bot');
    }
  } else {
    const log = document.getElementById('iotQaLog');
    if (log && !log.dataset.greeted) {
      log.dataset.greeted = '1';
      appendQaMessage('สวัสดีครับ ถามได้เลยเช่น "จังหวัดเลยติดตั้งไปกี่คน" หรือกดปุ่มคำถามแนะนำด้านบนก็ได้ครับ', 'bot', 'iotQaLog');
    }
  }
}

function closeQaBubble() {
  document.querySelectorAll('.qa-popup-panel').forEach(el => el.classList.remove('open'));
}

function toggleQaBubble() {
  const targetId = getQaPopupIdForModule();
  const panel = document.getElementById(targetId);
  if (panel && panel.classList.contains('open')) {
    closeQaBubble();
  } else {
    openQaBubble();
  }
}

function appendQaMessage(text, who, logId) {
  const log = document.getElementById(logId || 'qaLog');
  if (!log) return null;
  const div = document.createElement('div');
  div.className = 'qa-msg qa-' + who;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}

function askPreset(text) {
  document.getElementById('qaInput').value = text;
  askQuestion();
}

async function askQuestion() {
  const input = document.getElementById('qaInput');
  const q = input.value.trim();
  if (!q) return;
  if (!allRows.length) {
    appendQaMessage(q, 'user');
    appendQaMessage('ข้อมูลยังโหลดไม่เสร็จ กรุณารอสักครู่แล้วลองใหม่ครับ', 'bot');
    input.value = '';
    return;
  }
  appendQaMessage(q, 'user');
  input.value = '';

  const ruleBasedAnswer = answerQuestion(q);
  if (ruleBasedAnswer !== QA_FALLBACK_MESSAGE) {
    appendQaMessage(ruleBasedAnswer, 'bot');
    return;
  }

  const thinkingEl = appendQaMessage('กำลังคิดคำตอบ...', 'bot');
  const aiAnswer = await tryAiAnswer(q, buildFullQaContext());
  if (thinkingEl) thinkingEl.remove();
  appendQaMessage(aiAnswer || ruleBasedAnswer, 'bot');
}

function buildQaContext() {
  const byProvince = aggregateByProvince(allRows);
  const byDistrict = aggregateByProvinceDistrict(allRows);
  const total = allRows.length;
  const y = allRows.filter(r => r.training_status === 'Y').length;
  return {
    total,
    trained: y,
    untrained: total - y,
    note: 'ไม่มีข้อมูลสถานที่/วันเวลาจัดอบรมจริง มีแค่จำนวนคนแบ่งตามจังหวัด/อำเภอ ใช้ความรู้ภูมิศาสตร์ทั่วไปของประเทศไทยช่วยแนะนำการจัดกลุ่มพื้นที่ใกล้เคียงกันได้ แต่ต้องบอกผู้ใช้ว่าเป็นการประมาณคร่าวๆ ไม่ใช่เส้นทาง/ระยะทางจริง',
    byProvince: byProvince.map(p => ({ province: p.province, Y: p.Y, N: p.N, pct: p.pct })),
    byDistrict: byDistrict.map(d => ({ province: d.province, district: d.district, Y: d.Y, N: d.N, pct: d.pct })),
  };
}

// ---- บริบทฉบับเต็ม (รวมทั้งฝั่งอบรมและฝั่ง IoT) ให้ AI ตอบคำถามได้ครอบคลุมทุกหัวข้อ
// ไม่ว่าจะถามจากแท็บถาม-ตอบฝั่งไหนก็ตาม (ก่อนหน้านี้แต่ละฝั่งเห็นแค่ข้อมูลของตัวเอง)
function buildFullQaContext() {
  const trainByProvince = aggregateByProvince(allRows);
  const trainByDistrict = aggregateByProvinceDistrict(allRows);
  const trainTotal = allRows.length;
  const trainY = allRows.filter(r => r.training_status === 'Y').length;

  const iotRowsQ = getIotVisibleRows();
  const iotByProvince = aggregateByProvince(iotRowsQ, IOT_FIELDS.province, IOT_FIELDS.status, IOT_FIELDS.done, IOT_FIELDS.notDone);
  const iotByDistrict = aggregateByProvinceDistrict(iotRowsQ, IOT_FIELDS.province, IOT_FIELDS.district, IOT_FIELDS.status, IOT_FIELDS.done, IOT_FIELDS.notDone);
  const iotTotal = iotRowsQ.length;
  const iotY = iotRowsQ.filter(r => r[IOT_FIELDS.status] === IOT_FIELDS.done).length;
  const appConnectedCount = iotRowsQ.filter(r => r.app_connected).length;

  const boxByTeam = {};
  (typeof getIotBoxTeamProvinceRows === 'function' ? getIotBoxTeamProvinceRows() : []).forEach(r => {
    boxByTeam[r.team] = (boxByTeam[r.team] || 0) + r.count;
  });

  const todayStr = todayDateStr();
  const upcomingTrain = trainingPlan.filter(p => p.visitDate && p.visitDate >= todayStr && p.status !== 'cancelled').length;
  const upcomingIot = iotInstallPlan.filter(p => p.installDate && p.installDate >= todayStr && p.status !== 'cancelled').length;

  return {
    today: todayStr,
    training: {
      total: trainTotal,
      trained: trainY,
      untrained: trainTotal - trainY,
      pct: trainTotal ? Math.round(trainY / trainTotal * 100) : 0,
      byProvince: trainByProvince.map(p => ({ province: p.province, Y: p.Y, N: p.N, pct: p.pct })),
      byDistrict: trainByDistrict.map(d => ({ province: d.province, district: d.district, Y: d.Y, N: d.N, pct: d.pct })),
      planTotal: trainingPlan.length,
      planScheduled: trainingPlan.filter(p => p.visitDate).length,
      planDone: trainingPlan.filter(p => p.status === 'done').length,
      planUpcoming: upcomingTrain,
    },
    iot: {
      total: iotTotal,
      installed: iotY,
      notInstalled: iotTotal - iotY,
      pct: iotTotal ? Math.round(iotY / iotTotal * 100) : 0,
      appConnected: appConnectedCount,
      byProvince: iotByProvince.map(p => ({ province: p.province, Y: p.Y, N: p.N, pct: p.pct })),
      byDistrict: iotByDistrict.map(d => ({ province: d.province, district: d.district, Y: d.Y, N: d.N, pct: d.pct })),
      planTotal: iotInstallPlan.length,
      planScheduled: iotInstallPlan.filter(p => p.installDate).length,
      planDone: iotInstallPlan.filter(p => p.status === 'done').length,
      planUpcoming: upcomingIot,
      boxesByTeam: boxByTeam,
    },
    note: 'planTotal/planScheduled/planDone/planUpcoming คือแผนงานที่ทีมงานตั้งไว้เอง (นัดหมายอบรม/ติดตั้ง) แยกต่างหากจากสถานะจริงในระบบ OTOD (trained/installed) ไม่มีข้อมูลสถานที่จัดงาน/เส้นทางจริง ใช้ความรู้ภูมิศาสตร์ทั่วไปของประเทศไทยช่วยแนะนำจัดกลุ่มพื้นที่ได้ แต่ต้องบอกผู้ใช้ว่าเป็นการประมาณคร่าวๆ',
  };
}

// expose ฟังก์ชันของโมดูลนี้ให้ inline handlers และโมดูลอื่นเรียกผ่าน window ได้
Object.assign(window, {
  searchGlobalAll, renderGlobalSearchResults, runGlobalSearchAction, closeGlobalSearch, jumpToPlanEntry, jumpToIotPlanEntry,
  jumpToOtodMap, jumpToIotMap, getQaPopupIdForModule, openQaBubble, closeQaBubble, toggleQaBubble,
  appendQaMessage, askPreset, askQuestion, buildQaContext, buildFullQaContext,
});
