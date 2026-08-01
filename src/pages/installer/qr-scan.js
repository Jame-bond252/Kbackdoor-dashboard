// ===== สแกน QR หน้าตู้ (ได้ค่าเป็น SN) — ใช้ qr-scanner (nimiq) =====
// ทำไมเปลี่ยนจากของเดิม (jsQR โหลดจาก CDN + rAF loop บนเธรดหลัก):
//   1) ของเดิมโหลดไลบรารีจาก CDN ตอนกดสแกน — ช่างอยู่หน้างานสัญญาณไม่ดีจะสแกนไม่ได้เลย
//      ตัวนี้ฝังมากับเว็บ (bundle) ใช้ได้แม้เน็ตหลุด
//   2) ของเดิมถอดรหัสบนเธรดหลักทุกเฟรมเต็มความละเอียดกล้อง -> เครื่องร้อน ภาพกระตุก
//      ตัวนี้ถอดรหัสใน Web Worker + จำกัดรอบต่อวินาที -> ภาพลื่น ไม่หน่วง
//   3) ของเดิมไม่มีกรอบเล็ง/ไฟฉาย และสแกนทั้งเฟรม (ไปจับ QR ตัวข้างๆ ได้)
// บนแอนดรอยด์ไลบรารีจะเรียกตัวอ่านในเครื่อง (BarcodeDetector) ให้เองอัตโนมัติ เร็วกว่าเดิมอีก
import QrScanner from 'qr-scanner';

window._qrScanner = null;
window._qrOverlay = null;
window._qrTargetId = null;
window._qrLocked = false;   // กันอ่านซ้ำรัวๆ ตอนกำลังปิดกล้อง

function qrOverlayHtml() {
  return `
    <div class="qr-head">
      <span class="qr-title"><i data-icon="camera" data-size="16"></i> สแกน QR หน้าตู้</span>
      <button type="button" class="qr-icon-btn" onclick="closeQrScan()" aria-label="ปิด"><i data-icon="close" data-size="20"></i></button>
    </div>
    <div class="qr-stage">
      <video id="qrVideo" playsinline muted disablepictureinpicture></video>
      <div class="qr-frame" id="qrFrame" aria-hidden="true">
        <span class="qr-corner tl"></span><span class="qr-corner tr"></span>
        <span class="qr-corner bl"></span><span class="qr-corner br"></span>
        <span class="qr-laser"></span>
      </div>
    </div>
    <div class="qr-foot">
      <div class="qr-hint" id="qrHint">กำลังเปิดกล้อง...</div>
      <div class="qr-tools">
        <button type="button" class="qr-tool" id="qrFlashBtn" style="display:none;" onclick="toggleQrFlash()"><i data-icon="sun" data-size="17"></i> <span id="qrFlashLabel">ไฟฉาย</span></button>
        <button type="button" class="qr-tool" onclick="closeQrScan()"><i data-icon="edit" data-size="17"></i> พิมพ์ SN เอง</button>
      </div>
    </div>`;
}

async function scanInstallerQr(id) {
  if (typeof isReadOnlyUser !== 'undefined' && isReadOnlyUser) { showToast('บัญชีนี้ดูอย่างเดียว สแกนไม่ได้', 'warn'); return; }
  if (_qrOverlay) return;                 // เปิดอยู่แล้ว อย่าซ้อน
  _qrTargetId = id;
  _qrLocked = false;

  const ov = document.createElement('div');
  ov.className = 'qr-overlay';
  ov.innerHTML = qrOverlayHtml();
  document.body.appendChild(ov);
  document.body.classList.add('qr-scanning');   // ล็อกไม่ให้หน้าข้างหลังเลื่อน
  _qrOverlay = ov;
  if (typeof mountIcons === 'function') mountIcons(ov);

  const video = ov.querySelector('#qrVideo');
  const hint = ov.querySelector('#qrHint');

  try {
    if (!(await QrScanner.hasCamera())) throw new Error('เครื่องนี้ไม่มีกล้อง');

    _qrScanner = new QrScanner(video, (res) => onQrDecoded(res && res.data ? res.data : String(res || '')), {
      returnDetailedScanResult: true,
      preferredCamera: 'environment',     // กล้องหลังเสมอ
      highlightScanRegion: false,         // ใช้กรอบที่เราวาดเองสวยกว่า
      highlightCodeOutline: false,
      maxScansPerSecond: 8,               // พอสำหรับสแกนจริง แต่เครื่องไม่ร้อน
      // สแกนเฉพาะกลางจอตามกรอบที่เห็น — เร็วขึ้น และไม่ไปจับ QR ตัวข้างๆ
      calculateScanRegion: (v) => {
        const side = Math.round(Math.min(v.videoWidth, v.videoHeight) * 0.68);
        return {
          x: Math.round((v.videoWidth - side) / 2),
          y: Math.round((v.videoHeight - side) / 2),
          width: side, height: side,
          downScaledWidth: 400, downScaledHeight: 400,
        };
      },
    });

    await _qrScanner.start();
    hint.textContent = 'เล็งให้ QR อยู่ในกรอบ ระบบจะอ่านให้เอง';
    ov.classList.add('is-live');

    // ไฟฉาย: โชว์ปุ่มเฉพาะเครื่องที่รองรับจริง (ส่วนใหญ่คือแอนดรอยด์ กล้องหลัง)
    try {
      if (await _qrScanner.hasFlash()) ov.querySelector('#qrFlashBtn').style.display = '';
    } catch (e) { /* เครื่องไม่รองรับไฟฉาย ไม่ต้องโชว์ปุ่ม */ }
  } catch (e) {
    ov.classList.add('is-error');
    const msg = String((e && e.message) || e || '');
    hint.innerHTML = /permission|denied|NotAllowed/i.test(msg)
      ? 'ไม่ได้รับอนุญาตให้ใช้กล้อง — เปิดสิทธิ์กล้องให้เว็บนี้ในตั้งค่าเบราว์เซอร์ แล้วลองใหม่<br>หรือกด "พิมพ์ SN เอง" ด้านล่าง'
      : 'เปิดกล้องไม่ได้: ' + msg + '<br>กด "พิมพ์ SN เอง" ด้านล่างเพื่อกรอกเองได้เลย';
  }
}

async function toggleQrFlash() {
  if (!_qrScanner) return;
  try {
    await _qrScanner.toggleFlash();
    const on = _qrScanner.isFlashOn();
    const btn = _qrOverlay && _qrOverlay.querySelector('#qrFlashBtn');
    const label = _qrOverlay && _qrOverlay.querySelector('#qrFlashLabel');
    if (btn) btn.classList.toggle('is-on', on);
    if (label) label.textContent = on ? 'ปิดไฟฉาย' : 'ไฟฉาย';
  } catch (e) { showToast('เปิดไฟฉายไม่ได้บนเครื่องนี้ครับ', 'warn'); }
}

function onQrDecoded(text) {
  if (_qrLocked) return;
  _qrLocked = true;
  const sn = String(text || '').trim();
  const id = _qrTargetId;
  // ฟีดแบ็กให้รู้ว่าติดแล้ว: กรอบเขียว + สั่นเครื่องสั้นๆ (เครื่องที่รองรับ)
  if (_qrOverlay) _qrOverlay.classList.add('is-hit');
  try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) {}
  setTimeout(() => {
    closeQrScan();
    if (!id || !sn) return;
    installerSetEquip(id, 'scannedSn', sn);
    showToast('สแกน SN ได้: ' + sn, 'success');
  }, 220);
}

function closeQrScan() {
  if (_qrScanner) {
    try { _qrScanner.stop(); _qrScanner.destroy(); } catch (e) {}
    _qrScanner = null;
  }
  if (_qrOverlay && _qrOverlay.parentNode) _qrOverlay.parentNode.removeChild(_qrOverlay);
  _qrOverlay = null; _qrTargetId = null; _qrLocked = false;
  document.body.classList.remove('qr-scanning');
}

// กดปุ่มย้อนกลับของมือถือขณะเปิดกล้อง = ปิดกล้อง ไม่ใช่ออกจากหน้า
window.addEventListener('popstate', () => { if (_qrOverlay) closeQrScan(); });
// สลับไปแอปอื่นแล้วกลับมา บางเครื่องกล้องค้าง — หยุดไว้ก่อนจะปลอดภัยกว่า
document.addEventListener('visibilitychange', () => { if (document.hidden && _qrOverlay) closeQrScan(); });

Object.assign(window, { scanInstallerQr, closeQrScan, toggleQrFlash, onQrDecoded });
