/* I-MODE System (ระบบใหม่) · ตัวช่วยฟอร์มป๊อปอัป + ตาราง + ไฟล์ (2026-11-25)
   NextForm.open({ title, fields, values, okLabel, extra }) → Promise(ค่าที่กรอก | null)
     view: true = ไม่มีปุ่มยกเลิก (หน้าต่างดูอย่างเดียว)
     field: { k, label, type: text|number|date|textarea|select|files|check|machines, options, req, wide, hint, max (files), ro }
   NextForm.csv(name, rows) ดาวน์โหลด CSV (Excel อ่านภาษาไทยได้)
   NextForm.files(input, max, maxMB) → [{name,type,data}] รูปย่อเหลือ 1280px
   NextForm.openData(dataUrl) เปิดไฟล์ data: ในแท็บใหม่ */
(function () {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function shrink(f) {
    return new Promise(function (ok, bad) {
      var fr = new FileReader();
      fr.onload = function () {
        if (!/^image\//.test(f.type) || /gif|svg/.test(f.type)) return ok({ name: f.name, type: f.type, data: fr.result });
        var im = new Image();
        im.onload = function () { var s = Math.min(1, 1280 / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); ok({ name: f.name.replace(/\.[^.]+$/, '') + '.jpg', type: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.75) }); };
        im.onerror = bad; im.src = fr.result;
      };
      fr.onerror = bad; fr.readAsDataURL(f);
    });
  }
  async function files(input, max, maxMB) {
    var out = [], fs = Array.prototype.slice.call(input.files || []);
    for (var i = 0; i < fs.length && out.length < (max || 6); i++) {
      if (maxMB && fs[i].size > maxMB * 1048576 && !/^image\//.test(fs[i].type)) { alert('ไฟล์ ' + fs[i].name + ' ใหญ่เกิน ' + maxMB + ' MB'); continue; }
      try { out.push(await shrink(fs[i])); } catch (e) {}
    }
    input.value = ''; return out;
  }
  function openData(d) {
    if (!d) return;
    if (/^https:\/\//.test(d)) { window.open(d, '_blank', 'noopener'); return; }
    try { var p = d.split(','), mime = (p[0].match(/data:([^;]+)/) || [])[1] || 'application/octet-stream', bin = atob(p[1]), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); window.open(URL.createObjectURL(new Blob([a], { type: mime })), '_blank'); } catch (e) { alert('เปิดไฟล์ไม่ได้'); }
  }
  function csv(name, rows) {
    var t = rows.map(function (r) { return r.map(function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + t], { type: 'text/csv;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  function fieldHTML(f, v) {
    var id = 'nf_' + f.k, ro = f.ro ? ' readonly' : '', req = f.req ? ' required' : '';
    var lab = esc(f.label) + (f.req ? ' *' : '');
    if (f.type === 'check') return '<label class="cu-f nf-chk' + (f.wide ? ' nf-wide' : '') + '"><span><input type="checkbox" id="' + id + '"' + (v ? ' checked' : '') + '> ' + esc(f.label) + '</span></label>';
    var inp;
    if (f.type === 'textarea') inp = '<textarea id="' + id + '" rows="' + (f.rows || 2) + '"' + ro + req + '>' + esc(v) + '</textarea>';
    else if (f.type === 'select') inp = '<select id="' + id + '"' + req + '>' + (f.empty != null ? '<option value="">' + esc(f.empty) + '</option>' : '') + (f.options || []).map(function (o) { var val = Array.isArray(o) ? o[0] : o, t = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(val) + '"' + (String(val) === String(v == null ? '' : v) ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select>';
    else if (f.type === 'files') inp = '<div class="nf-files" id="' + id + '"></div><label class="nx-btn nf-add">＋ แนบไฟล์<input type="file" id="' + id + '_in" accept="' + esc(f.accept || 'image/*,application/pdf') + '" multiple hidden></label>';
    else if (f.type === 'machines') inp = '<input type="search" class="nf-msearch" id="' + id + '_q" placeholder="ค้นหาเครื่อง / S/N" autocomplete="off"><div class="nf-mlist" id="' + id + '"></div>';
    else inp = '<input id="' + id + '" type="' + (f.type === 'number' ? 'number" step="any" inputmode="decimal' : f.type === 'date' ? 'date' : 'text') + '" value="' + esc(v) + '" autocomplete="off"' + ro + req + '>';
    return '<label class="cu-f' + (f.wide || f.type === 'textarea' || f.type === 'files' || f.type === 'machines' ? ' nf-wide' : '') + '"><span>' + lab + '</span>' + inp + (f.hint ? '<small>' + esc(f.hint) + '</small>' : '') + '</label>';
  }
  function open(o) {
    var old = document.getElementById('nfDlg'); if (old) old.remove();
    var d = document.createElement('dialog'); d.id = 'nfDlg'; d.className = 'cu-dlg nf-dlg';
    var vals = o.values || {}, state = {};
    d.innerHTML = '<form method="dialog" id="nfFrm"><h2>' + esc(o.title) + '</h2>' + (o.sub ? '<p class="nf-sub">' + esc(o.sub) + '</p>' : '') +
      '<div class="nf-grid">' + o.fields.map(function (f) { return fieldHTML(f, vals[f.k] == null ? (f.def == null ? '' : f.def) : vals[f.k]); }).join('') + '</div>' +
      (o.extra || '') + '<p id="nfErr" class="cu-err" hidden></p><div class="cu-dbtn">' + (o.del ? '<button type="button" class="nx-btn nf-del" id="nfDel">ลบ</button>' : '') +
      (o.view ? '' : '<button value="cancel" class="nx-btn" formnovalidate>ยกเลิก</button>') + '<button value="ok" class="nx-btn primary" id="nfOk">' + esc(o.okLabel || 'บันทึก') + '</button></div></form>';
    document.body.appendChild(d);
    return new Promise(function (done) {
      o.fields.forEach(function (f) {
        if (f.type === 'files') {
          state[f.k] = (vals[f.k] || []).slice();
          var box = document.getElementById('nf_' + f.k), draw = function () {
            box.innerHTML = state[f.k].map(function (x, i) { var img = /^data:image\//.test(x.data || ''); return '<span class="nf-file">' + (img ? '<img src="' + esc(x.data) + '" alt="">' : '<b>' + esc(String(x.name || 'ไฟล์').split('.').pop().toUpperCase()) + '</b>') + '<small>' + esc(x.name || 'ไฟล์ ' + (i + 1)) + '</small><button type="button" data-rm="' + i + '" aria-label="ลบไฟล์">✕</button></span>'; }).join('') || '<small class="nf-none">ยังไม่มีไฟล์</small>';
            box.querySelectorAll('[data-rm]').forEach(function (b) { b.onclick = function () { state[f.k].splice(+b.dataset.rm, 1); draw(); }; });
            box.querySelectorAll('img').forEach(function (im, i) { im.onclick = function () { openData(state[f.k][i].data); }; });
          };
          draw();
          document.getElementById('nf_' + f.k + '_in').onchange = async function () { var add = await files(this, (f.max || 6) - state[f.k].length, f.maxMB || 3); state[f.k] = state[f.k].concat(add); draw(); };
        }
        if (f.type === 'machines') {
          state[f.k] = (vals[f.k] || []).slice();
          var list = document.getElementById('nf_' + f.k), q = document.getElementById('nf_' + f.k + '_q');
          var drawM = function () {
            var s = q.value.trim().toLowerCase(), all = f.options || [];
            var pick = all.filter(function (m) { return state[f.k].indexOf(m[0]) >= 0; }), rest = all.filter(function (m) { return state[f.k].indexOf(m[0]) < 0 && (!s || m[1].toLowerCase().indexOf(s) >= 0); }).slice(0, s ? 40 : 8);
            list.innerHTML = pick.concat(rest).map(function (m) { return '<label class="nf-m"><input type="checkbox" value="' + esc(m[0]) + '"' + (state[f.k].indexOf(m[0]) >= 0 ? ' checked' : '') + '> ' + esc(m[1]) + '</label>'; }).join('') || '<small class="nf-none">ไม่พบเครื่อง</small>';
            list.querySelectorAll('input').forEach(function (c) { c.onchange = function () { var i = state[f.k].indexOf(c.value); if (c.checked && i < 0) state[f.k].push(c.value); if (!c.checked && i >= 0) state[f.k].splice(i, 1); }; });
          };
          q.oninput = drawM; drawM();
        }
      });
      var frm = document.getElementById('nfFrm'), err = document.getElementById('nfErr');
      if (o.del) document.getElementById('nfDel').onclick = async function () { if (!confirm(o.delConfirm || 'ลบรายการนี้?')) return; d.close(); d.remove(); done({ __delete: true }); };
      frm.addEventListener('submit', async function (e) {
        if (e.submitter && e.submitter.value === 'cancel') { d.close(); d.remove(); done(null); return; }
        e.preventDefault();
        var out = {};
        o.fields.forEach(function (f) {
          var el = document.getElementById('nf_' + f.k);
          if (f.type === 'files' || f.type === 'machines') out[f.k] = state[f.k];
          else if (f.type === 'check') out[f.k] = el.checked;
          else if (f.type === 'number') out[f.k] = el.value === '' ? 0 : Number(el.value);
          else out[f.k] = el.value.trim();
        });
        var miss = o.fields.filter(function (f) { return f.req && (out[f.k] === '' || out[f.k] == null || (f.type === 'number' && !out[f.k])); });
        if (miss.length) { err.textContent = 'กรุณากรอก ' + miss.map(function (f) { return f.label; }).join(', '); err.hidden = false; return; }
        if (o.check) { var m = o.check(out); if (m) { err.textContent = m; err.hidden = false; return; } }
        if (o.save) {
          document.getElementById('nfOk').disabled = true;
          var r; try { r = await o.save(out); } catch (x) { r = x.message || 'บันทึกไม่ได้'; }
          document.getElementById('nfOk').disabled = false;
          if (typeof r === 'string') { err.textContent = r; err.hidden = false; return; }
        }
        d.close(); d.remove(); done(out);
      });
      d.addEventListener('cancel', function () { setTimeout(function () { if (d.isConnected) { d.remove(); done(null); } }); });
      d.showModal();
    });
  }
  window.NextForm = { open: open, csv: csv, files: files, openData: openData, esc: esc };
})();
