// ===== จุดเริ่มระบบ: ผูก event ตัวกรองทุกหน้า + โหลดแผนจาก storage + เริ่ม auth =====
// แยกมาจาก main.js เดิม — ตัวแปร/ฟังก์ชันแชร์ผ่าน window (โค้ดเดิมออกแบบเป็น global scope)

document.getElementById('iotFilterAppConnected').addEventListener('change', applyIotFilters);
document.getElementById('iotFilterSearch').addEventListener('input', applyIotFilters);

document.getElementById('planFilterProvince').addEventListener('change', onPlanFilterProvinceChange);
document.getElementById('planFilterDistrict').addEventListener('change', onPlanFilterDistrictChange);
document.getElementById('planFilterSubdistrict').addEventListener('change', applyPlanFilters);
document.getElementById('planFilterStatus').addEventListener('change', applyPlanFilters);
document.getElementById('planFilterScheduled').addEventListener('change', applyPlanFilters);
document.getElementById('planFilterSearch').addEventListener('input', applyPlanFilters);

document.getElementById('iotPlanFilterProvince').addEventListener('change', onIotPlanFilterProvinceChange);
document.getElementById('iotPlanFilterDistrict').addEventListener('change', onIotPlanFilterDistrictChange);
document.getElementById('iotPlanFilterSubdistrict').addEventListener('change', applyIotPlanFilters);
document.getElementById('iotPlanFilterStatus').addEventListener('change', applyIotPlanFilters);
document.getElementById('iotPlanFilterScheduled').addEventListener('change', applyIotPlanFilters);
document.getElementById('iotPlanFilterTeam').addEventListener('change', applyIotPlanFilters);
document.getElementById('iotPlanFilterBoxType').addEventListener('change', applyIotPlanFilters);
document.getElementById('iotPlanFilterSearch').addEventListener('input', applyIotPlanFilters);

document.getElementById('iotPlanFinalizedFilterProvince').addEventListener('change', onIotPlanFinalizedFilterProvinceChange);
document.getElementById('iotPlanFinalizedFilterDistrict').addEventListener('change', onIotPlanFinalizedFilterDistrictChange);
document.getElementById('iotPlanFinalizedFilterSubdistrict').addEventListener('change', renderIotPlanFinalizedSection);
document.getElementById('iotPlanFinalizedFilterSearch').addEventListener('input', renderIotPlanFinalizedSection);

document.getElementById('trainingConfirmFilterProvince').addEventListener('change', onTrainingConfirmFilterProvinceChange);
document.getElementById('trainingConfirmFilterDistrict').addEventListener('change', onTrainingConfirmFilterDistrictChange);
document.getElementById('trainingConfirmFilterSubdistrict').addEventListener('change', renderTrainingConfirmTab);
document.getElementById('trainingConfirmFilterStatus').addEventListener('change', renderTrainingConfirmTab);
document.getElementById('trainingConfirmFilterSearch').addEventListener('input', renderTrainingConfirmTab);

document.getElementById('instFilterDistrict').addEventListener('change', () => { populateInstallerFilters(); renderInstallerView(); });
document.getElementById('instFilterSubdistrict').addEventListener('change', renderInstallerView);
document.getElementById('instFilterWeek').addEventListener('change', renderInstallerView);
document.getElementById('instFilterStatus').addEventListener('change', renderInstallerView);
document.getElementById('instFilterSearch').addEventListener('input', renderInstallerView);

loadPlanFromStorage();
loadIotPlanFromStorage();

if (document.documentElement.getAttribute('data-theme') === 'dark') {
  document.getElementById('themeToggleBtn').innerHTML = icon('sun', 16);
}
initClient();
checkAuthAndBoot();