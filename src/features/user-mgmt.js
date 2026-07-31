// ===== จัดการผู้ใช้ (เฉพาะ master) + พรีวิวหน้าทีมติดตั้ง =====
// แยกมาจาก main.js เดิม — ตัวแปร/ฟังก์ชันแชร์ผ่าน window (โค้ดเดิมออกแบบเป็น global scope)

function closeUserMgmt() {
  document.getElementById('userMgmtModal').style.display = 'none';
}
function onUmRoleChange() {
  const role = (document.getElementById('umRole') || {}).value;
  const teamInput = document.getElementById('umTeam');
  if (teamInput) teamInput.style.display = role === 'installer' ? '' : 'none';
}

async function loadUserMgmtData() {
  if (!supabaseClient || !isMasterUser) return;
  const { data: users, error } = await supabaseClient.from('allowed_users').select('email, name, role, team').order('role', { ascending: true }).order('email', { ascending: true });
  if (error) { showToast('โหลดรายชื่อผู้ใช้ไม่สำเร็จ: ' + error.message, 'warn'); return; }
  let locked = [];
  try {
    const r = await supabaseClient.from('login_lockout').select('email, fail_count, locked_at').eq('locked', true);
    locked = r.data || [];
  } catch (e) {}
  renderUserMgmt(users || [], locked);
  populateUmPreviewTeams();
}

window.UM_ROLE_LABEL = { master: 'master', admin: 'admin', viewer: 'viewer', installer: 'installer'};
function renderUserMgmt(users, locked) {
  umUsersCache = users;
  const list = document.getElementById('umUserList');
  if (list) {
    list.innerHTML = users.map((u, i) => `
      <div class="um-row">
        <div class="um-row-email"><b>${u.email}</b>${u.name ? `<span>${u.name}</span>` : ''}</div>
        <select id="umr_${i}" onchange="onUmRowRoleChange(${i})">
          <option value="admin" ${u.role==='admin'?'selected':''}>admin (ซูเปอร์)</option>
          <option value="admin_training" ${u.role==='admin_training'?'selected':''}>admin_training</option>
          <option value="admin_iot" ${u.role==='admin_iot'?'selected':''}>admin_iot</option>
          <option value="master" ${u.role==='master'?'selected':''}>master</option>
          <option value="viewer" ${u.role==='viewer'?'selected':''}>viewer</option>
          <option value="installer" ${u.role==='installer'?'selected':''}>installer</option>
        </select>
        <input type="text" id="umt_${i}" value="${(u.team||'').replace(/"/g,'&quot;')}" placeholder="ทีม" style="${u.role==='installer'?'':'visibility:hidden;'}">
        <button class="btn btn-brand btn-xs" onclick="umSaveRow(${i})"><i data-icon="save" data-size="15"></i> บันทึก</button>
        <button class="btn btn-outline btn-xs" style="color:var(--red);" onclick="umRemove(${i})"><i data-icon="trash" data-size="15"></i></button>
      </div>`).join('') || '<div style="opacity:.6;">ยังไม่มีผู้ใช้</div>';
  }
  const lockedSec = document.getElementById('umLockedSection');
  const lockedList = document.getElementById('umLockedList');
  if (lockedSec) lockedSec.style.display = locked.length ? '' : 'none';
  if (lockedList) {
    lockedList.innerHTML = locked.map(l => `
      <div class="um-row">
        <div class="um-row-email"><b>${l.email}</b><span>ถูกล็อก ${l.locked_at ? formatDateTimeThai(l.locked_at) : ''}</span></div>
        <button class="btn btn-brand btn-xs" onclick="umUnlock('${(l.email||'').replace(/'/g,"\\'")}')"><i data-icon="lock" data-size="15"></i> ปลดล็อก</button>
      </div>`).join('');
  }
}
function onUmRowRoleChange(i) {
  const roleSel = document.getElementById('umr_' + i);
  const teamInput = document.getElementById('umt_' + i);
  if (roleSel && teamInput) teamInput.style.visibility = roleSel.value === 'installer' ? 'visible' : 'hidden';
}

async function umAddOrUpdate() {
  if (!isMasterUser) return;
  const email = (document.getElementById('umEmail').value || '').trim().toLowerCase();
  const name = (document.getElementById('umName').value || '').trim();
  const role = document.getElementById('umRole').value;
  const team = role === 'installer' ? (document.getElementById('umTeam').value || '').trim() : null;
  if (!email) { showToast('กรอกอีเมลก่อนครับ', 'warn'); return; }
  if (role === 'installer' && !team) { showToast('installer ต้องระบุชื่อทีมด้วยครับ (สะกดให้ตรงกับช่อง "ทีมติดตั้ง" ในแผน)', 'warn'); return; }
  const { error } = await supabaseClient.from('allowed_users').upsert({ email, name: name || null, role, team }, { onConflict: 'email' });
  if (error) {
    const hint = /role_check|check constraint/i.test(error.message || '')
      ? ' — role นี้ยังใช้ไม่ได้ ต้องรันไฟล์ module_admin_roles_migration.sql ใน Supabase ก่อนครับ'
      : '';
    showToast('บันทึกไม่สำเร็จ: ' + error.message + hint, 'warn'); return;
  }
  showToast(`ให้สิทธิ์ ${email} เป็น ${role}${team ? ' (ทีม ' + team + ')' : ''} แล้วครับ`, 'success');
  document.getElementById('umEmail').value = '';
  document.getElementById('umName').value = '';
  document.getElementById('umTeam').value = '';
  loadUserMgmtData();
}
async function umSaveRow(i) {
  if (!isMasterUser) return;
  const u = umUsersCache[i]; if (!u) return;
  const role = document.getElementById('umr_' + i).value;
  const team = role === 'installer' ? (document.getElementById('umt_' + i).value || '').trim() : null;
  if (role === 'installer' && !team) { showToast('installer ต้องระบุชื่อทีมครับ', 'warn'); return; }
  const { error } = await supabaseClient.from('allowed_users').update({ role, team }).eq('email', u.email);
  if (error) {
    const hint = /role_check|check constraint/i.test(error.message || '')
      ? ' — role นี้ยังใช้ไม่ได้ ต้องรันไฟล์ module_admin_roles_migration.sql ใน Supabase ก่อนครับ'
      : '';
    showToast('อัปเดตไม่สำเร็จ: ' + error.message + hint, 'warn'); return;
  }
  showToast(`อัปเดต ${u.email} แล้ว`, 'success');
  loadUserMgmtData();
}
async function umRemove(i) {
  if (!isMasterUser) return;
  const u = umUsersCache[i]; if (!u) return;
  if (u.email === currentUserEmail) { showToast('ลบบัญชีตัวเองไม่ได้ครับ', 'warn'); return; }
  const ok = await showConfirmModal(`ถอดสิทธิ์เข้าระบบของ ${u.email}? (เขาจะเข้าดูข้อมูลไม่ได้อีก แต่บัญชีล็อกอินยังอยู่)`);
  if (!ok) return;
  const { error } = await supabaseClient.from('allowed_users').delete().eq('email', u.email);
  if (error) { showToast('ลบไม่สำเร็จ: ' + error.message, 'warn'); return; }
  showToast(`ถอดสิทธิ์ ${u.email} แล้ว`, 'success');
  loadUserMgmtData();
}
async function umUnlock(email) {
  if (!isMasterUser) return;
  const { error } = await supabaseClient.rpc('master_unlock_login', { p_email: email });
  if (error) { showToast('ปลดล็อกไม่สำเร็จ: ' + error.message, 'warn'); return; }
  showToast(`ปลดล็อก ${email} แล้วครับ`, 'success');
  loadUserMgmtData();
}

function populateUmPreviewTeams() {
  const sel = document.getElementById('umPreviewTeam');
  if (!sel) return;
  const fromPlan = [...new Set(iotInstallPlan.map(p => p.installTeam).filter(Boolean))];
  const fromOptions = getIotDropdownOptions('install_team');
  const teams = [...new Set([...fromOptions, ...fromPlan])].sort((a, b) => a.localeCompare(b, 'th'));
  const cur = sel.value;
  sel.innerHTML = '<option value="">— เลือกทีม —</option>' + teams.map(t => `<option value="${t}">${t}</option>`).join('');
  sel.value = teams.includes(cur) ? cur : '';
}

// master พรีวิวหน้าทีมติดตั้ง โดยไม่ต้องสลับรหัส
function enterInstallerPreview(team) {
  if (!isMasterUser || !team) return;
  installerPreviewTeam = team;
  installerCurrentTab = 'jobs';
  closeUserMgmt();
  applyInstallerMode(true);
  loadFieldSubmissions().then(() => renderInstallerView());
  renderInstallerView();
}
function enterInstallerPreviewFromSelect() {
  const team = (document.getElementById('umPreviewTeam') || {}).value;
  if (!team) { showToast('เลือกทีมที่จะพรีวิวก่อนครับ', 'warn'); return; }
  enterInstallerPreview(team);
}
function exitInstallerPreview() {
  installerPreviewTeam = null;
  applyInstallerMode(false);
  const b = document.getElementById('userMgmtBtn');
  if (b) b.style.display = isMasterUser ? '' : 'none';
}

async function checkAuthAndBoot() {
  if (!supabaseClient) return;
  document.getElementById('appShell').style.display = 'none';
  document.getElementById('authGate').style.display = 'flex';

  if (!authStateListenerWired) {
    authStateListenerWired = true;
    supabaseClient.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        document.getElementById('appShell').style.display = 'none';
        document.getElementById('authGate').style.display = 'flex';
        showAuthView('login');
      }
    });
  }

  const { data } = await supabaseClient.auth.getSession();
  const session = data ? data.session : null;
  if (session && session.user) {
    await handleAuthSession(session);
  } else {
    showAuthView('login');
  }
}

// expose ฟังก์ชันของโมดูลนี้ให้ inline handlers และโมดูลอื่นเรียกผ่าน window ได้
Object.assign(window, {
  closeUserMgmt, onUmRoleChange, loadUserMgmtData, renderUserMgmt, onUmRowRoleChange, umAddOrUpdate,
  umSaveRow, umRemove, umUnlock, populateUmPreviewTeams, enterInstallerPreview, enterInstallerPreviewFromSelect,
  exitInstallerPreview, checkAuthAndBoot,
});
