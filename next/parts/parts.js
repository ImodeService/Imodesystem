/* I-MODE System (ระบบใหม่) · สต็อกอะไหล่ + ใบสั่งซื้อ (2026-11-25)
   ตาราง spare_parts / purchase_orders เดิม: แถว {id, data, updated_at} ข้อมูลอยู่ใน data (รูปแบบเดียวกับระบบเดิม)
   สถานะสต็อก: เกินค่าสูงสุด / ต่ำกว่าขั้นต่ำ / ถึงจุดสั่งซื้อ / ปกติ
   รับของเข้า (PO เป็น "รับเข้าแล้ว") เพิ่มสต็อกตามส่วนต่างจากสถานะเดิม (บันทึกซ้ำไม่บวกซ้ำ เหมือนระบบเดิม) */
(async function () {
  'use strict';
  var esc = window.NextShell.esc, F = window.NextForm, M = window.MaCommon, $ = function (id) { return document.getElementById(id); };
  var api, P = [], PO = [], mach = {}, machOpts = [], view = 'parts', st = '', q = '';
  try { if (localStorage.getItem('imode.parts.tab') === 'po') view = 'po'; } catch (e) {}
  var PO_ST = ['รออนุมัติ', 'สั่งซื้อแล้ว', 'รับเข้าแล้ว', 'ยกเลิก'];
  function toast(t) { var el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove('on'); }, 2400); }
  function showErr(m) { $('err').innerHTML = m ? '<div class="nx-err" role="alert" style="margin-bottom:12px">' + esc(m) + '</div>' : ''; }
  function uid() { try { return crypto.randomUUID(); } catch (e) { return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); } }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function day(v) { if (!v) return '-'; var d = new Date(String(v).slice(0, 10) + 'T00:00:00'); return isNaN(d) ? v : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }); }
  function money(n) { return (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function stock(p) {
    var qty = +p.currentQty || 0, min = +p.minQty || 0, max = +p.maxQty || 0, ro = +p.reorderPoint || min;
    if (max && qty > max) return ['high', 'เกินค่าสูงสุด', 'sent']; if (qty <= min) return ['low', 'ต่ำกว่าขั้นต่ำ', 'no']; if (qty <= ro) return ['reorder', 'ถึงจุดสั่งซื้อ', 'sent']; return ['normal', 'ปกติ', 'ok'];
  }
  function poCls(s) { return s === 'รับเข้าแล้ว' ? 'ok' : s === 'ยกเลิก' ? 'no' : s === 'สั่งซื้อแล้ว' ? 'sent' : ''; }
  function nextNo(list, key, pre) { var d = new Date(), ym = d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2), max = 0, re = new RegExp(pre + '-' + ym + '-(\\d+)'); list.forEach(function (x) { var m = String(x[key] || '').match(re); if (m) max = Math.max(max, +m[1]); }); return pre + '-' + ym + '-' + ('00' + (max + 1)).slice(-3); }
  async function put(table, rec) { var r = await api.sb.from(table).upsert({ id: rec.id, data: rec, updated_at: new Date().toISOString() }); return r.error ? r.error.message : null; }

  function render() {
    $('tabs').hidden = false;
    $('tabs').innerHTML = [['parts', 'อะไหล่', P.length], ['po', 'ใบสั่งซื้อ', PO.length]].map(function (t) { return '<button type="button" role="tab" data-v="' + t[0] + '" aria-selected="' + (view === t[0]) + '">' + t[1] + ' <b>' + t[2] + '</b></button>'; }).join('');
    var edit = api.can('service.edit');
    $('acts').innerHTML = (edit ? '<button type="button" class="nx-btn primary" id="add">＋ ' + (view === 'parts' ? 'เพิ่มอะไหล่' : 'สร้างใบสั่งซื้อ') + '</button>' : '') + '<button type="button" class="nx-btn" id="csv">⬇ CSV</button>';
    var s = q.trim().toLowerCase(), rows;
    if (view === 'parts') {
      var cnt = { low: 0, reorder: 0, high: 0 }; P.forEach(function (p) { var k = stock(p)[0]; if (cnt[k] != null) cnt[k]++; });
      cards([['', 'อะไหล่ทั้งหมด', P.length], ['low', 'ต่ำกว่าขั้นต่ำ', cnt.low], ['reorder', 'ถึงจุดสั่งซื้อ', cnt.reorder], ['high', 'เกินค่าสูงสุด', cnt.high]]);
      rows = P.filter(function (p) { return (!st || stock(p)[0] === st) && (!s || [p.partNo, p.name, p.supplier, p.modelTags, p.location].join(' ').toLowerCase().indexOf(s) >= 0); }).sort(function (a, b) { return String(a.partNo).localeCompare(String(b.partNo)); });
      $('thead').innerHTML = '<tr><th>อะไหล่</th><th>คงเหลือ</th><th>ขั้นต่ำ / สูงสุด</th><th>ที่เก็บ</th><th>ใช้กับเครื่อง</th><th>สถานะ</th></tr>';
      $('rows').innerHTML = rows.map(function (p) {
        var k = stock(p), ms = (p.machineIds || []).map(function (id) { return mach[id] ? M.nameTh(mach[id]) : ''; }).filter(Boolean);
        return '<tr data-p="' + esc(p.id) + '"><td><b>' + esc(p.partNo) + '</b> ' + esc(p.name) + (p.supplier ? '<div class="sub2">' + esc(p.supplier) + '</div>' : '') + '</td><td data-l="คงเหลือ"><b>' + (+p.currentQty || 0) + '</b> ' + esc(p.unit || 'ชิ้น') + '</td>' +
          '<td data-l="ขั้นต่ำ/สูงสุด">' + (+p.minQty || 0) + ' / ' + (+p.maxQty || '-') + '</td><td>' + esc(p.location || '-') + '</td><td>' + (ms.length ? esc(ms.slice(0, 2).join(', ')) + (ms.length > 2 ? ' +' + (ms.length - 2) : '') : '-') + '</td><td><span class="st ' + k[2] + '">' + k[1] + '</span></td></tr>';
      }).join('');
    } else {
      var open = PO.filter(function (x) { return x.status === 'รออนุมัติ' || x.status === 'สั่งซื้อแล้ว'; });
      cards([['', 'ใบสั่งซื้อทั้งหมด', PO.length], ['รออนุมัติ', 'รออนุมัติ', PO.filter(function (x) { return x.status === 'รออนุมัติ'; }).length], ['สั่งซื้อแล้ว', 'สั่งซื้อแล้ว (รอของ)', PO.filter(function (x) { return x.status === 'สั่งซื้อแล้ว'; }).length], ['รับเข้าแล้ว', 'รับเข้าแล้ว', PO.filter(function (x) { return x.status === 'รับเข้าแล้ว'; }).length]]);
      rows = PO.filter(function (x) { return (!st || x.status === st) && (!s || [x.poNo, x.partName, x.supplier, x.note].join(' ').toLowerCase().indexOf(s) >= 0); }).sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
      $('thead').innerHTML = '<tr><th>เลขที่</th><th>อะไหล่</th><th>จำนวน</th><th>มูลค่า</th><th>กำหนดรับ</th><th>สถานะ</th></tr>';
      $('rows').innerHTML = rows.map(function (x) {
        return '<tr data-o="' + esc(x.id) + '"><td><b>' + esc(x.poNo) + '</b><div class="sub2">' + day(x.date) + (x.supplier ? ' · ' + esc(x.supplier) : '') + '</div></td><td>' + esc(x.partName || '-') + '</td><td data-l="จำนวน">' + (+x.qty || 0) + '</td><td data-l="มูลค่า">฿' + money((+x.qty || 0) * (+x.unitCost || 0)) + '</td><td data-l="กำหนดรับ">' + day(x.expectedDate) + '</td><td><span class="st ' + poCls(x.status) + '">' + esc(x.status || '-') + '</span></td></tr>';
      }).join('');
      void open;
    }
    $('empty').hidden = rows.length > 0; $('empty').textContent = (view === 'parts' ? P : PO).length ? 'ไม่พบรายการ' : (view === 'parts' ? 'ยังไม่มีอะไหล่ในระบบ กด "＋ เพิ่มอะไหล่"' : 'ยังไม่มีใบสั่งซื้อ');
    if ($('add')) $('add').onclick = function () { view === 'parts' ? editPart(null) : editPO(null); };
    $('csv').onclick = exportCsv;
  }
  function cards(K) { $('cards').innerHTML = K.map(function (c) { return '<button type="button" class="nx-card q-card" data-c="' + esc(c[0]) + '" aria-pressed="' + (st === c[0]) + '"><small>' + esc(c[1]) + '</small><b>' + c[2] + '</b></button>'; }).join(''); }

  async function editPart(p) {
    var r = await F.open({ title: p ? 'แก้ไขอะไหล่' : 'เพิ่มอะไหล่', sub: 'กำหนดขั้นต่ำ/สูงสุดเพื่อแจ้งเตือนสั่งซื้อ', values: p || { unit: 'ชิ้น' }, del: !!p, delConfirm: 'ลบอะไหล่ ' + (p ? p.partNo : '') + ' ถาวร?',
      fields: [{ k: 'partNo', label: 'Part No.', req: true }, { k: 'name', label: 'ชื่ออะไหล่', req: true }, { k: 'supplier', label: 'Supplier' }, { k: 'unit', label: 'หน่วย' },
        { k: 'currentQty', label: 'คงเหลือ', type: 'number' }, { k: 'location', label: 'ที่เก็บ' }, { k: 'minQty', label: 'ขั้นต่ำ', type: 'number' }, { k: 'maxQty', label: 'สูงสุด', type: 'number' },
        { k: 'reorderPoint', label: 'จุดสั่งซื้อ', type: 'number', hint: 'ว่าง = เท่ากับขั้นต่ำ' }, { k: 'leadTimeDays', label: 'ระยะรอของ (วัน)', type: 'number' },
        { k: 'modelTags', label: 'รุ่นที่ใช้ (คำค้น)', wide: true }, { k: 'machineIds', label: 'ใช้กับเครื่อง', type: 'machines', options: machOpts }, { k: 'note', label: 'หมายเหตุ', type: 'textarea' }],
      save: async function (v) {
        var now = new Date().toISOString(), rec = Object.assign({}, p || {}, v, { id: p ? p.id : uid(), createdAt: p ? p.createdAt : now, updatedAt: now });
        rec.unit = rec.unit || 'ชิ้น'; if (!rec.reorderPoint) rec.reorderPoint = rec.minQty;
        var e = await put('spare_parts', rec); if (e) return 'บันทึกไม่ได้: ' + e;
        if (p) P = P.map(function (x) { return x.id === rec.id ? rec : x; }); else P.unshift(rec);
      } });
    if (r && r.__delete) { var d = await api.sb.from('spare_parts').delete().eq('id', p.id); if (d.error) return toast('ลบไม่ได้: ' + d.error.message); P = P.filter(function (x) { return x.id !== p.id; }); toast('ลบแล้ว'); }
    else if (r) toast('บันทึกแล้ว');
    render();
  }
  async function editPO(o, partPreset) {
    if (!P.length) { toast('ต้องเพิ่มอะไหล่ก่อน'); return; }
    var r = await F.open({ title: o ? 'แก้ไขใบสั่งซื้อ ' + o.poNo : 'สร้างใบสั่งซื้ออะไหล่', values: o || { poNo: nextNo(PO, 'poNo', 'PO'), date: today(), status: 'รออนุมัติ', partId: partPreset || '' }, del: !!o,
      delConfirm: 'ลบใบสั่งซื้อนี้ถาวร? (สต็อกที่รับเข้าแล้วจะไม่ถูกหักคืน)',
      fields: [{ k: 'poNo', label: 'เลขที่', ro: true }, { k: 'date', label: 'วันที่', type: 'date' }, { k: 'partId', label: 'อะไหล่', type: 'select', req: true, empty: '— เลือกอะไหล่ —', options: P.map(function (p) { return [p.id, p.partNo + ' · ' + p.name]; }), wide: true },
        { k: 'supplier', label: 'Supplier' }, { k: 'qty', label: 'จำนวน', type: 'number', req: true }, { k: 'unitCost', label: 'ราคาต่อหน่วย', type: 'number' }, { k: 'expectedDate', label: 'กำหนดรับของ', type: 'date' },
        { k: 'status', label: 'สถานะ', type: 'select', options: PO_ST, hint: 'เปลี่ยนเป็น "รับเข้าแล้ว" = เพิ่มสต็อกให้อัตโนมัติ' }, { k: 'note', label: 'หมายเหตุ', type: 'textarea' }],
      save: async function (v) {
        var now = new Date().toISOString(), part = P.filter(function (p) { return p.id === v.partId; })[0] || {};
        var rec = Object.assign({}, o || {}, v, { id: o ? o.id : uid(), partName: part.name || '', createdAt: o ? o.createdAt : now, updatedAt: now });
        if (!rec.supplier && part.supplier) rec.supplier = part.supplier;
        var wasIn = o && o.status === 'รับเข้าแล้ว', isIn = rec.status === 'รับเข้าแล้ว', oq = o ? +o.qty || 0 : 0, nq = +rec.qty || 0;
        var delta = (!wasIn && isIn) ? nq : (wasIn && !isIn) ? -oq : (wasIn && isIn) ? nq - oq : 0;
        var e = await put('purchase_orders', rec); if (e) return 'บันทึกไม่ได้: ' + e;
        if (delta && part.id) { var np = Object.assign({}, part, { currentQty: (+part.currentQty || 0) + delta, updatedAt: now }); var e2 = await put('spare_parts', np); if (e2) toast('บันทึก PO แล้ว แต่ปรับสต็อกไม่ได้: ' + e2); else P = P.map(function (x) { return x.id === np.id ? np : x; }); }
        if (o) PO = PO.map(function (x) { return x.id === rec.id ? rec : x; }); else PO.unshift(rec);
      } });
    if (r && r.__delete) { var d = await api.sb.from('purchase_orders').delete().eq('id', o.id); if (d.error) return toast('ลบไม่ได้: ' + d.error.message); PO = PO.filter(function (x) { return x.id !== o.id; }); toast('ลบแล้ว'); }
    else if (r) toast('บันทึกแล้ว');
    render();
  }
  function exportCsv() {
    if (view === 'parts') F.csv('I-MODE_Spare_Parts_' + today() + '.csv', [['Part No', 'Name', 'Supplier', 'Qty', 'Unit', 'Min', 'Max', 'Reorder Point', 'Status', 'Location', 'Machines', 'Model Tags']].concat(P.map(function (p) { return [p.partNo, p.name, p.supplier, p.currentQty, p.unit, p.minQty, p.maxQty, p.reorderPoint, stock(p)[1], p.location, (p.machineIds || []).map(function (id) { return mach[id] ? M.nameTh(mach[id]) : ''; }).join(' | '), p.modelTags]; })));
    else F.csv('I-MODE_Purchase_Orders_' + today() + '.csv', [['PO No', 'Date', 'Part', 'Supplier', 'Qty', 'Unit Cost', 'Total', 'Expected', 'Status', 'Note']].concat(PO.map(function (x) { return [x.poNo, x.date, x.partName, x.supplier, x.qty, x.unitCost, (+x.qty || 0) * (+x.unitCost || 0), x.expectedDate, x.status, x.note]; })));
  }

  try { api = await window.NextShell.start({ title: 'สต็อกอะไหล่', moduleId: 'stock' }); } catch (e) { $('rows').innerHTML = ''; showErr(e.message); return; }
  $('q').placeholder = 'ค้นหา Part No. ชื่อ Supplier';
  var res = await Promise.all([api.sb.from('spare_parts').select('id,data').limit(5000), api.sb.from('purchase_orders').select('id,data').limit(5000),
    api.sb.from('machines').select('id,name,nameTh,nameEn,model,serial,imodeSn,customerId').is('deleted_at', null).limit(10000)]);
  if (res[0].error) { $('rows').innerHTML = ''; showErr('โหลดอะไหล่ไม่ได้: ' + res[0].error.message); return; }
  P = (res[0].data || []).map(function (r) { return Object.assign({ id: r.id }, r.data || {}); });
  PO = (res[1].data || []).map(function (r) { return Object.assign({ id: r.id }, r.data || {}); });
  (res[2].data || []).forEach(function (m) { mach[m.id] = m; machOpts.push([m.id, M.nameTh(m) + ' · ' + (m.model || '-') + ' · S/N ' + (M.sn(m) || '-')]); });
  render();
  $('tabs').addEventListener('click', function (e) { var b = e.target.closest('[data-v]'); if (!b) return; view = b.getAttribute('data-v'); st = ''; try { localStorage.setItem('imode.parts.tab', view); } catch (x) {} render(); });
  $('cards').addEventListener('click', function (e) { var b = e.target.closest('[data-c]'); if (!b) return; st = b.getAttribute('data-c'); render(); });
  $('q').addEventListener('input', function () { q = this.value; render(); });
  $('rows').addEventListener('click', function (e) {
    var a = e.target.closest('[data-p]'), b = e.target.closest('[data-o]'); if (!api.can('service.edit')) return;
    if (a) editPart(P.filter(function (x) { return x.id === a.getAttribute('data-p'); })[0]);
    if (b) editPO(PO.filter(function (x) { return x.id === b.getAttribute('data-o'); })[0]);
  });
})();
