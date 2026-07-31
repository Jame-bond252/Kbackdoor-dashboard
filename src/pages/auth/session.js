// ===== ตรวจ session / สิทธิ์ตาม role / เข้า-ออกระบบ + สร้าง Supabase client =====
// แยกมาจาก main.js เดิม — ตัวแปร/ฟังก์ชันแชร์ผ่าน window (โค้ดเดิมออกแบบเป็น global scope)


async function handleAuthSession(session) {
  if (!session || !session.user) { showAuthView('login'); return; }
  const email = session.user.email;

  // เช็คว่าอีเมลนี้อยู่ในรายชื่อที่อนุญาต (allowed_users) ไหม
  // ลองดึงคอลัมน์ role มาด้วย แต่ถ้ายังไม่ได้รันไฟล์ readonly_viewer_role_migration.sql
  // คอลัมน์ role จะยังไม่มี query จะ error -> ถอยไปใช้แบบเดิม (email, name) เพื่อไม่ให้ใครล็อกอินไม่ได้
  // ลองดึง role + team ก่อน; ถ้าคอลัมน์ยังไม่มี (ยังไม่รัน migration) ค่อยถอยลงทีละขั้นเพื่อไม่ให้ใครล็อกอินไม่ได้
  let allowedRow = null;
  let error = null;
  let res = await supabaseClient.from('allowed_users').select('email, name, role, team').eq('email', email).maybeSingle();
  if (res.error) {
    res = await supabaseClient.from('allowed_users').select('email, name, role').eq('email', email).maybeSingle();
    if (res.error) {
      res = await supabaseClient.from('allowed_users').select('email, name').eq('email', email).maybeSingle();
    }
  }
  allowedRow = res.data;
  error = res.error;

  if (error || !allowedRow) {
    document.getElementById('authPendingEmail').textContent = email;
    showAuthView('pending');
    return;
  }

  document.getElementById('authGate').style.display = 'none';
  document.getElementById('appShell').style.display = 'block';
  const label = document.getElementById('authUserEmailLabel');
  if (label) label.textContent = email;

  currentUserEmail = email;
  currentUserName = (allowedRow.name || '').trim() || email.split('@')[0];
  // ไม่มีคอลัมน์ role (ยังไม่ได้รัน migration) หรือค่าว่าง -> ถือเป็น admin เหมือนเดิม คนเดิมจึงไม่ถูกตัดสิทธิ์
  const roleRaw = String(allowedRow.role || 'admin').trim().toLowerCase();
  currentUserRole = ['admin', 'viewer', 'installer', 'master', 'admin_training', 'admin_iot'].includes(roleRaw) ? roleRaw : 'admin';
  currentUserTeam = (allowedRow.team || '').trim();
  isReadOnlyUser = currentUserRole === 'viewer';
  isMasterUser = currentUserRole === 'master';
  const masterBtn = document.getElementById('userMgmtBtn');
  if (masterBtn) masterBtn.style.display = isMasterUser ? '' : 'none';

  // ===== บัญชีทีมติดตั้ง: เข้าหน้าเฉพาะของทีม เห็นเฉพาะงานทีมตัวเอง ไม่โหลดข้อมูลอบรม/เกษตรกร =====
  if (currentUserRole === 'installer') {
    applyInstallerMode(true);
    await syncIotPlanFromSupabase(); // RLS คืนเฉพาะงานของทีมนี้
    await loadDropdownOptions();     // ทีมติดตั้งต้องใช้ตัวเลือกอุปกรณ์ด้วย
    setupIotPlanRealtimeSync();
    renderInstallerView();
    return;
  }

  applyInstallerMode(false);
  applyReadOnlyUiMode();
  applyModuleAccess();

  loadData();
  await syncPlanFromSupabase();
  await syncIotPlanFromSupabase();
  setupPlanRealtimeSync();
  setupIotPlanRealtimeSync();
  showAppointmentReminder();
}

async function handleLogin() {
  clearAuthError('authLoginError');
  const email = document.getElementById('authLoginEmail').value.trim();
  const password = document.getElementById('authLoginPassword').value;
  if (!email || !password) { showAuthError('authLoginError', 'กรอกอีเมลและรหัสผ่านให้ครบ'); return; }
  if (!supabaseClient) { showAuthError('authLoginError', 'ระบบยังไม่ได้ตั้งค่าการเชื่อมต่อ Supabase (ติดต่อผู้ดูแลระบบ)'); return; }

  const btn = document.getElementById('authLoginBtn');
  const originalText = btn.textContent;
  btn.disabled = true; btn.textContent = 'กำลังเข้าสู่ระบบ...';

  // เช็คก่อนว่าอีเมลนี้ถูกล็อกจากการกรอกรหัสผิดหลายครั้งไหม (ถ้ายังไม่ได้รัน migration ฟังก์ชันจะ error -> ข้ามไปเงียบๆ)
  try {
    const { data: locked } = await supabaseClient.rpc('check_login_locked', { p_email: email });
    if (locked === true) {
      btn.disabled = false; btn.textContent = originalText;
      showAuthError('authLoginError', 'บัญชีนี้ถูกล็อกชั่วคราวจากการกรอกรหัสผิดหลายครั้ง กรุณาติดต่อผู้ดูแล (master) เพื่อปลดล็อก');
      return;
    }
  } catch (e) { /* ยังไม่ได้ตั้งระบบล็อก ก็ล็อกอินตามปกติ */ }

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  btn.disabled = false; btn.textContent = originalText;

  if (error) {
    // กรอกรหัสผิด -> บันทึกเพิ่ม 1 ครั้ง แล้วบอกจำนวนครั้งที่เหลือ
    let extra = '';
    try {
      const { data: count } = await supabaseClient.rpc('record_login_fail', { p_email: email });
      if (typeof count === 'number') {
        if (count >= 5) { showAuthError('authLoginError', 'กรอกรหัสผิดครบ 5 ครั้ง บัญชีถูกล็อก กรุณาติดต่อผู้ดูแล (master) เพื่อปลดล็อก'); return; }
        extra = ` (ผิด ${count}/5 ครั้ง — ครบ 5 ครั้งจะถูกล็อก)`;
      }
    } catch (e) {}
    showAuthError('authLoginError', 'เข้าสู่ระบบไม่สำเร็จ: ' + error.message + extra);
    return;
  }
  // ล็อกอินสำเร็จ -> ล้างตัวนับรหัสผิดของบัญชีนี้
  try { await supabaseClient.rpc('reset_login_on_success'); } catch (e) {}
  await handleAuthSession(data.session);
}

async function handleSignup() {
  clearAuthError('authSignupError');
  const email = document.getElementById('authSignupEmail').value.trim();
  const password = document.getElementById('authSignupPassword').value;
  if (!email || !password) { showAuthError('authSignupError', 'กรอกอีเมลและรหัสผ่านให้ครบ'); return; }
  if (password.length < 6) { showAuthError('authSignupError', 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return; }
  if (!supabaseClient) { showAuthError('authSignupError', 'ระบบยังไม่ได้ตั้งค่าการเชื่อมต่อ Supabase (ติดต่อผู้ดูแลระบบ)'); return; }

  const btn = document.getElementById('authSignupBtn');
  const originalText = btn.textContent;
  btn.disabled = true; btn.textContent = 'กำลังสมัคร...';
  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  btn.disabled = false; btn.textContent = originalText;

  if (error) { showAuthError('authSignupError', 'สมัครไม่สำเร็จ: ' + error.message); return; }

  if (data.session) {
    await handleAuthSession(data.session);
  } else {
    showToast('สมัครสมาชิกสำเร็จ กรุณายืนยันอีเมลตามลิงก์ที่ส่งไปให้ก่อน แล้วค่อยกลับมาเข้าสู่ระบบ', 'info');
    showAuthView('login');
  }
}

async function handleLogout() {
  if (supabaseClient) { await supabaseClient.auth.signOut(); }
  teardownRealtimeSync();
  currentUserEmail = '';
  currentUserName = '';
  currentUserRole = 'admin';
  currentUserTeam = '';
  isReadOnlyUser = false;
  applyInstallerMode(false);
  applyReadOnlyUiMode();
  document.getElementById('appShell').style.display = 'none';
  document.getElementById('authGate').style.display = 'flex';
  showAuthView('login');
}

function teardownRealtimeSync() {
  if (planRealtimeChannel) { supabaseClient.removeChannel(planRealtimeChannel); planRealtimeChannel = null; }
  if (iotPlanRealtimeChannel) { supabaseClient.removeChannel(iotPlanRealtimeChannel); iotPlanRealtimeChannel = null; }
  if (planRealtimeRefreshTimer) { clearTimeout(planRealtimeRefreshTimer); planRealtimeRefreshTimer = null; }
  if (iotPlanRealtimeRefreshTimer) { clearTimeout(iotPlanRealtimeRefreshTimer); iotPlanRealtimeRefreshTimer = null; }
}

function initClient() {
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return true;
}

// ตัวสลับพับ/กางแบบทั่วไป ใช้กับกลุ่มที่สร้างแบบไดนามิก (เช่นจังหวัด/อำเภอในแท็บวางแผนเสร็จแล้ว)
// ที่ไม่รู้จำนวน/ไม่มี id ตายตัวล่วงหน้า ต่างจาก toggleDetail ที่ใช้กับ id คงที่
function toggleGroupBody(headerEl) {
  const body = headerEl.nextElementSibling;
  if (!body) return;
  const show = body.style.display === 'none';
  body.style.display = show ? '' : 'none';
  const chevron = headerEl.querySelector('.chevron');
  if (chevron) chevron.classList.toggle('open', show);
}

function toggleDetail(bodyId, chevronId) {
  const body = document.getElementById(bodyId || 'detailBody');
  const chevron = document.getElementById(chevronId || 'detailChevron');
  const show = body.style.display === 'none';
  body.style.display = show ? 'block' : 'none';
  chevron.classList.toggle('open', show);
}

function animateNumber(el, target, duration) {
  const start = 0;
  const startTime = performance.now();
  function step(now) {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(start + (target - start) * eased).toLocaleString();
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ----- เทรนด์ย้อนหลัง (sparkline) บนการ์ด KPI หลัก -----
// อ่านจากตาราง progress_snapshots ที่สคริปต์ sync รายวันบันทึกไว้วันละ 1 แถว
// (ถ้ายังไม่มีประวัติสะสมพอ จะซ่อนกราฟไว้ก่อน ไม่ใช่บัค แค่ข้อมูลยังไม่พอวาด)
window.progressSnapshots = [];

async function loadProgressSnapshots() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from('progress_snapshots')
      .select('*')
      .order('snapshot_date', { ascending: true })
      .limit(30);
    if (error) throw error;
    progressSnapshots = data || [];
  } catch (e) {
    console.warn('โหลดข้อมูลเทรนด์ย้อนหลังไม่สำเร็จ (จะซ่อนกราฟเทรนด์ไว้ก่อน):', e.message);
    progressSnapshots = [];
  }
  renderKpiSparklines();
}

// expose ฟังก์ชันของโมดูลนี้ให้ inline handlers และโมดูลอื่นเรียกผ่าน window ได้
Object.assign(window, {
  handleAuthSession, handleLogin, handleSignup, handleLogout, teardownRealtimeSync, initClient,
  toggleGroupBody, toggleDetail, animateNumber, loadProgressSnapshots,
});
