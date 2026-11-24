/* I-MODE System (ระบบใหม่) · เอกสารเครื่องจักร (2026-11-25)
   ตาราง machine_documents (คอลัมน์ตรง ไม่ใช่ data jsonb): ลิงก์ (url) หรือไฟล์แนบ (file_data ≤ 3 MB)
   หมวดจาก ตั้งค่า → documentCategories · ?machine=<id> = กรองเฉพาะเครื่อง (ลิงก์จากหน้าเครื่องจักร) */
(async function () {
  'use strict';
  var esc = window.NextShell.esc, F = window.NextForm, M = window.MaCommon, $ = function (id) { return document.getElementById(id); };
  var api, D = [], mach = {}, machOpts = [], cats = [], cat = '', q = '', onlyM = new URLSearchParams(location.search).get('machine') || '';
  var COLS = 'id,title,category,machine_id,customer_id,version,language,doc_date,url,note,file_name,file_type,created_at,updated_at';
  function toast(t) { var el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove('on'); }, 2400); }
  function showErr(m) { $('err').innerHTML = m ? '<div class="nx-err" role="alert" style="margin-bottom:12px">' + esc(m) + '</div>' : ''; }
  function uid() { try { return 'doc-' + crypto.randomUUID(); } catch (e) { return 'doc-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); } }
  function day(v) { if (!v) return '-'; var d = new Date(String(v).slice(0, 10) + 'T00:00:00'); return isNaN(d) ? v : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }); }
  function mName(id) { var m = mach[id]; return m ? M.nameTh(m) + (M.sn(m) ? ' · S/N ' + M.sn(m) : '') : (id ? id : 'ทุกเครื่อง / ทั่วไป'); }

  function render() {
    var edit = api.can('machine.edit');
    $('acts').innerHTML = edit ? '<button type="button" class="nx-btn primary" id="add">＋ เพิ่มเอกสาร</button>' : '';
    var base = D.filter(function (d) { return !onlyM || d.machine_id === onlyM; });
    var used = cats.slice(); base.forEach(function (d) { if (d.category && used.indexOf(d.category) < 0) used.push(d.category); });
    $('chips').innerHTML = [['', 'ทุกหมวด', base.length]].concat(used.map(function (c) { return [c, c, base.filter(function (d) { return d.category === c; }).length]; })).map(function (c) { return '<button type="button" class="q-chip" data-k="' + esc(c[0]) + '" aria-pressed="' + (cat === c[0]) + '">' + esc(c[1]) + ' <b>' + c[2] + '</b></button>'; }).join('');
    $('cards').innerHTML = onlyM ? '<div class="nx-card q-card" style="grid-column:1/-1"><small>เฉพาะเครื่อง</small><b style="font-size:1rem">' + esc(mName(onlyM)) + '</b><a href="index.html" class="nx-btn" style="margin-top:6px;width:max-content">ดูทุกเครื่อง</a></div>' : '';
    var s = q.trim().toLowerCase();
    var rows = base.filter(function (d) { return (!cat || d.category === cat) && (!s || [d.title, d.category, d.version, d.file_name, d.note, mName(d.machine_id)].join(' ').toLowerCase().indexOf(s) >= 0); })
      .sort(function (a, b) { return String(b.doc_date || b.created_at || '').localeCompare(String(a.doc_date || a.created_at || '')); });
    $('thead').innerHTML = '<tr><th>เอกสาร</th><th>หมวด</th><th>เครื่อง</th><th>เวอร์ชัน</th><th>วันที่</th><th></th></tr>';
    $('rows').innerHTML = rows.map(function (d) {
      return '<tr data-id="' + esc(d.id) + '"><td><b>' + esc(d.title || d.file_name || 'เอกสาร') + '</b>' + (d.note ? '<div class="sub2">' + esc(d.note) + '</div>' : '') + '</td><td>' + esc(d.category || '-') + '</td><td>' + esc(mName(d.machine_id)) + '</td>' +
        '<td data-l="เวอร์ชัน">' + esc(d.version || '-') + (d.language ? ' · ' + esc(d.language) : '') + '</td><td data-l="วันที่">' + day(d.doc_date || d.created_at) + '</td>' +
        '<td><button type="button" class="nx-btn" data-open="' + esc(d.id) + '"' + (d.url || d.file_name ? '' : ' disabled') + '>' + (d.url ? '🔗 เปิด' : '📄 เปิด') + '</button></td></tr>';
    }).join('');
    $('empty').hidden = rows.length > 0; $('empty').textContent = base.length ? 'ไม่พบเอกสาร' : 'ยังไม่มีเอกสาร' + (edit ? ' กด "＋ เพิ่มเอกสาร"' : '');
    if ($('add')) $('add').onclick = function () { edit1(null); };
  }

  async function openDoc(d) {
    if (d.url) { window.open(d.url, '_blank', 'noopener'); return; }
    var r = await api.sb.from('machine_documents').select('file_data').eq('id', d.id).maybeSingle();
    if (r.error || !r.data || !r.data.file_data) { toast('เปิดไฟล์ไม่ได้'); return; }
    F.openData(r.data.file_data);
  }

  async function edit1(d) {
    if (!api.can('machine.edit')) { if (d) openDoc(d); return; }
    var opts = cats.slice(); if (d && d.category && opts.indexOf(d.category) < 0) opts.push(d.category);
    var r = await F.open({ title: d ? 'แก้ไขเอกสาร' : 'เพิ่มเอกสารเครื่องจักร', sub: 'ใส่ลิงก์ (Google Drive / OneDrive) หรือแนบไฟล์ PDF / รูป ไม่เกิน 3 MB', del: !!d, delConfirm: 'ลบเอกสาร "' + (d ? d.title : '') + '" ถาวร?',
      values: d ? Object.assign({}, d, { file: [] }) : { category: opts[0] || '', machine_id: onlyM, language: 'TH' },
      fields: [{ k: 'title', label: 'ชื่อเอกสาร', req: true, wide: true }, { k: 'category', label: 'หมวด', type: 'select', options: opts, empty: '— ไม่ระบุ —' }, { k: 'machine_id', label: 'เครื่อง', type: 'select', empty: 'ทุกเครื่อง / ทั่วไป', options: machOpts },
        { k: 'version', label: 'เวอร์ชัน / Rev.' }, { k: 'language', label: 'ภาษา', type: 'select', options: ['TH', 'EN', 'TH/EN', 'อื่นๆ'] }, { k: 'doc_date', label: 'วันที่เอกสาร', type: 'date' },
        { k: 'url', label: 'ลิงก์เอกสาร', hint: 'ถ้ามีลิงก์ ไม่ต้องแนบไฟล์', wide: true },
        { k: 'file', label: 'แนบไฟล์', type: 'files', max: 1, maxMB: 3, hint: d && d.file_name ? 'ไฟล์เดิม: ' + d.file_name + ' (แนบใหม่ = แทนที่)' : '' }, { k: 'note', label: 'หมายเหตุ', type: 'textarea' }],
      check: function (v) { if (v.url && !/^https:\/\//i.test(v.url)) return 'ลิงก์ต้องขึ้นต้นด้วย https://'; if (!v.url && !v.file.length && !(d && d.file_name)) return 'ใส่ลิงก์หรือแนบไฟล์อย่างใดอย่างหนึ่ง'; },
      save: async function (v) {
        var now = new Date().toISOString(), m = mach[v.machine_id];
        var rec = { id: d ? d.id : uid(), title: v.title, category: v.category || null, machine_id: v.machine_id || null, customer_id: m ? m.customerId || null : null, version: v.version || null, language: v.language || null, doc_date: v.doc_date || null, url: v.url || null, note: v.note || null, updated_at: now };
        if (!d) rec.created_at = now;
        if (v.file.length) { rec.file_name = v.file[0].name; rec.file_type = v.file[0].type; rec.file_data = v.file[0].data; }
        var e = await api.sb.from('machine_documents').upsert(rec); if (e.error) return 'บันทึกไม่ได้: ' + e.error.message;
        var row = Object.assign({}, d || {}, rec); delete row.file_data;
        if (d) D = D.map(function (x) { return x.id === row.id ? row : x; }); else D.unshift(row);
      } });
    if (r && r.__delete) { var x = await api.sb.from('machine_documents').delete().eq('id', d.id); if (x.error) return toast('ลบไม่ได้: ' + x.error.message); D = D.filter(function (y) { return y.id !== d.id; }); toast('ลบแล้ว'); }
    else if (r) toast('บันทึกแล้ว');
    render();
  }

  try { api = await window.NextShell.start({ title: 'เอกสารเครื่องจักร', moduleId: 'docs' }); } catch (e) { $('rows').innerHTML = ''; showErr(e.message); return; }
  $('q').placeholder = 'ค้นหาชื่อเอกสาร เครื่อง เวอร์ชัน';
  var res = await Promise.all([api.sb.from('machine_documents').select(COLS).limit(5000),
    api.sb.from('machines').select('id,name,nameTh,nameEn,model,serial,imodeSn,customerId').is('deleted_at', null).limit(10000),
    api.sb.from('system_settings').select('data').eq('id', 'main').maybeSingle()]);
  if (res[0].error) { $('rows').innerHTML = ''; showErr('โหลดเอกสารไม่ได้: ' + res[0].error.message); return; }
  D = res[0].data || [];
  (res[1].data || []).forEach(function (m) { mach[m.id] = m; machOpts.push([m.id, M.nameTh(m) + ' · ' + (m.model || '-') + ' · S/N ' + (M.sn(m) || '-')]); });
  var dc = res[2].data && res[2].data.data && res[2].data.data.documentCategories;
  cats = (Array.isArray(dc) ? dc : []).map(function (c) { return typeof c === 'string' ? c : (c && (c.name || c.label)) || ''; }).filter(Boolean);
  if (!cats.length) cats = ['Operating Manual', 'PM Checklist', 'Parts List', 'Drawing', 'Certificate'];
  render();
  $('chips').addEventListener('click', function (e) { var b = e.target.closest('[data-k]'); if (!b) return; cat = b.getAttribute('data-k'); render(); });
  $('q').addEventListener('input', function () { q = this.value; render(); });
  $('rows').addEventListener('click', function (e) {
    var o = e.target.closest('[data-open]'); if (o) { e.stopPropagation(); openDoc(D.filter(function (x) { return x.id === o.getAttribute('data-open'); })[0]); return; }
    var a = e.target.closest('[data-id]'); if (a) edit1(D.filter(function (x) { return x.id === a.getAttribute('data-id'); })[0]);
  });
})();
