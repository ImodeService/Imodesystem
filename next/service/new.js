/* I-MODE System (ระบบใหม่) · เปิดเคสใหม่ (new.html)
   ประเภท → ลูกค้า (เดิม/ใหม่) → เครื่องของลูกค้านั้น → อาการ + รูป → นัดหมาย + ช่าง
   บันทึกผ่าน rpc case_create (ฐานข้อมูลออกเลขเคส สร้างลูกค้าใหม่ และเช็คสิทธิ์ service.edit) */
(async function () {
  'use strict';
  var C = window.SvCommon, esc = window.NextShell.esc;
  var $ = function (id) { return document.getElementById(id); };
  var errEl = $('err');
  var api, customers = [], machines = [], techs = [];
  var st = { type: C.TYPES[0].id, prio: 'ปกติ', cust: null, newName: '', q: '', mach: '', photos: [], techs: [] };

  function showErr(m) { errEl.innerHTML = m ? '<div class="nx-err" role="alert">' + esc(m) + '</div>' : ''; if (m) errEl.scrollIntoView({ block: 'center' }); }

  function renderChips() {
    $('types').innerHTML = C.TYPES.map(function (t) { return '<button type="button" data-type="' + esc(t.id) + '" aria-pressed="' + (st.type === t.id) + '">' + esc(t.long) + '</button>'; }).join('');
    var lab = '<span class="mut" style="font-size:14px">ความเร่งด่วน</span>';
    $('prios').innerHTML = lab + C.PRIORITIES.map(function (p) { return '<button type="button" class="' + (p !== 'ปกติ' ? 'urg' : '') + '" data-prio="' + esc(p) + '" aria-pressed="' + (st.prio === p) + '">' + esc(p) + '</button>'; }).join('');
  }

  function renderCust() {
    var box = $('custBox');
    if (st.cust || st.newName) {
      box.innerHTML = '<div class="nc-sel"><span><b>' + esc(st.cust ? st.cust.name : st.newName) + '</b>' + (st.cust ? '' : ' <span class="nx-badge ok">ลูกค้าใหม่</span>') + '</span>' +
        '<button type="button" class="nx-btn" data-cust-clear style="height:34px">เปลี่ยน</button></div>';
      return;
    }
    var q = st.q.trim().toLowerCase();
    var hits = q ? customers.filter(function (c) { return [c.name, c.branch, c.contact, c.phone].join(' ').toLowerCase().indexOf(q) >= 0; }).slice(0, 8) : [];
    box.innerHTML = '<label class="nc-f" style="margin-top:0">ค้นหาลูกค้าเดิม หรือพิมพ์ชื่อลูกค้าใหม่<input id="custQ" autocomplete="off" value="' + esc(st.q) + '" placeholder="ชื่อบริษัท ผู้ติดต่อ เบอร์โทร"></label>' +
      (q ? '<div class="nc-list" role="listbox" aria-label="ผลค้นหาลูกค้า">' + hits.map(function (c) {
        return '<button type="button" role="option" data-cust="' + esc(c.id) + '"><b>' + esc(c.name || '-') + '</b>' + (c.branch ? ' ' + esc(c.branch) : '') +
          '<span class="mut"> · ' + esc([c.contact, c.mcount ? 'มีเครื่อง ' + c.mcount + ' เครื่อง' : ''].filter(Boolean).join(' · ')) + '</span></button>';
      }).join('') + '<button type="button" class="add" data-cust-new>+ ลูกค้าใหม่ "' + esc(st.q.trim()) + '"</button></div>' : '');
  }

  function renderMach() {
    var box = $('machBox');
    if (!st.cust && !st.newName) { box.innerHTML = '<div class="mut" style="font-size:14px">เลือกลูกค้าก่อน</div>'; return; }
    var list = st.cust ? machines.filter(function (m) { return m.customerId === st.cust.id; }) : [];
    box.innerHTML = list.map(function (m) {
      return '<label><input type="radio" name="mach" value="' + esc(m.id) + '"' + (st.mach === m.id ? ' checked' : '') + '> <span>' + esc(m.nameTh || m.name || '-') +
        (m.model ? ' · ' + esc(m.model) : '') + (m.imodeSn ? ' · <span class="mono">' + esc(m.imodeSn) + '</span>' : '') + '</span></label>';
    }).join('') +
      '<label><input type="radio" name="mach" value="__free"' + (st.mach === '__free' || !list.length ? ' checked' : '') + '> <span>เครื่องที่ยังไม่มีในระบบ</span></label>' +
      '<div id="freeMach" class="nc-two"' + (st.mach === '__free' || !list.length ? '' : ' hidden') + '>' +
        '<label class="nc-f">ชื่อเครื่อง / รุ่น<input id="fm_machine" autocomplete="off"></label><label class="nc-f">S/N (ถ้ามี)<input id="fm_serial" autocomplete="off"></label></div>';
    if (!list.length) st.mach = '__free';
  }

  function renderThumbs() {
    $('thumbs').innerHTML = st.photos.map(function (p, i) {
      return '<div><img src="' + esc(p.data) + '" alt=""><button type="button" class="x" data-rm="' + i + '" aria-label="เอารูปที่ ' + (i + 1) + ' ออก">✕</button></div>';
    }).join('') + '<label class="add" title="เพิ่มรูป"><span aria-hidden="true">+</span><input type="file" id="files" accept="image/*" multiple class="vh"><span class="vh">เพิ่มรูป</span></label>';
  }

  function renderTechs() {
    $('techs').innerHTML = techs.length ? techs.map(function (t) {
      return '<label><input type="checkbox" class="vh" value="' + esc(t.id) + '"' + (st.techs.indexOf(t.id) >= 0 ? ' checked' : '') + '>' + esc(t.name || t.id) + '</label>';
    }).join('') : '<span class="mut" style="font-size:14px">ไม่พบรายชื่อช่าง</span>';
  }

  async function checkTechLoad() {
    var day = ($('appointment').value || '').slice(0, 10), w = $('techWarn');
    if (!day || !st.techs.length) { w.innerHTML = ''; return; }
    var r = await api.sb.from('service_cases').select('assignee').like('appointment', day + '%').is('deleted_at', null);
    if (r.error) { w.innerHTML = ''; return; }
    w.innerHTML = st.techs.map(function (tid) {
      var n = (r.data || []).filter(function (c) { return String(c.assignee || '').split(',').map(function (x) { return x.trim(); }).indexOf(tid) >= 0; }).length;
      return n ? '<div class="nc-warn">' + esc(C.techNames(tid, techs)) + ' มีงานวันนั้นแล้ว ' + n + ' งาน</div>' : '';
    }).join('');
  }

  /* ย่อรูปให้ด้านยาวไม่เกิน 1280px (JPEG) ก่อนเก็บ */
  function shrink(file) {
    return new Promise(function (ok, bad) {
      var fr = new FileReader();
      fr.onerror = bad;
      fr.onload = function () {
        var img = new Image();
        img.onerror = bad;
        img.onload = function () {
          var k = Math.min(1, 1280 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
          cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          ok(cv.toDataURL('image/jpeg', 0.8));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  function pickCust(c) {
    st.cust = c; st.newName = ''; st.mach = '';
    $('contact').value = c.contact || ''; $('phone').value = c.phone || '';
    $('location').value = c.location || c.address || ''; $('map_url').value = c.map_url || '';
    renderCust(); renderMach();
  }

  try {
    api = await window.NextShell.start({ title: 'Service', moduleId: 'service' });
    if (!api.can('service.edit')) throw new Error('บัญชีนี้ไม่มีสิทธิ์เปิดเคส');
  } catch (e) { $('f').hidden = true; errEl = document.querySelector('main'); errEl.insertAdjacentHTML('beforeend', '<div class="nx-err" role="alert">' + esc(e.message) + '</div>'); return; }

  renderChips(); renderCust(); renderMach(); renderThumbs(); renderTechs();
  $('channel').innerHTML = C.CHANNELS.map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('');

  var res = await Promise.all([
    api.sb.from('customers').select('id,name,branch,contact,phone,location,address,map_url').is('deleted_at', null).order('name').limit(2000),
    api.sb.from('machines').select('id,customerId,name,nameTh,model,serial,imodeSn').is('deleted_at', null).limit(5000),
    C.loadTechs(api.sb)
  ]);
  if (res[0].error) showErr('โหลดรายชื่อลูกค้าไม่ได้: ' + res[0].error.message);
  customers = res[0].data || []; machines = res[1].data || []; techs = res[2];
  var count = {}; machines.forEach(function (m) { count[m.customerId] = (count[m.customerId] || 0) + 1; });
  customers.forEach(function (c) { c.mcount = count[c.id] || 0; });
  renderTechs();
  /* 2026-11-24: ?customer=<id> จากหน้าลูกค้า → เลือกลูกค้าให้เลย */
  try { var pc = new URLSearchParams(location.search).get('customer'); var hit = pc && customers.filter(function (c) { return c.id === pc; })[0]; if (hit) pickCust(hit); } catch (e) {}

  var f = $('f');
  f.addEventListener('click', function (e) {
    var b;
    if ((b = e.target.closest('[data-type]'))) { st.type = b.getAttribute('data-type'); renderChips(); }
    else if ((b = e.target.closest('[data-prio]'))) { st.prio = b.getAttribute('data-prio'); renderChips(); }
    else if ((b = e.target.closest('[data-cust]'))) pickCust(customers.filter(function (c) { return c.id === b.getAttribute('data-cust'); })[0]);
    else if (e.target.closest('[data-cust-new]')) { st.newName = st.q.trim(); st.cust = null; st.mach = '__free'; renderCust(); renderMach(); $('contact').focus(); }
    else if (e.target.closest('[data-cust-clear]')) { st.cust = null; st.newName = ''; st.mach = ''; renderCust(); renderMach(); var q = $('custQ'); if (q) q.focus(); }
    else if ((b = e.target.closest('[data-rm]'))) { st.photos.splice(+b.getAttribute('data-rm'), 1); renderThumbs(); }
  });
  f.addEventListener('input', function (e) {
    if (e.target.id === 'custQ') { st.q = e.target.value; var pos = e.target.selectionStart; renderCust(); var q = $('custQ'); q.focus(); q.setSelectionRange(pos, pos); }
  });
  f.addEventListener('change', async function (e) {
    var t = e.target;
    if (t.name === 'mach') { st.mach = t.value; var fm = $('freeMach'); if (fm) fm.hidden = st.mach !== '__free'; }
    else if (t.closest('#techs')) { st.techs = Array.prototype.map.call($('techs').querySelectorAll('input:checked'), function (x) { return x.value; }); checkTechLoad(); }
    else if (t.id === 'appointment') checkTechLoad();
    else if (t.id === 'files') {
      var files = Array.prototype.slice.call(t.files || []).filter(function (x) { return /^image\//.test(x.type); });
      for (var i = 0; i < files.length && st.photos.length < 20; i++) {
        try { st.photos.push({ name: files[i].name, type: 'image/jpeg', data: await shrink(files[i]) }); } catch (x) { showErr('อ่านรูป ' + files[i].name + ' ไม่ได้'); }
      }
      renderThumbs();
    }
  });

  f.addEventListener('submit', async function (e) {
    e.preventDefault(); showErr('');
    var name = st.cust ? st.cust.name : st.newName;
    if (!name) { showErr('เลือกลูกค้า หรือเพิ่มลูกค้าใหม่ก่อน'); return; }
    var issue = $('issue').value.trim(); if (!issue) { showErr('ใส่อาการที่ลูกค้าแจ้งก่อน'); $('issue').focus(); return; }
    var m = st.mach && st.mach !== '__free' ? machines.filter(function (x) { return x.id === st.mach; })[0] : null;
    var now = new Date().toISOString(), by = (api.user && (api.user.name || api.user.username)) || '';
    var p = {
      customer_id: st.cust ? st.cust.id : '', customer: name,
      contact: $('contact').value.trim(), phone: $('phone').value.trim(), location: $('location').value.trim(), map_url: $('map_url').value.trim(),
      machine_id: m ? m.id : '', machine: m ? (m.nameTh || m.name || '') : (($('fm_machine') || {}).value || '').trim(),
      model: m ? (m.model || '') : '', serial: m ? (m.serial || '') : (($('fm_serial') || {}).value || '').trim(),
      service_type: st.type, priority: st.prio, channel: $('channel').value, issue: issue, note: $('note').value.trim(),
      assignee: st.techs.join(','), appointment: $('appointment').value || '',
      media: st.photos.map(function (x) { return { at: now, by: by, name: x.name, type: x.type, data: x.data }; })
    };
    var btn = $('save'); btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
    var r = await api.sb.rpc('case_create', { p: p });
    if (r.error) { btn.disabled = false; btn.textContent = 'บันทึกเคส'; showErr('บันทึกไม่สำเร็จ: ' + r.error.message); return; }
    var row = Array.isArray(r.data) ? r.data[0] : r.data;
    location.href = 'case.html?id=' + encodeURIComponent(row.id);
  });
})();
