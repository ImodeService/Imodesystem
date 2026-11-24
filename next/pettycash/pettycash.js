/* I-MODE System (ระบบใหม่) · เงินสดย่อย (2026-11-25)
   ตาราง petty_cash เดิม: แถว {id, data, updated_at} รูปแบบเดียวกับระบบเดิม
   docNo PC-YYYYMM-NNN · สถานะ รอเคลียร์ / เคลียร์แล้ว / ยกเลิก · ใบเสร็จสูงสุด 6 ไฟล์ · ส่งออก CSV ทีละเดือน */
(async function () {
  'use strict';
  var esc = window.NextShell.esc, F = window.NextForm, $ = function (id) { return document.getElementById(id); };
  var api, R = [], st = '', q = '', month = '';
  var CATS = ['อะไหล่', 'วัสดุสิ้นเปลือง', 'อุปกรณ์ช่าง', 'ขนส่ง/จัดส่ง', 'อื่นๆ'], STS = ['รอเคลียร์', 'เคลียร์แล้ว', 'ยกเลิก'];
  function toast(t) { var el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove('on'); }, 2400); }
  function showErr(m) { $('err').innerHTML = m ? '<div class="nx-err" role="alert" style="margin-bottom:12px">' + esc(m) + '</div>' : ''; }
  function uid() { try { return crypto.randomUUID(); } catch (e) { return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); } }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function day(v) { if (!v) return '-'; var d = new Date(String(v).slice(0, 10) + 'T00:00:00'); return isNaN(d) ? v : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }); }
  function money(n) { return (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function cls(s) { return s === 'เคลียร์แล้ว' ? 'ok' : s === 'ยกเลิก' ? 'no' : 'sent'; }
  function nextNo(date) { var ym = String(date || today()).slice(0, 7).replace('-', ''), max = 0, re = new RegExp('PC-' + ym + '-(\\d+)'); R.forEach(function (x) { var m = String(x.docNo || '').match(re); if (m) max = Math.max(max, +m[1]); }); return 'PC-' + ym + '-' + ('00' + (max + 1)).slice(-3); }
  async function put(rec) { var r = await api.sb.from('petty_cash').upsert({ id: rec.id, data: rec, updated_at: new Date().toISOString() }); return r.error ? r.error.message : null; }
  function inMonth(x) { return !month || String(x.date || '').slice(0, 7) === month; }

  function render() {
    var edit = api.can('service.edit');
    $('acts').innerHTML = '<input type="month" id="mon" class="nf-mon" value="' + esc(month) + '" aria-label="เดือน">' + (edit ? '<button type="button" class="nx-btn primary" id="add">＋ เบิกเงินสดย่อย</button>' : '') + '<button type="button" class="nx-btn" id="csv">⬇ CSV เดือนนี้</button>';
    var M = R.filter(inMonth), sum = function (L) { return L.reduce(function (a, x) { return a + (+x.amount || 0); }, 0); };
    var by = function (s) { return M.filter(function (x) { return x.status === s; }); };
    $('cards').innerHTML = [['', 'ทั้งเดือน', M.length, sum(M.filter(function (x) { return x.status !== 'ยกเลิก'; }))], ['รอเคลียร์', 'รอเคลียร์', by('รอเคลียร์').length, sum(by('รอเคลียร์'))], ['เคลียร์แล้ว', 'เคลียร์แล้ว', by('เคลียร์แล้ว').length, sum(by('เคลียร์แล้ว'))], ['ยกเลิก', 'ยกเลิก', by('ยกเลิก').length, null]].map(function (c) {
      return '<button type="button" class="nx-card q-card" data-c="' + esc(c[0]) + '" aria-pressed="' + (st === c[0]) + '"><small>' + esc(c[1]) + '</small><b>' + c[2] + '</b>' + (c[3] != null ? '<small>฿' + money(c[3]) + '</small>' : '') + '</button>';
    }).join('');
    var s = q.trim().toLowerCase();
    var rows = M.filter(function (x) { return (!st || x.status === st) && (!s || [x.docNo, x.requester, x.category, x.purpose, x.vendor, x.reference, x.note].join(' ').toLowerCase().indexOf(s) >= 0); }).sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')) || String(b.docNo).localeCompare(String(a.docNo)); });
    $('thead').innerHTML = '<tr><th>เลขที่</th><th>ผู้เบิก</th><th>รายการ</th><th>จำนวนเงิน</th><th>ใบเสร็จ</th><th>สถานะ</th></tr>';
    $('rows').innerHTML = rows.map(function (x) {
      return '<tr data-id="' + esc(x.id) + '"><td><b>' + esc(x.docNo) + '</b><div class="sub2">' + day(x.date) + '</div></td><td>' + esc(x.requester || '-') + '</td><td>' + esc(x.purpose || '-') + '<div class="sub2">' + esc(x.category || '') + (x.vendor ? ' · ' + esc(x.vendor) : '') + '</div></td>' +
        '<td data-l="จำนวนเงิน"><b>฿' + money(x.amount) + '</b></td><td data-l="ใบเสร็จ">' + ((x.receipts || []).length ? '📎 ' + x.receipts.length : '-') + '</td><td><span class="st ' + cls(x.status) + '">' + esc(x.status || '-') + '</span></td></tr>';
    }).join('');
    $('empty').hidden = rows.length > 0; $('empty').textContent = M.length ? 'ไม่พบรายการ' : 'ยังไม่มีรายการในเดือนนี้';
    if ($('add')) $('add').onclick = function () { edit1(null); };
    $('csv').onclick = exportCsv;
    $('mon').onchange = function () { month = this.value; st = ''; render(); };
  }

  async function edit1(x) {
    var can = api.can('service.edit');
    var r = await F.open({ title: x ? 'เงินสดย่อย ' + x.docNo : 'เบิกเงินสดย่อย', sub: can ? 'แนบใบเสร็จได้สูงสุด 6 ไฟล์ (รูปย่ออัตโนมัติ, PDF ไม่เกิน 3 MB)' : 'ดูอย่างเดียว',
      values: x || { date: today(), requester: api.user.name || api.user.username, category: CATS[0], status: 'รอเคลียร์' }, del: !!x && can, delConfirm: 'ลบรายการ ' + (x ? x.docNo : '') + ' ถาวร?', okLabel: can ? 'บันทึก' : 'ปิด', view: !can,
      fields: [{ k: 'date', label: 'วันที่', type: 'date', req: true }, { k: 'requester', label: 'ผู้เบิก', req: true }, { k: 'category', label: 'หมวด', type: 'select', options: CATS }, { k: 'amount', label: 'จำนวนเงิน (บาท)', type: 'number', req: true },
        { k: 'purpose', label: 'รายการ / วัตถุประสงค์', req: true, wide: true }, { k: 'vendor', label: 'ร้านค้า / ผู้ขาย' }, { k: 'reference', label: 'อ้างอิง (เลขเคส / PO)' },
        { k: 'status', label: 'สถานะ', type: 'select', options: STS }, { k: 'receipts', label: 'ใบเสร็จ', type: 'files', max: 6, maxMB: 3 }, { k: 'note', label: 'หมายเหตุ', type: 'textarea' }],
      check: function (v) { if (!(v.amount > 0)) return 'จำนวนเงินต้องมากกว่า 0'; },
      save: async function (v) {
        if (!can) return;
        var now = new Date().toISOString(), rec = Object.assign({}, x || {}, v, { id: x ? x.id : uid(), docNo: x ? x.docNo : nextNo(v.date), createdAt: x ? x.createdAt : now, updatedAt: now });
        var e = await put(rec); if (e) return 'บันทึกไม่ได้: ' + e;
        if (x) R = R.map(function (y) { return y.id === rec.id ? rec : y; }); else R.unshift(rec);
      } });
    if (r && r.__delete) { var d = await api.sb.from('petty_cash').delete().eq('id', x.id); if (d.error) return toast('ลบไม่ได้: ' + d.error.message); R = R.filter(function (y) { return y.id !== x.id; }); toast('ลบแล้ว'); }
    else if (r && can) toast('บันทึกแล้ว');
    render();
  }
  function exportCsv() {
    var L = R.filter(inMonth).sort(function (a, b) { return String(a.docNo).localeCompare(String(b.docNo)); });
    F.csv('I-MODE_Petty_Cash_' + (month || 'all') + '.csv', [['Doc No', 'Date', 'Requester', 'Category', 'Purpose', 'Vendor', 'Amount', 'Status', 'Reference', 'Receipts', 'Note']].concat(L.map(function (x) { return [x.docNo, x.date, x.requester, x.category, x.purpose, x.vendor, x.amount, x.status, x.reference, (x.receipts || []).length, x.note]; })));
  }

  try { api = await window.NextShell.start({ title: 'เงินสดย่อย', moduleId: 'pettycash' }); } catch (e) { $('rows').innerHTML = ''; showErr(e.message); return; }
  month = today().slice(0, 7);
  $('q').placeholder = 'ค้นหาเลขที่ ผู้เบิก รายการ ร้านค้า';
  var res = await api.sb.from('petty_cash').select('id,data').limit(10000);
  if (res.error) { $('rows').innerHTML = ''; showErr('โหลดเงินสดย่อยไม่ได้: ' + res.error.message); return; }
  R = (res.data || []).map(function (r) { return Object.assign({ id: r.id }, r.data || {}); });
  render();
  $('cards').addEventListener('click', function (e) { var b = e.target.closest('[data-c]'); if (!b) return; st = b.getAttribute('data-c'); render(); });
  $('q').addEventListener('input', function () { q = this.value; render(); });
  $('rows').addEventListener('click', function (e) { var a = e.target.closest('[data-id]'); if (a) edit1(R.filter(function (x) { return x.id === a.getAttribute('data-id'); })[0]); });
})();
