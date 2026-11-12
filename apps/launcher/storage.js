/* 2026-11-13 owner (checklist B13–B15, item 6): when the browser's storage is full.
   - ImodeStoragePanel.notice(next) — after a sign-in that could keep the session for this tab
     only: a calm note, once per tab, with ไปต่อ and ดูว่าอะไรใช้พื้นที่.
   - ImodeStoragePanel.open() — what this device stores, biggest first, and a button that clears
     the copies the server already holds. Also opens on login.html?storage=1 at any time.
   Clearing never trusts the device alone: for every case, customer request and quotation that
   carries photos/files here, the server's row is read and a file's data is dropped from this
   device only when the server has that same file (by name) with its data. Rows the server does
   not have, settings and the recycle bin are never touched. The dropped entry keeps
   {name,type,size,offloaded:true} without `data` — the stub js/72 and the case page understand. */
(function () {
  'use strict';
  var S = window.IMODE_STORAGE;
  var NAMES = {
    imode_test_v532_cases: 'เคสงานบริการ + รูปที่ลูกค้าแนบ',
    imode_test_v532_line_requests: 'คำขอจากลูกค้า + รูป',
    imode_test_v532_quotes: 'ใบเสนอราคา + ไฟล์แนบ',
    imode_test_v532_service_reports: 'รายงานบริการ + ลายเซ็น',
    imode_v70_trash_blob: 'ถังขยะ (รายการที่ลบไว้)',
    imode_v5_settings: 'ตั้งค่าระบบ',
    imode_v66_qc_records: 'QC',
    imode_test_v532_machines: 'เครื่องจักร',
    imode_test_v532_customers: 'ลูกค้า',
    imode_test_v532_notifications: 'การแจ้งเตือน',
    imode_v67_petty_cash: 'เงินสดย่อย',
    imode_test_v532_machine_documents: 'เอกสารเครื่องจักร',
    imode_test_v532_warranties: 'ประกันเครื่อง'
  };
  var CLEAN = [
    { key: 'imode_test_v532_cases', table: 'service_cases', field: 'media' },
    { key: 'imode_test_v532_line_requests', table: 'line_customer_requests', field: 'media' },
    { key: 'imode_test_v532_quotes', table: 'quotations', field: 'attachments' }
  ];
  var CAN_CLEAN = {}; CLEAN.forEach(function (c) { CAN_CLEAN[c.key] = 1; });

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function mb(chars) { return (chars / 1048576).toFixed(2) + ' MB'; }
  function rows() {
    var out = [], total = 0;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i), n = k.length + (localStorage.getItem(k) || '').length;
        total += n; out.push({ key: k, chars: n });
      }
    } catch (e) {}
    out.sort(function (a, b) { return b.chars - a.chars; });
    return { total: total, rows: out };
  }
  function hasData(list) { return Array.isArray(list) && list.some(function (x) { return x && x.data; }); }
  function stub(x) {
    var o = {}; for (var p in x) if (Object.prototype.hasOwnProperty.call(x, p) && p !== 'data') o[p] = x[p];
    o.offloaded = true; return o;
  }

  /* resolves {freed, done:[...], skipped:[...]} */
  async function clean(client) {
    var res = { freed: 0, done: [], skipped: [] };
    for (var t = 0; t < CLEAN.length; t++) {
      var job = CLEAN[t], list;
      try { list = JSON.parse(localStorage.getItem(job.key) || 'null'); } catch (e) { list = null; }
      if (!Array.isArray(list)) continue;
      var heavy = list.filter(function (r) { return r && r.id && hasData(r[job.field]); });
      if (!heavy.length) continue;
      var server = {}, failed = false;
      for (var i = 0; i < heavy.length && !failed; i += 20) {
        var ids = heavy.slice(i, i + 20).map(function (r) { return r.id; });
        var r = await client.from(job.table).select('id,' + job.field).in('id', ids);
        if (!r || r.error) { failed = true; res.skipped.push(NAMES[job.key] + ' (อ่านจาก server ไม่ได้: ' + ((r && r.error && r.error.message) || 'ไม่ทราบสาเหตุ') + ')'); break; }
        (r.data || []).forEach(function (row) {
          var names = {}; (Array.isArray(row[job.field]) ? row[job.field] : []).forEach(function (x) { if (x && x.data && x.name) names[x.name] = 1; });
          server[row.id] = names;
        });
      }
      if (failed) continue;
      var before = (localStorage.getItem(job.key) || '').length, n = 0, kept = 0;
      var out = list.map(function (row) {
        if (!row || !hasData(row[job.field])) return row;
        var names = server[row.id];
        var c = null;
        row[job.field].forEach(function (x, j) {
          if (!x || !x.data) return;
          if (names && names[x.name]) { if (!c) { c = {}; for (var p in row) if (Object.prototype.hasOwnProperty.call(row, p)) c[p] = row[p]; c[job.field] = row[job.field].slice(); } c[job.field][j] = stub(x); n++; }
          else kept++;
        });
        return c || row;
      });
      if (n) {
        try { localStorage.setItem(job.key, JSON.stringify(out)); localStorage.setItem('imode_v70_storage_shed', '1'); } catch (e) {}
        var freed = Math.max(0, before - (localStorage.getItem(job.key) || '').length);
        res.freed += freed;
        res.done.push(NAMES[job.key] + ': ล้าง ' + n + ' ไฟล์ (' + mb(freed) + ')' + (kept ? ' · เก็บไว้ ' + kept + ' ไฟล์ที่ server ยังไม่มี' : ''));
      } else if (kept) res.done.push(NAMES[job.key] + ': เก็บไว้ทั้งหมด ' + kept + ' ไฟล์ (server ยังไม่มี)');
    }
    return res;
  }

  var panel = null;
  function close() { if (panel) { panel.remove(); panel = null; document.removeEventListener('keydown', key, true); } }
  function key(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }
  function render(note) {
    var r = rows(), big = r.rows.filter(function (x) { return x.chars >= 10240; }), top = big.slice(0, 8);
    var rest = r.rows.filter(function (x) { return top.indexOf(x) < 0; }).reduce(function (s, x) { return s + x.chars; }, 0);
    var pct = Math.min(100, Math.round(r.total / 5242880 * 100));
    var body = top.map(function (x) {
      var label = NAMES[x.key] || x.key;
      var tag = CAN_CLEAN[x.key] ? '<span class="sp-tag ok">ล้างได้เมื่อ server มีครบ</span>' : '<span class="sp-tag">เก็บไว้</span>';
      return '<tr><td>' + esc(label) + '</td><td class="sp-n">' + mb(x.chars) + '</td><td>' + tag + '</td></tr>';
    }).join('') + (rest ? '<tr><td>อื่น ๆ (การเข้าสู่ระบบ ค่าตั้งเล็ก ๆ)</td><td class="sp-n">' + mb(rest) + '</td><td><span class="sp-tag">เก็บไว้</span></td></tr>' : '');
    panel.querySelector('.sp-body').innerHTML =
      '<p>ใช้ไป <b>' + mb(r.total) + '</b> จากประมาณ 5 MB</p><div class="sp-bar"><i style="width:' + pct + '%"></i></div>'
      + '<div class="sp-scroll"><table>' + body + '</table></div>'
      + '<p class="sp-help">"ล้าง" จะถาม server ทีละรายการก่อน แล้วลบเฉพาะรูป/ไฟล์ในเครื่องที่ server มีครบแล้ว งานที่ยังไม่ได้ส่งขึ้น server ไม่ถูกแตะ ระบบเก่าและระบบใหม่ใช้ข้อมูลชุดเดียวกันในเครื่องนี้</p>'
      + (note ? '<div class="sp-note" role="status">' + note + '</div>' : '');
  }
  function open() {
    close();
    panel = document.createElement('div');
    panel.className = 'sp-shade';
    panel.innerHTML = '<div class="sp-card" role="dialog" aria-modal="true" aria-labelledby="spTitle"><h3 id="spTitle">ข้อมูลที่เก็บในเครื่องนี้</h3><div class="sp-body"></div>'
      + '<div class="sp-acts"><button type="button" class="sn-btn" data-sp="close">ปิด</button><button type="button" class="sn-btn p" data-sp="clean">ล้างสำเนาที่อยู่บน server แล้ว</button></div></div>';
    document.body.appendChild(panel);
    render('');
    document.addEventListener('keydown', key, true);
    panel.addEventListener('click', async function (e) {
      if (e.target === panel) return close();
      var b = e.target.closest('[data-sp]'); if (!b) return;
      if (b.getAttribute('data-sp') === 'close') return close();
      var client = null;
      try { client = window.ImodeAuth && window.ImodeAuth.client(); } catch (x) {}
      var s = window.ImodeAuth ? await window.ImodeAuth.currentSession() : null;
      if (!client || !s) { render('ต้องเข้าสู่ระบบก่อน ระบบถึงจะเช็คกับ server ได้'); return; }
      b.disabled = true; b.textContent = 'กำลังเช็คกับ server…';
      try {
        var res = await clean(client);
        var msg = res.done.length ? res.done.map(esc).join('<br>') : 'ไม่มีไฟล์ที่ล้างได้ (ในเครื่องไม่มีรูป/ไฟล์ที่ server มีครบแล้ว)';
        if (res.skipped.length) msg += '<br>' + res.skipped.map(esc).join('<br>');
        render('✓ ' + msg);
      } catch (x) { render('ล้างไม่สำเร็จ: ' + esc(x && x.message || x)); }
      b.disabled = false; b.textContent = 'ล้างสำเนาที่อยู่บน server แล้ว';
    });
    try { panel.querySelector('[data-sp=close]').focus(); } catch (e) {}
  }

  /* after a sign-in that kept the session for this tab only: say it once, calmly */
  function notice(box, go) {
    var shown = false;
    try { shown = sessionStorage.getItem('imode.storageNotice') === '1'; sessionStorage.setItem('imode.storageNotice', '1'); } catch (e) {}
    if (shown) return false;
    var mem = S && S.where === 'memory';
    box.className = 'storage-note';
    box.hidden = false;
    box.setAttribute('role', 'status');
    box.innerHTML = '<b>✓ เข้าสู่ระบบแล้ว</b>'
      + (mem ? 'พื้นที่เก็บข้อมูลในเบราว์เซอร์นี้เต็ม ระบบจำการเข้าสู่ระบบได้แค่หน้านี้ กด "ดูว่าอะไรใช้พื้นที่" แล้วล้างสำเนา จากนั้นเข้าสู่ระบบใหม่ ข้อมูลงานทั้งหมดอยู่บน server ไม่หาย'
             : 'พื้นที่เก็บข้อมูลในเบราว์เซอร์นี้เกือบเต็ม ระบบจะจำการเข้าสู่ระบบไว้จนกว่าจะปิดแท็บนี้ ข้อมูลงานทั้งหมดอยู่บน server ไม่หาย')
      + '<span class="storage-note-acts"><button type="button" class="sn-btn p" data-sn="go">ไปต่อ</button><button type="button" class="sn-btn" data-sn="look">ดูว่าอะไรใช้พื้นที่</button></span>';
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-sn]'); if (!b) return;
      if (b.getAttribute('data-sn') === 'go') go(); else open();
    });
    try { box.querySelector('[data-sn=go]').focus(); } catch (e) {}
    return true;
  }

  window.ImodeStoragePanel = { open: open, notice: notice, clean: clean, rows: rows };
})();
