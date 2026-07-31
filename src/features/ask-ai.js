// ===== ผู้ช่วย AI ถาม-ตอบ (บริบทรวมฝั่งอบรม + IoT, เรียก edge function ask-ai) =====
// แยกมาจาก main.js เดิม — ตัวแปร/ฟังก์ชันแชร์ผ่าน window (โค้ดเดิมออกแบบเป็น global scope)


async function tryAiAnswer(question, context) {
  try {
    if (!supabaseClient) return null;
    context = context || buildFullQaContext();
    const res = await fetch(SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/smooth-api', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ question, context }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.answer || null;
  } catch (e) {
    return null;
  }
}

window.QA_FALLBACK_MESSAGE = 'ขอโทษครับ ยังไม่เข้าใจคำถามนี้ ลองถามแบบ "จังหวัดสุโขทัยอบรมไปกี่คน" หรือ "จังหวัดไหนอบรมน้อยที่สุด" หรือพิมพ์เลขบัตรประชาชนเพื่อค้นหาคนได้ครับ';

function answerQuestion(qRaw) {
  const q = (qRaw || '').trim();
  if (!q) return 'พิมพ์คำถามก่อนนะครับ';

  const byProvince = aggregateByProvince(allRows);
  const byDistrict = aggregateByProvinceDistrict(allRows);

  const idMatch = q.match(/\d{5,}/);
  if (idMatch) {
    const needle = idMatch[0];
    const found = allRows.find(r => (r.national_id || '').includes(needle));
    if (found) {
      const statusText = found.training_status === 'Y'? 'อบรมแล้ว ': 'ยังไม่อบรม ';
      return `พบข้อมูล: ${found.prefix || ''}${found.first_name || ''} ${found.last_name || ''} — จังหวัด${found.province} อำเภอ${found.district} ตำบล${found.subdistrict || ''} — สถานะ: ${statusText}`;
    }
    return `ไม่พบข้อมูลที่ตรงกับเลข "${needle}"`;
  }

  const provinces = byProvince.map(p => p.province);
  const mentionedProvince = provinces.find(p => q.includes(p));
  const districtsInProvince = mentionedProvince ? byDistrict.filter(d => normName(d.province) === normName(mentionedProvince)) : [];
  const mentionedDistrict = districtsInProvince.find(d => q.includes(d.district));

  const wantsMin = /น้อยที่สุด|แย่ที่สุด|ต่ำสุด|ต้องติดตาม/.test(q);
  const wantsMax = /มากที่สุด|ดีที่สุด|สูงสุด|เยอะที่สุด/.test(q);
  const wantsOverview = /ภาพรวม|สรุป|ทั้งหมด|ทั่วประเทศ/.test(q);

  if (wantsMin && !mentionedProvince) {
    const worst = byProvince.slice().sort((a, b) => a.pct - b.pct)[0];
    return `จังหวัดที่อบรมสำเร็จน้อยที่สุดคือ ${worst.province} (${worst.pct}% — อบรมแล้ว ${worst.Y} จากทั้งหมด ${worst.total} คน)`;
  }
  if (wantsMax && !mentionedProvince) {
    const best = byProvince.slice().sort((a, b) => b.pct - a.pct)[0];
    return `จังหวัดที่อบรมสำเร็จมากที่สุดคือ ${best.province} (${best.pct}%)`;
  }
  if (mentionedProvince && wantsMin && districtsInProvince.length) {
    const worstD = districtsInProvince.slice().sort((a, b) => a.pct - b.pct)[0];
    return `ใน${mentionedProvince} อำเภอที่ยังต้องติดตามมากที่สุดคือ ${worstD.district} (${worstD.pct}% — ยังไม่อบรม ${worstD.N} คน)`;
  }
  if (mentionedProvince && wantsMax && districtsInProvince.length) {
    const bestD = districtsInProvince.slice().sort((a, b) => b.pct - a.pct)[0];
    return `ใน${mentionedProvince} อำเภอที่อบรมสำเร็จมากที่สุดคือ ${bestD.district} (${bestD.pct}%)`;
  }

  if (mentionedDistrict) {
    return `อำเภอ${mentionedDistrict.district} จังหวัด${mentionedProvince}: อบรมแล้ว ${mentionedDistrict.Y} คน · ยังไม่อบรม ${mentionedDistrict.N} คน · รวม ${mentionedDistrict.total} คน (${mentionedDistrict.pct}%)`;
  }

  if (mentionedProvince) {
    const p = byProvince.find(x => x.province === mentionedProvince);
    return `จังหวัด${mentionedProvince}: อบรมแล้ว ${p.Y} คน · ยังไม่อบรม ${p.N} คน · รวม ${p.total} คน (${p.pct}%)`;
  }

  if (wantsOverview) {
    const total = allRows.length;
    const y = allRows.filter(r => r.training_status === 'Y').length;
    const n = total - y;
    return `ภาพรวมทั้งหมด: เกษตรกร ${total.toLocaleString()} คน · อบรมแล้ว ${y.toLocaleString()} คน (${total ? Math.round(y / total * 100) : 0}%) · ยังไม่อบรม ${n.toLocaleString()} คน · ครอบคลุม ${byProvince.length} จังหวัด`;
  }

  return QA_FALLBACK_MESSAGE;
}

async function triggerManualSync(btn) {
  if (!supabaseClient) { showToast('ระบบยังไม่ได้ตั้งค่าการเชื่อมต่อ Supabase (ติดต่อผู้ดูแลระบบ)', 'warn'); return; }
  const originalText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'กำลังสั่งซิงก์...'; }
  try {
    const res = await fetch(SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/trigger-sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      showToast(data.message || 'สั่งซิงก์ข้อมูลแล้ว รอสักครู่แล้วกดรีเฟรชเพื่อดูข้อมูลใหม่', 'success');
    } else {
      showToast('สั่งซิงก์ไม่สำเร็จ: ' + (data.error || ('HTTP ' + res.status)), 'error');
    }
  } catch (e) {
    showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = originalText; }
  }
}

function showComingSoon() {
  showToast('ฟีเจอร์เพิ่ม/แก้ไขข้อมูลเกษตรกรจะเปิดให้ใช้งานในเวอร์ชันถัดไปครับ', 'info');
}

// ===================== ระบบล็อกอิน (Supabase Auth) =====================
// เว็บนี้ต้องล็อกอินก่อนถึงจะเห็นข้อมูลได้ และต้องเป็นอีเมลที่อยู่ในตาราง allowed_users
// (ผู้ดูแลระบบเป็นคนเพิ่มอีเมลเข้ารายชื่อผ่าน Supabase SQL Editor) สมัครสมาชิกได้อิสระ
// แต่จะเห็นข้อมูลจริงก็ต่อเมื่ออีเมลได้รับอนุมัติแล้วเท่านั้น
window.authStateListenerWired = false;

function showAuthView(view) {
  const cards = { login: 'authCardLogin', signup: 'authCardSignup', pending: 'authCardPending' };
  Object.keys(cards).forEach(key => {
    const el = document.getElementById(cards[key]);
    if (el) el.style.display = key === view ? 'block' : 'none';
  });
}

// expose ฟังก์ชันของโมดูลนี้ให้ inline handlers และโมดูลอื่นเรียกผ่าน window ได้
Object.assign(window, {
  tryAiAnswer, answerQuestion, triggerManualSync, showComingSoon, showAuthView,
});
