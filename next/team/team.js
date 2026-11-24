/* I-MODE System (ระบบใหม่) · ทีมงาน (2026-11-25)
   รวมช่าง (technicians) + บัญชีผู้ใช้ (profiles) ในหน้าเดียว · จำนวนเคสที่ยังเปิดของช่างแต่ละคน (service_cases.assignee)
   ดูอย่างเดียว: เพิ่ม/แก้บัญชีและสิทธิ์ที่ ตั้งค่า → บัญชีและสิทธิ์ */
(async function () {
  'use strict';
  var esc = window.NextShell.esc, F = window.NextForm, C = window.SvCommon, $ = function (id) { return document.getElementById(id); };
  var api, people = [], cases = [], kind = '', q = '';
  function showErr(m) { $('err').innerHTML = m ? '<div class="nx-err" role="alert" style="margin-bottom:12px">' + esc(m) + '</div>' : ''; }
  function ini(n) { return String(n || '?').trim().slice(0, 2); }
  function openOf(p) { return p.techId ? cases.filter(function (c) { return String(c.assignee || '').split(',').map(function (x) { return x.trim(); }).indexOf(p.techId) >= 0; }) : []; }

  function render() {
    $('acts').innerHTML = api.can('settings.roles') || api.can('settings.view') ? '<a class="nx-btn" href="../settings/index.html?tab=accounts">⚙ จัดการบัญชีและสิทธิ์</a>' : '';
    var K = [['', 'ทั้งหมด', people.length], ['tech', 'ช่าง', people.filter(function (p) { return p.techId; }).length], ['user', 'มีบัญชีเข้าระบบ', people.filter(function (p) { return p.pid; }).length], ['off', 'ปิดใช้งาน', people.filter(function (p) { return !p.active; }).length]];
    $('cards').innerHTML = K.map(function (c) { return '<button type="button" class="nx-card q-card" data-c="' + c[0] + '" aria-pressed="' + (kind === c[0]) + '"><small>' + c[1] + '</small><b>' + c[2] + '</b></button>'; }).join('');
    var s = q.trim().toLowerCase();
    var rows = people.filter(function (p) {
      if (kind === 'tech' && !p.techId) return false; if (kind === 'user' && !p.pid) return false; if (kind === 'off' && p.active) return false;
      return !s || [p.name, p.username, p.roles.join(' '), p.team, p.phone, p.skills].join(' ').toLowerCase().indexOf(s) >= 0;
    }).sort(function (a, b) { return (b.active - a.active) || (openOf(b).length - openOf(a).length) || String(a.name).localeCompare(String(b.name), 'th'); });
    $('thead').innerHTML = '<tr><th>ชื่อ</th><th>ตำแหน่ง / สิทธิ์</th><th>ทีม</th><th>ติดต่อ</th><th>เคสที่เปิดอยู่</th><th>สถานะ</th></tr>';
    $('rows').innerHTML = rows.map(function (p) {
      var n = openOf(p).length;
      return '<tr data-i="' + people.indexOf(p) + '"><td><span class="tm-av" style="background:' + esc(p.color || '#3A4A63') + '">' + (p.photo && /^(https:\/\/|data:image\/)/.test(p.photo) ? '<img src="' + esc(p.photo) + '" alt="">' : esc(ini(p.name))) + '</span><b>' + esc(p.name) + '</b>' + (p.username ? '<div class="sub2">@' + esc(p.username) + '</div>' : '') + '</td>' +
        '<td>' + (p.roles.length ? p.roles.map(function (r) { return '<span class="st">' + esc(r) + '</span>'; }).join(' ') : '-') + '</td><td data-l="ทีม">' + esc(p.team || '-') + '</td><td data-l="ติดต่อ">' + esc(p.phone || '-') + '</td>' +
        '<td data-l="เคสเปิด">' + (p.techId ? '<b>' + n + '</b> เคส' : '-') + '</td><td><span class="st ' + (p.active ? 'ok' : 'no') + '">' + (p.active ? 'ใช้งาน' : 'ปิดใช้งาน') + '</span></td></tr>';
    }).join('');
    $('empty').hidden = rows.length > 0;
  }

  function detail(p) {
    var L = openOf(p).sort(function (a, b) { return String(a.appointment || a.created_at || '').localeCompare(String(b.appointment || b.created_at || '')); });
    var html = '<div class="tm-cases">' + (L.length ? L.map(function (c) { return '<a href="../service/case.html?id=' + encodeURIComponent(c.id) + '"><b>' + esc(c.ticket || c.id) + '</b> ' + esc(c.customer || '') + '<span class="st">' + esc(C.stageName(C.stageOf(c))) + '</span></a>'; }).join('') : '<small class="nf-none">ไม่มีเคสที่เปิดอยู่</small>') + '</div>';
    F.open({ title: p.name, sub: [p.roles.join(', '), p.team, p.skills].filter(Boolean).join(' · '), fields: [], extra: '<h3 class="tm-h">เคสที่ยังเปิดอยู่ (' + L.length + ')</h3>' + html, okLabel: 'ปิด', view: true });
  }

  try { api = await window.NextShell.start({ title: 'ทีมงาน', moduleId: 'service' }); } catch (e) { $('rows').innerHTML = ''; showErr(e.message); return; }
  $('q').placeholder = 'ค้นหาชื่อ ตำแหน่ง ทีม';
  var res = await Promise.all([api.sb.from('technicians').select('*').limit(1000),
    api.sb.from('profiles').select('id,username,full_name,role,extra_roles,team,technician_id,photo_url,is_active,color').limit(1000),
    api.sb.from('service_cases').select('id,ticket,customer,stage,status,assignee,appointment,created_at').is('deleted_at', null).limit(10000)]);
  if (res[1].error && /color/.test(res[1].error.message)) res[1] = await api.sb.from('profiles').select('id,username,full_name,role,extra_roles,team,technician_id,photo_url,is_active').limit(1000);
  if (res[0].error && res[1].error) { $('rows').innerHTML = ''; showErr('โหลดทีมงานไม่ได้: ' + res[0].error.message); return; }
  cases = (res[2].data || []).filter(function (c) { return C.stageOf(c) !== 'closed'; });
  var byTech = {};
  (res[1].data || []).forEach(function (p) {
    var o = { pid: p.id, name: p.full_name || p.username || '-', username: p.username, roles: [p.role].concat(p.extra_roles || []).filter(Boolean), team: p.team, techId: p.technician_id || '', photo: p.photo_url, color: p.color, active: p.is_active !== false };
    people.push(o); if (o.techId) byTech[o.techId] = o;
  });
  (res[0].data || []).forEach(function (t) {
    var o = byTech[t.id];
    if (!o) { o = { pid: '', name: t.name, username: '', roles: [], team: '', techId: t.id, active: true }; people.push(o); }
    if (!o.name || o.name === '-') o.name = t.name || '-';
    if (!o.roles.length && t.role) o.roles = [t.role];
    o.team = o.team || t.team; o.phone = t.phone; o.skills = Array.isArray(t.skills) ? t.skills.join(', ') : (t.skills || ''); o.color = o.color || t.color; o.photo = o.photo || t.photo;
    if (t.status && /inactive|ลาออก|ปิด/i.test(t.status)) o.active = false;
  });
  render();
  $('cards').addEventListener('click', function (e) { var b = e.target.closest('[data-c]'); if (!b) return; kind = b.getAttribute('data-c'); render(); });
  $('q').addEventListener('input', function () { q = this.value; render(); });
  $('rows').addEventListener('click', function (e) { var a = e.target.closest('[data-i]'); if (a) detail(people[+a.getAttribute('data-i')]); });
})();
