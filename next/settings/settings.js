/* I-MODE System (ระบบใหม่) · ตั้งค่า (2026-11-25)
   อ่าน/เขียน system_settings (id 'main') ช่อง data (JSON เดิม ไม่เปลี่ยนโครงสร้าง)
   - หน้าใหม่แก้เฉพาะค่าที่ยังใช้จริง (EDIT_KEYS) ตอนบันทึกอ่านค่าล่าสุดจากฐานข้อมูลก่อน แล้วเปลี่ยนเฉพาะช่องที่แก้
     (ค่าที่หน้าลูกค้าเขียน เช่น ลายเซ็นใบเสนอราคา จะไม่ถูกทับ)
   - ค่าที่ระบบใหม่ไม่ใช้แล้ว เก็บไว้ดูในแท็บ "ยังไม่ได้ใช้งาน" (อ่านอย่างเดียว ข้อมูลไม่ถูกลบ)
   - บัญชีและสิทธิ์: profiles + app_role_perms · บทบาทเพิ่มเติมแก้ผ่าน admin_set_staff_roles (Dev / Service Manager) */
(async function () {
  'use strict';
  var esc = window.NextShell.esc, $ = function (id) { return document.getElementById(id); };
  var api, S = {}, E = {}, tab = 'company', users = [], perms = [];
  try { tab = localStorage.getItem('imode.settings.tab') || 'company'; } catch (e) {}
  var qTab = new URLSearchParams(location.search).get('tab'); if (qTab) tab = qTab;
  var EDIT_KEYS = ['companyNameTh', 'companyName', 'companyAddress', 'companyPhone', 'companyEmail', 'companyTaxId', 'systemName',
    'quoteConfig', 'onsitePricingConfig', 'productCatalog', 'quotationStatuses', 'travelZones', 'mapConfig', 'lineConfig', 'portalNews', 'warrantyConfig', 'documentCategories'];
  var ARCHIVE = [
    ['uiTheme', 'ธีม / สไตล์ UI แบบเดิม', ['uiTheme', 'themePreset', 'iconStyle', 'sidebarStyle']],
    ['typographyConfig', 'ขนาดตัวอักษร', ['typographyConfig']],
    ['language', 'ภาษา', ['language', 'locale', 'currency']],
    ['sla', 'SLA และเวลาตอบรับ', ['sla', 'slaResponse']],
    ['master', 'ข้อมูลหลัก (สถานะ ประเภทงาน ความสำคัญ)', ['statuses', 'serviceTypes', 'priorities', 'customWorkTypes']],
    ['notify', 'การแจ้งเตือนแบบเดิม', ['notificationConfig', 'notificationLeadHours']],
    ['accounts', 'บัญชีผู้ใช้แบบเดิม', ['uatAccounts', 'uatAccountEdits', 'roles', 'userPermissions', 'hiddenLoginUsers', 'rolePresetOptOut', 'authConfig']],
    ['employees', 'พนักงานที่เกี่ยวข้อง (ย้ายไปบุคลากร)', ['relatedEmployees']],
    ['trash', 'ถังขยะแบบเดิม', ['trash']],
    ['integrations', 'สถานะการเชื่อมต่อ / พฤติกรรมระบบ', ['integrations', 'systemBehavior']],
    ['field', 'งานหน้างาน รูป/วิดีโอ รายงาน (เช็กกับแอปช่างก่อนตัด)', ['fieldServiceConfig', 'mediaConfig', 'reportConfig', 'documentConfig', 'customerDistances']]
  ];
  var TABS = [['company', 'บริษัท'], ['price', 'ราคาและค่าบริการ'], ['travel', 'ระยะทาง'], ['line', 'LINE + หน้าลูกค้า'], ['warranty', 'ประกัน + เอกสาร'], ['accounts', 'บัญชีและสิทธิ์'], ['archive', 'ยังไม่ได้ใช้งาน']];

  function clone(o) { return JSON.parse(JSON.stringify(o == null ? null : o)); }
  function get(path) { return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, E); }
  function put(path, v) {
    var ks = path.split('.'), o = E;
    for (var i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null || typeof o[ks[i]] !== 'object') o[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {}; o = o[ks[i]]; }
    o[ks[ks.length - 1]] = v;
  }
  function dirtyKeys() { return EDIT_KEYS.filter(function (k) { return JSON.stringify(E[k] === undefined ? null : E[k]) !== JSON.stringify(S[k] === undefined ? null : S[k]); }); }
  function markDirty() { $('bar').hidden = dirtyKeys().length === 0; }
  var tt; function toast(t) { var el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(tt); tt = setTimeout(function () { el.classList.remove('on'); }, 2600); }
  function showErr(m) { $('err').innerHTML = m ? '<div class="nx-err" role="alert" style="margin-bottom:12px">' + esc(m) + '</div>' : ''; }

  /* ---------- ช่องกรอก ---------- */
  function fld(label, path, o) {
    o = o || {}; var v = get(path); v = v == null ? '' : v;
    var inp = o.area ? '<textarea data-k="' + path + '" rows="' + (o.rows || 2) + '">' + esc(v) + '</textarea>'
      : '<input data-k="' + path + '"' + (o.num ? ' data-t="num" inputmode="decimal" type="number" step="any"' : '') + ' value="' + esc(v) + '"' + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + ' autocomplete="off">';
    return '<label class="cu-f st-f' + (o.wide ? ' wide' : '') + '"><span>' + esc(label) + (o.unit ? ' <small>(' + esc(o.unit) + ')</small>' : '') + '</span>' + inp + (o.hint ? '<small class="st-h">' + esc(o.hint) + '</small>' : '') + '</label>';
  }
  function grid(h) { return '<div class="st-grid">' + h + '</div>'; }
  function sec(t, sub, h) { return '<section class="st-sec"><h2>' + esc(t) + '</h2>' + (sub ? '<p class="st-sub">' + esc(sub) + '</p>' : '') + h + '</section>'; }
  /* ตารางแก้ได้: cols = [[key,label,num?]] */
  function table(path, cols, addLabel) {
    var list = get(path); if (!Array.isArray(list)) list = [];
    return '<div class="st-tw"><table class="st-tbl"><thead><tr>' + cols.map(function (c) { return '<th>' + esc(c[1]) + '</th>'; }).join('') + '<th></th></tr></thead><tbody>' +
      list.map(function (r, i) {
        return '<tr>' + cols.map(function (c) {
          var p = path + '.' + i + (c[0] ? '.' + c[0] : ''), v = c[0] ? (r || {})[c[0]] : r; v = v == null ? '' : v;
          if (c[2] === 'bool') return '<td><input type="checkbox" data-k="' + p + '" data-t="bool"' + (v !== false ? ' checked' : '') + ' aria-label="' + esc(c[1]) + '"></td>';
          return '<td data-l="' + esc(c[1]) + '"><input data-k="' + p + '"' + (c[2] ? ' data-t="num" type="number" step="any" inputmode="decimal"' : '') + ' value="' + esc(v) + '" aria-label="' + esc(c[1]) + '"></td>';
        }).join('') + '<td><button type="button" class="st-del" data-del="' + path + '.' + i + '" aria-label="ลบแถว">✕</button></td></tr>';
      }).join('') + '</tbody></table></div><button type="button" class="nx-btn st-add" data-add="' + path + '" data-cols="' + esc(JSON.stringify(cols.map(function (c) { return [c[0], c[2] || '']; }))) + '">＋ ' + esc(addLabel) + '</button>';
  }

  /* ---------- แต่ละแท็บ ---------- */
  var QC = [['ค่าบริการ Onsite (ช่างไปหน้างาน)', 'onsite'], ['ค่าบริการ Workshop (ส่งเครื่องเข้าบริษัท)', 'workshop'], ['ค่าตรวจเช็ค / วิเคราะห์อาการ', 'diagnosis'], ['ค่าแรงเพิ่ม ต่อชั่วโมง', 'labor'], ['ชั่วโมงถัดไป', 'next']];
  function pane() {
    var q = 'quoteConfig.';
    switch (tab) {
      case 'company': return sec('ข้อมูลบริษัท', 'ใช้บนหัวใบเสนอราคา ใบรับประกัน และหน้าลูกค้า', grid(
        fld('ชื่อบริษัท (ไทย)', 'companyNameTh') + fld('ชื่อบริษัท (อังกฤษ)', 'companyName') + fld('ที่อยู่', 'companyAddress', { area: true, wide: true }) +
        fld('โทรศัพท์', 'companyPhone') + fld('อีเมล', 'companyEmail') + fld('เลขประจำตัวผู้เสียภาษี', 'companyTaxId') + fld('ชื่อระบบ', 'systemName')));
      case 'price':
        return sec('อัตราค่าบริการตามขนาดเครื่อง', 'บาท · ใช้คำนวณในใบเสนอราคา Service', '<div class="st-tw"><table class="st-tbl st-rate"><thead><tr><th>รายการ</th><th>S เครื่องเล็ก</th><th>M เครื่องกลาง</th><th>L เครื่องใหญ่</th></tr></thead><tbody>' +
            QC.map(function (r) { return '<tr><td>' + esc(r[0]) + '</td>' + ['S', 'M', 'L'].map(function (z) { var p = q + r[1] + z; return '<td data-l="' + z + '"><input data-k="' + p + '" data-t="num" type="number" step="any" value="' + esc(get(p) == null ? '' : get(p)) + '" aria-label="' + esc(r[0] + ' ' + z) + '"></td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>') +
          sec('บวกเพิ่มและภาษี', '', grid(fld('VAT', q + 'vatPct', { num: true, unit: '%' }) + fld('งานด่วน บวกเพิ่ม', q + 'urgentPct', { num: true, unit: '%' }) + fld('งานฉุกเฉิน บวกเพิ่ม', q + 'emergencyPct', { num: true, unit: '%' }) + fld('ใบเสนอราคามีอายุ', q + 'validityDays', { num: true, unit: 'วัน' }))) +
          sec('กำไรอะไหล่ (markup)', 'ลูกค้าไม่เห็นต้นทุน เห็นเฉพาะราคาที่บวกแล้ว', grid(fld('อะไหล่ในสต็อก', q + 'markupStock', { num: true, unit: '%' }) + fld('สั่งพิเศษ', q + 'markupSpecial', { num: true, unit: '%' }) + fld('นำเข้า', q + 'markupImported', { num: true, unit: '%' }) + fld('ราคาสูง', q + 'markupHigh', { num: true, unit: '%' }))) +
          sec('ระดับค่าตรวจ Onsite (S / M / L)', get('onsitePricingConfig.note') || '', grid(['S', 'M', 'L'].map(function (z) { return fld(z + ' · ชื่อระดับ', 'onsitePricingConfig.levels.' + z + '.title') + fld(z + ' · ค่าตรวจ', 'onsitePricingConfig.levels.' + z + '.fee', { num: true, unit: 'บาท' }); }).join(''))) +
          sec('รายการสินค้า (ใช้ในใบเสนอราคา)', '', table('productCatalog', [['code', 'รหัส'], ['name', 'ชื่อ'], ['unit', 'หน่วย'], ['price', 'ราคา', 1], ['description', 'รายละเอียด']], 'เพิ่มสินค้า')) +
          sec('สถานะใบเสนอราคา', 'ลำดับแรก = ร่าง (ลูกค้าไม่เห็น)', table('quotationStatuses', [['', 'ชื่อสถานะ']], 'เพิ่มสถานะ'));
      case 'travel': return sec('โซนค่าเดินทาง', 'ระยะทางจากบริษัท (กม.) · ช่องสูงสุดว่าง = ไม่จำกัด · ต่อ กม. ใช้กับโซนไกล', table('travelZones', [['name', 'โซน'], ['min', 'ตั้งแต่ (กม.)', 1], ['max', 'ถึง (กม.)', 1], ['fee', 'ค่าเดินทาง', 1], ['perKm', 'ต่อ กม.', 1]], 'เพิ่มโซน')) +
        sec('จุดเริ่มต้นคิดระยะทาง', '', grid(fld('ที่อยู่บริษัท (จุดออกเดินทาง)', 'mapConfig.originAddress', { wide: true }) + fld('ละติจูด', 'mapConfig.originLat') + fld('ลองจิจูด', 'mapConfig.originLng')));
      case 'line': return sec('LINE Official Account', 'ใช้กับ QR ประจำเครื่องและปุ่มติดต่อในหน้าลูกค้า', grid(
        fld('LINE OA ID', 'lineConfig.officialAccountId', { ph: '@imodeservice' }) + fld('ลิงก์เพิ่มเพื่อน', 'lineConfig.addFriendUrl') +
        fld('ลิงก์หน้าลูกค้า (พิมพ์ลง QR)', 'lineConfig.publicAppUrl', { wide: true, hint: 'อย่าเปลี่ยนถ้าไม่จำเป็น ฉลาก QR ที่ติดเครื่องไปแล้วใช้ลิงก์นี้' }) + fld('LIFF ID (ถ้ามี)', 'lineConfig.liffId'))) +
        sec('ข่าวบนหน้าลูกค้า', 'แสดงสูงสุด 3 ข่าว · ลิงก์ต้องขึ้นต้น https://', table('portalNews', [['title', 'หัวข้อ'], ['text', 'ข้อความ'], ['url', 'ลิงก์'], ['active', 'แสดง', 'bool']], 'เพิ่มข่าว'));
      case 'warranty': return sec('ประกันเครื่อง', '', grid(fld('เตือนก่อนหมดประกัน', 'warrantyConfig.reminderDays', { num: true, unit: 'วัน' }) + fld('ระยะประกันเริ่มต้น', 'warrantyConfig.defaultMonths', { num: true, unit: 'เดือน' }) +
          fld('ราคาต่อประกัน 6 เดือน', 'warrantyConfig.packagePrices.6', { num: true, unit: 'บาท' }) + fld('ราคาต่อประกัน 12 เดือน', 'warrantyConfig.packagePrices.12', { num: true, unit: 'บาท' }) + fld('ราคาต่อประกัน 24 เดือน', 'warrantyConfig.packagePrices.24', { num: true, unit: 'บาท' }))) +
        sec('หมวดเอกสารเครื่องจักร', '', table('documentCategories', [['', 'ชื่อหมวด']], 'เพิ่มหมวด'));
      case 'accounts': return accountsPane();
      case 'archive': return archivePane();
    }
    return '';
  }

  /* ---------- บัญชีและสิทธิ์ ---------- */
  var MODS = [['service', 'Service'], ['calendar', 'ปฏิทิน'], ['quote', 'ใบเสนอราคา'], ['customer', 'ลูกค้า'], ['machine', 'เครื่องจักร'], ['warranty', 'ประกัน'], ['qc', 'QC'], ['demo', 'Demo'], ['modify', 'Modify'], ['dashboard', 'Dashboard'], ['settings', 'ตั้งค่า']];
  function lvl(role, m) {
    var ps = perms.filter(function (p) { return p.role === role; }).map(function (p) { return p.perm; });
    if (ps.indexOf('*') >= 0 || ps.indexOf(m + '.*') >= 0) return ['all', 'ทั้งหมด'];
    if (ps.indexOf(m + '.edit') >= 0) return ['edit', 'แก้ได้'];
    if (ps.indexOf(m + '.view') >= 0) return ['view', 'ดู'];
    return ['', '—'];
  }
  function accountsPane() {
    var roles = []; perms.forEach(function (p) { if (roles.indexOf(p.role) < 0) roles.push(p.role); });
    var h = sec('ผู้ใช้งาน', 'บทบาทหลักกำหนดตอนสร้างบัญชี · บทบาทเพิ่มเติมแก้ได้ที่นี่ (เฉพาะ Dev / Service Manager)',
      '<div class="st-tw"><table class="st-tbl st-users"><thead><tr><th>ชื่อ</th><th>ชื่อผู้ใช้</th><th>บทบาทหลัก</th><th>บทบาทเพิ่มเติม</th><th>สถานะ</th></tr></thead><tbody>' +
      users.map(function (u) {
        var ex = Array.isArray(u.extra_roles) ? u.extra_roles : [];
        return '<tr><td><b>' + esc(u.full_name || '-') + '</b></td><td class="st-mono">' + esc(u.username || '-') + '</td><td><span class="nx-badge">' + esc(u.role || '-') + '</span></td>' +
          '<td><div class="st-chips">' + ex.map(function (r) { return '<span class="st-chip">' + esc(r) + '<button type="button" data-rx="' + esc(u.id) + '" data-r="' + esc(r) + '" aria-label="เอาบทบาท ' + esc(r) + ' ออก">✕</button></span>'; }).join('') +
          '<select data-ra="' + esc(u.id) + '" aria-label="เพิ่มบทบาท"><option value="">＋ เพิ่ม</option>' + roles.filter(function (r) { return r !== u.role && ex.indexOf(r) < 0; }).map(function (r) { return '<option>' + esc(r) + '</option>'; }).join('') + '</select></div></td>' +
          '<td>' + (u.is_active === false ? '<span class="nx-badge bad">ปิดใช้</span>' : '<span class="nx-badge ok">ใช้งาน</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="st-sub">เพิ่มบัญชีใหม่ / รีเซ็ตรหัสผ่าน: ยังทำผ่าน Supabase (จะทำหน้าให้ในขั้นต่อไป)</p>');
    h += sec('สิทธิ์ของแต่ละบทบาท', 'ฐานข้อมูลเป็นตัวล็อกจริง (ตาราง app_role_perms)',
      '<div class="st-tw"><table class="st-tbl st-perm"><thead><tr><th>บทบาท</th>' + MODS.map(function (m) { return '<th>' + esc(m[1]) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      roles.map(function (r) { return '<tr><td><b>' + esc(r) + '</b></td>' + MODS.map(function (m) { var l = lvl(r, m[0]); return '<td><span class="st-lv ' + l[0] + '">' + l[1] + '</span></td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>');
    return h;
  }

  /* ---------- ยังไม่ได้ใช้งาน ---------- */
  function show(v, depth) {
    depth = depth || 0;
    if (v == null || v === '') return '<span class="st-mut">—</span>';
    if (typeof v !== 'object') return esc(String(v));
    if (depth > 3) return '<span class="st-mut">…</span>';
    if (Array.isArray(v)) { if (!v.length) return '<span class="st-mut">ว่าง</span>'; return '<ol class="st-ol">' + v.slice(0, 50).map(function (x) { return '<li>' + show(x, depth + 1) + '</li>'; }).join('') + (v.length > 50 ? '<li class="st-mut">และอีก ' + (v.length - 50) + ' รายการ</li>' : '') + '</ol>'; }
    var ks = Object.keys(v); if (!ks.length) return '<span class="st-mut">ว่าง</span>';
    return '<dl class="st-dl">' + ks.map(function (k) { return '<dt>' + esc(k) + '</dt><dd>' + (/hash|password|secret|token|apikey/i.test(k) ? '<span class="st-mut">••• ซ่อนไว้</span>' : show(v[k], depth + 1)) + '</dd>'; }).join('') + '</dl>';
  }
  function archivePane() {
    return '<p class="st-note">ค่าเหล่านี้ระบบใหม่ไม่ได้ใช้แล้ว เก็บไว้ดูอย่างเดียว ข้อมูลยังอยู่ครบในฐานข้อมูล ไม่มีผลกับการทำงาน</p>' +
      ARCHIVE.map(function (g) {
        var has = g[2].filter(function (k) { return S[k] !== undefined; });
        if (!has.length) return '';
        return '<details class="st-arc"><summary><b>' + esc(g[1]) + '</b><small>' + has.length + ' ค่า</small></summary>' +
          (g[0] === 'accounts' ? '<p class="st-warn">มีรหัสผ่านแบบ hash ของระบบล็อกอินเดิมเก็บอยู่ (ซ่อนไว้ในหน้านี้) แนะนำให้ลบออกจากฐานข้อมูลเมื่อเลิกใช้ระบบเดิม</p>' : '') +
          has.map(function (k) { return '<div class="st-ak"><code>' + esc(k) + '</code>' + show(S[k]) + '</div>'; }).join('') + '</details>';
      }).join('');
  }

  /* ---------- วาด ---------- */
  function render() {
    $('tabs').innerHTML = TABS.map(function (t) { return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (tab === t[0]) + '"' + (t[0] === 'archive' ? ' class="arc"' : '') + '>' + esc(t[1]) + '</button>'; }).join('');
    $('pane').innerHTML = pane();
    $('pane').classList.toggle('ro', tab === 'archive' || tab === 'accounts');
  }

  try { api = await window.NextShell.start({ title: 'ตั้งค่า', moduleId: 'settings' }); }
  catch (e) { $('pane').innerHTML = ''; showErr(e.message); return; }
  var res = await Promise.all([
    api.sb.from('system_settings').select('data').eq('id', 'main').maybeSingle(),
    api.sb.from('profiles').select('id,username,full_name,role,extra_roles,is_active,team').order('full_name').limit(500),
    api.sb.from('app_role_perms').select('role,perm').limit(2000)
  ]);
  if (res[0].error || !res[0].data) { $('pane').innerHTML = ''; showErr('โหลดตั้งค่าไม่ได้: ' + (res[0].error ? res[0].error.message : 'ไม่พบข้อมูล')); return; }
  S = res[0].data.data || {}; E = clone(S); users = res[1].data || []; perms = res[2].data || [];
  if (TABS.every(function (t) { return t[0] !== tab; })) tab = 'company';
  render();

  $('tabs').addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (!b) return; tab = b.getAttribute('data-tab'); try { localStorage.setItem('imode.settings.tab', tab); } catch (x) {} render(); });
  $('pane').addEventListener('input', function (e) {
    var el = e.target, k = el.getAttribute('data-k'); if (!k) return;
    var t = el.getAttribute('data-t'), v = t === 'bool' ? el.checked : t === 'num' ? (el.value === '' ? null : Number(el.value)) : el.value;
    put(k, v); markDirty();
  });
  $('pane').addEventListener('change', async function (e) {
    var el = e.target;
    if (el.getAttribute('data-t') === 'bool') { put(el.getAttribute('data-k'), el.checked); markDirty(); return; }
    var uid = el.getAttribute('data-ra'); if (!uid || !el.value) return;
    var u = users.filter(function (x) { return x.id === uid; })[0]; await setRoles(u, (u.extra_roles || []).concat([el.value]));
  });
  $('pane').addEventListener('click', async function (e) {
    var a = e.target.closest('[data-add]'), d = e.target.closest('[data-del]'), rx = e.target.closest('[data-rx]');
    if (a) { var p = a.getAttribute('data-add'), cols = JSON.parse(a.getAttribute('data-cols')), list = Array.isArray(get(p)) ? get(p).slice() : [];
      var row; if (cols.length === 1 && !cols[0][0]) row = ''; else { row = {}; cols.forEach(function (c) { row[c[0]] = c[1] === 'bool' ? true : c[1] ? null : ''; }); }
      list.push(row); put(p, list); render(); markDirty(); var ins = $('pane').querySelectorAll('[data-k^="' + p + '.' + (list.length - 1) + '"]'); if (ins[0]) ins[0].focus(); return; }
    if (d) { var dp = d.getAttribute('data-del'), i = +dp.split('.').pop(), lp = dp.slice(0, dp.lastIndexOf('.')), l = get(lp).slice(); l.splice(i, 1); put(lp, l); render(); markDirty(); return; }
    if (rx) { var u = users.filter(function (x) { return x.id === rx.getAttribute('data-rx'); })[0], r = rx.getAttribute('data-r'); await setRoles(u, (u.extra_roles || []).filter(function (x) { return x !== r; })); }
  });
  async function setRoles(u, list) {
    if (!u) return;
    var r = await api.sb.rpc('admin_set_staff_roles', { p_id: u.id, p_extra_roles: list });
    if (r.error) { toast(/not_allowed/.test(r.error.message) ? 'เฉพาะ Dev / Service Manager แก้บทบาทได้' : /last_account_admin/.test(r.error.message) ? 'ต้องเหลือผู้ดูแลบัญชีอย่างน้อย 1 คน' : 'แก้บทบาทไม่ได้: ' + r.error.message); render(); return; }
    u.extra_roles = (r.data && r.data.extra_roles) || list; render(); toast('บันทึกบทบาทของ ' + (u.full_name || u.username) + ' แล้ว');
  }
  $('undo').addEventListener('click', function () { E = clone(S); render(); markDirty(); });
  $('save').addEventListener('click', async function () {
    var ks = dirtyKeys(); if (!ks.length) return;
    this.disabled = true;
    var fresh = await api.sb.from('system_settings').select('data').eq('id', 'main').maybeSingle();
    if (fresh.error || !fresh.data) { this.disabled = false; toast('บันทึกไม่ได้: อ่านค่าล่าสุดไม่ได้'); return; }
    var d = fresh.data.data || {};
    ks.forEach(function (k) { d[k] = clone(E[k]); });
    var up = await api.sb.from('system_settings').update({ data: d, updated_at: new Date().toISOString() }).eq('id', 'main');
    this.disabled = false;
    if (up.error) { toast('บันทึกไม่ได้: ' + up.error.message); return; }
    S = d; E = clone(S); render(); markDirty(); toast('บันทึกแล้ว');
  });
  window.addEventListener('beforeunload', function (e) { if (dirtyKeys().length) { e.preventDefault(); e.returnValue = ''; } });
})();
