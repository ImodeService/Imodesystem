/* I-MODE System (ระบบใหม่) · เครื่องจักร · ของที่ใช้ร่วม (2026-11-24)
   ตาราง machines เดิม (คอลัมน์ camelCase) ไม่เปลี่ยนโครงสร้าง
   - qrToken พิมพ์ติดเครื่องไปแล้ว ห้ามเปลี่ยน · เครื่องใหม่ได้ token สุ่ม 24 ตัว
   - IMODE S/N ที่มีค่าแล้ว เปลี่ยนได้เฉพาะ Head QC (trigger ในฐานข้อมูล) และทุกครั้งที่เปลี่ยนจะลง machine_sn_history เอง
   - ลิงก์ QR ใช้รูปแบบเดิม (publicAppUrl ?machineToken=...#/customer-portal) ฉลากที่ติดไปแล้วใช้ได้ต่อ */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var ROOT = (function () { var s = document.querySelector('script[src*="next-shell.js"]'); return s ? s.src.replace(/next\/shared\/next-shell\.js.*$/, '') : '../../'; })();
  var IMG = ROOT + 'shared/assets/machines/';
  var FAMILY = [
    [/ho500wt/, 'hydrogen-ho500wt.webp'], [/ho200wt/, 'hydrogen-ho200wt.webp'],
    [/\bn\s*-?\s*(20|40)\b|nitrogengasgenerator|nitrogen gas generator|เครื่องผลิตแก๊สไนโตรเจน/, 'nitrogen-generator.webp'],
    [/blue\s*-?\s*thunder/, 'welding-blue-thunder.jpg'], [/laser\s*weld|bull\s*thunder|เครื่องเชื่อมเลเซอร์/, 'laser-welding.webp'],
    [/bgf\s*-?\s*20|laser\s*mark|เครื่องมาร์กเลเซอร์/, 'laser-marking-bgf20.jpg'], [/\bva\s*38\b/, 'centrifugal-va38.jpg'], [/\bva\s*20\b/, 'centrifugal-va20.jpg'],
    [/\bva\s*18\b|20\s*l\s*x\s*3|\bmsh\b|gyratory\s*polish|เครื่องขัดระบบไจเรต|centrifugal\s*disc\s*finishing|เครื่องขัดแบบจานหมุนเหวี่ยง/, 'polishing-family.webp']
  ];
  function nameTh(m) { return m ? (m.nameTh || m.name || m.model || 'เครื่องจักร') : '-'; }
  function nameEn(m) { return m ? (m.nameEn || '') : ''; }
  function sn(m) { return m ? (m.imodeSn || m.serial || '') : ''; }
  function photo(m) {
    if (!m) return '';
    if (m.photo && /^(data:image\/|https:\/\/)/.test(m.photo)) return m.photo;
    var t = [m.model, m.name, m.nameTh, m.nameEn].filter(Boolean).join(' ').toLowerCase(), c = t.replace(/[\s_-]+/g, '');
    for (var i = 0; i < FAMILY.length; i++) if (FAMILY[i][0].test(t) || FAMILY[i][0].test(c)) return IMG + FAMILY[i][1];
    return '';
  }
  function size(m) { var s = String(m && m.size || '').trim().toUpperCase(); return s === 'S' || s === 'M' || s === 'L' ? s : ''; }
  function sizeBadge(m) { var s = size(m); return '<span class="ma-sz ' + (s || 'none') + '" title="' + (s ? 'ขนาด Service ' + s : 'ยังไม่ยืนยันขนาด') + '">' + (s || 'รอยืนยัน') + '</span>'; }
  function svcBadge(m) { var s = m && m.serviceStatus || 'ไม่ระบุ'; return '<span class="st' + (s === 'ต่อ Service' ? ' ok' : '') + '">' + s + '</span>'; }
  function isNon(m) { return !!m && String(m.source || '') === 'NON-IMODE'; }
  function token() { var a = new Uint8Array(18); try { crypto.getRandomValues(a); } catch (e) { for (var i = 0; i < a.length; i++) a[i] = Math.random() * 256 | 0; } return 'QR-' + Array.prototype.map.call(a, function (b) { return ('0' + (b % 36).toString(36)).slice(-1); }).join(''); }
  function uid() { try { return crypto.randomUUID(); } catch (e) { return 'm-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); } }

  /* ลิงก์ QR ของเครื่อง: แบบเดิมทุกตัวอักษร เพื่อให้ฉลากที่ติดไปแล้วเปิดได้ */
  var line = null;
  async function lineCfg(sb) {
    if (line) return line;
    line = {};
    try { var r = await sb.from('system_settings').select('data').limit(1).maybeSingle(); line = (r.data && r.data.data && r.data.data.lineConfig) || {}; } catch (e) {}
    return line;
  }
  function portalUrl(m) {
    var t = m.qrToken || m.id, c = line || {};
    if (c.liffId) return 'https://liff.line.me/' + c.liffId + '/?machineToken=' + encodeURIComponent(t);
    var base = String(c.publicAppUrl || (ROOT + 'modules/service/')).split('#')[0].split('?')[0];
    return base + (base.indexOf('?') >= 0 ? '&' : '?') + 'machineToken=' + encodeURIComponent(t) + '#/customer-portal';
  }
  function lineUrl() {
    var c = line || {}; if (c.addFriendUrl) return c.addFriendUrl;
    var id = String(c.officialAccountId || '@imodeservice').trim(); if (id.charAt(0) !== '@') id = '@' + id;
    return 'https://line.me/R/ti/p/' + encodeURIComponent(id);
  }
  function lineId() { var id = String((line || {}).officialAccountId || '@imodeservice').trim(); return id.charAt(0) === '@' ? id : '@' + id; }

  /* QR เป็นรูป (ใช้ qrcodejs จาก cdnjs ที่หน้าโหลดไว้) */
  function qrData(text, color) {
    if (typeof window.QRCode === 'undefined') return '';
    var box = document.createElement('div'); box.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(box);
    try { new window.QRCode(box, { text: text, width: 420, height: 420, colorDark: color || '#0b2f8f', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.H }); } catch (e) {}
    var cv = box.querySelector('canvas'), im = box.querySelector('img'), url = cv ? cv.toDataURL('image/png') : (im ? im.src : '');
    box.remove(); return url;
  }
  /* พิมพ์ฉลาก: kind = machine | line | both (กระดาษแผ่นเดียว) */
  function printLabel(m, kind) {
    var w = window.open('', '_blank', 'width=760,height=820');
    if (!w) { alert('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาต popup'); return; }
    var e = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var logo = ROOT + 'shared/assets/imode-document-logo.webp';
    var mq = kind !== 'line' ? qrData(portalUrl(m), '#0b2f8f') : '', lq = kind !== 'machine' ? qrData(lineUrl(), '#06c755') : '';
    var mLab = '<div class="lb"><img class="lg" src="' + e(logo) + '" alt=""><div class="t">SCAN FOR SERVICE</div><div class="s">แจ้งปัญหา • เช็ค Warranty • ประวัติ Service • คู่มือเครื่อง</div>' +
      '<img class="q" src="' + mq + '" alt="QR"><b>' + e(nameTh(m)) + '</b><div>' + e(m.model || '-') + '</div><div class="sn">S/N ' + e(sn(m) || '-') + '</div><div class="s">I-MODE Plus Service &amp; Maintenance</div></div>';
    var lLab = '<div class="lb ln"><div class="br">LINE</div><img class="q" src="' + lq + '" alt="QR LINE"><div class="t g">เพิ่มเพื่อนเพื่อรับบริการ</div><div class="s">แจ้งงาน · ติดตามสถานะ · ติดต่อทีม Service</div><b>' + e(lineId()) + '</b><div class="s">I-MODE Plus Service Official Account</div></div>';
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>ฉลาก QR ' + e(sn(m)) + '</title><style>' +
      'body{font-family:Arial,"Noto Sans Thai",sans-serif;margin:0;padding:24px;display:flex;gap:18px;justify-content:center;flex-wrap:wrap;color:#111}' +
      '.lb{width:320px;border:2px solid #0b2f8f;border-radius:20px;padding:16px;text-align:center;box-sizing:border-box;break-inside:avoid}.ln{border-color:#06c755}' +
      '.lg{width:180px;height:70px;object-fit:contain}.t{font-size:19px;font-weight:bold;color:#0b2f8f;margin-top:4px}.t.g{color:#06c755}.s{font-size:12px;line-height:1.5}' +
      '.q{width:210px;height:210px;display:block;margin:10px auto}.sn{margin:6px 0;font-weight:bold}.br{display:inline-block;background:#06c755;color:#fff;font-weight:bold;border-radius:8px;padding:4px 14px;font-size:18px}' +
      '@media print{body{padding:0}}</style></head><body>' + (kind === 'line' ? lLab : kind === 'both' ? mLab + lLab : mLab) +
      '<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>');
    w.document.close();
  }

  /* ย่อรูปก่อนเก็บ (เก็บเป็น data URL ในคอลัมน์ photo แบบเดิม) */
  function shrink(file, max) {
    return new Promise(function (ok, no) {
      var fr = new FileReader();
      fr.onerror = function () { no(new Error('อ่านไฟล์ไม่ได้')); };
      fr.onload = function () {
        var im = new Image();
        im.onerror = function () { no(new Error('ไฟล์นี้ไม่ใช่รูปภาพ')); };
        im.onload = function () {
          var s = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas');
          c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          ok(c.toDataURL('image/jpeg', 0.78));
        };
        im.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  function ensureDlg() {
    if ($('mDlg')) return;
    var d = document.createElement('dialog'); d.id = 'mDlg'; d.className = 'cu-dlg ma-dlg';
    d.innerHTML = '<form method="dialog" id="mFrm"><h2 id="mT">เพิ่มเครื่องจักร</h2>' +
      '<div class="ma-pic"><div id="mPic"></div><div class="ma-picb"><label class="nx-btn">📷 เลือกรูป<input id="mPicIn" type="file" accept="image/*" hidden></label><button type="button" class="nx-btn" id="mPicDel">ลบรูป</button></div></div>' +
      '<label class="cu-f">ลูกค้า (ต้องเลือก)<select id="mCust" required></select></label>' +
      '<div class="cu-2"><label class="cu-f">ชื่อเครื่อง (ไทย)<input id="mTh" autocomplete="off"></label><label class="cu-f">ชื่อเครื่อง (อังกฤษ)<input id="mEn" autocomplete="off"></label></div>' +
      '<div class="cu-2"><label class="cu-f">Model<input id="mModel" autocomplete="off"></label><label class="cu-f">Serial No. (โรงงาน)<input id="mSerial" autocomplete="off"></label></div>' +
      '<div class="cu-2"><label class="cu-f">IMODE S/N<input id="mImode" autocomplete="off"><small id="mImodeHint" hidden>มีแล้ว เปลี่ยนได้ที่ QC เท่านั้น</small></label><label class="cu-f">ปีออกเครื่อง<input id="mYear" inputmode="numeric" autocomplete="off"></label></div>' +
      '<div class="cu-2"><label class="cu-f">สถานะ Service<select id="mSvc"><option>ต่อ Service</option><option>ไม่ต่อ Service</option><option>ไม่ระบุ</option></select></label>' +
      '<label class="cu-f">ขนาด Service<select id="mSize"><option value="">รอยืนยัน</option><option value="S">S · เครื่องเล็ก</option><option value="M">M · เครื่องกลาง</option><option value="L">L · เครื่องใหญ่</option></select></label></div>' +
      '<div class="cu-2"><label class="cu-f">PM ครั้งถัดไป<input id="mPm" type="date"></label><label class="cu-f ma-chk"><span><input id="mNon" type="checkbox"> เครื่องที่ไม่ได้ซื้อจาก I-MODE</span></label></div>' +
      '<label class="cu-f">หมายเหตุ<textarea id="mNote" rows="2"></textarea></label>' +
      '<p id="mErr" class="cu-err" hidden></p>' +
      '<div class="cu-dbtn"><button value="cancel" class="nx-btn" formnovalidate>ยกเลิก</button><button value="ok" class="nx-btn primary" id="mOk">บันทึก</button></div></form>';
    document.body.appendChild(d);
  }
  /* ฟอร์มเพิ่ม/แก้เครื่อง · resolve แถวที่บันทึก หรือ null */
  var F = { customerId: 'mCust', nameTh: 'mTh', nameEn: 'mEn', model: 'mModel', serial: 'mSerial', imodeSn: 'mImode', issueYear: 'mYear', serviceStatus: 'mSvc', size: 'mSize', pmDue: 'mPm', note: 'mNote' };
  function editMachine(sb, row, customers, preset) {
    ensureDlg();
    return new Promise(function (done) {
      var dlg = $('mDlg'), frm = $('mFrm'), err = $('mErr'), pic = row && row.photo || '';
      $('mT').textContent = row ? 'แก้ไขเครื่องจักร' : 'เพิ่มเครื่องจักร';
      $('mCust').innerHTML = '<option value="">— เลือกลูกค้า —</option>' + customers.slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'th'); })
        .map(function (c) { return '<option value="' + String(c.id).replace(/"/g, '&quot;') + '">' + String(c.name || '-').replace(/</g, '&lt;') + (c.branch ? ' · ' + String(c.branch).replace(/</g, '&lt;') : '') + '</option>'; }).join('');
      Object.keys(F).forEach(function (k) { $(F[k]).value = row ? (k === 'size' ? size(row) : (row[k] || '')) : ''; });
      if (!row && preset && preset.customerId) $('mCust').value = preset.customerId;
      if (!row) $('mSvc').value = 'ไม่ระบุ';
      var lockSn = !!(row && row.imodeSn);
      $('mImode').readOnly = lockSn; $('mImodeHint').hidden = !lockSn;
      $('mNon').checked = row ? isNon(row) : !!(preset && preset.non);
      function showPic() { $('mPic').innerHTML = pic ? '<img src="' + pic + '" alt="รูปเครื่อง">' : '<span>ยังไม่มีรูป</span>'; $('mPicDel').hidden = !pic; }
      showPic();
      $('mPicIn').value = '';
      $('mPicIn').onchange = async function () {
        var f = this.files && this.files[0]; if (!f) return;
        try { pic = await shrink(f, 1024); showPic(); } catch (x) { err.textContent = x.message; err.hidden = false; }
      };
      $('mPicDel').onclick = function () { pic = ''; showPic(); };
      err.hidden = true;
      function close() { frm.removeEventListener('submit', submit); dlg.removeEventListener('close', cancel); }
      function cancel() { close(); done(null); }
      async function submit(e) {
        if (e.submitter && e.submitter.value !== 'ok') return;
        e.preventDefault();
        var v = {}; Object.keys(F).forEach(function (k) { v[k] = $(F[k]).value.trim(); });
        if (!v.customerId) { err.textContent = 'กรุณาเลือกลูกค้า'; err.hidden = false; $('mCust').focus(); return; }
        if (!v.nameTh && !v.model) { err.textContent = 'ใส่ชื่อเครื่องหรือ Model อย่างน้อยหนึ่งอย่าง'; err.hidden = false; $('mTh').focus(); return; }
        v.name = v.nameTh || v.model;
        var sz = size(v); v.size = sz;
        if (sz) { v.sizeStatus = 'Manual Confirm'; v.serviceSize = { S: 'Small Machine', M: 'Medium Machine', L: 'Large Machine' }[sz]; v.sizeBasis = 'กำหนดจาก Machine Master โดยผู้ใช้งาน'; }
        v.pmDue = v.pmDue || '';
        v.photo = pic;
        var non = $('mNon').checked;
        v.source = non ? 'NON-IMODE' : (row && !isNon(row) ? (row.source || '') : '');
        v.updatedAt = new Date().toISOString();
        if (lockSn) delete v.imodeSn; else if (!v.imodeSn) v.imodeSn = null;
        $('mOk').disabled = true;
        var res = row ? await sb.from('machines').update(v).eq('id', row.id).select().maybeSingle()
          : await sb.from('machines').insert(Object.assign({ id: uid(), qrToken: token(), createdAt: v.updatedAt }, v)).select().maybeSingle();
        $('mOk').disabled = false;
        if (res.error) { err.textContent = 'บันทึกไม่สำเร็จ: ' + res.error.message; err.hidden = false; return; }
        close(); dlg.close(); done(res.data || Object.assign({}, row, v));
      }
      frm.addEventListener('submit', submit); dlg.addEventListener('close', cancel);
      dlg.showModal(); $('mCust').focus();
    });
  }

  window.MaCommon = { nameTh: nameTh, nameEn: nameEn, sn: sn, photo: photo, size: size, sizeBadge: sizeBadge, svcBadge: svcBadge, isNon: isNon,
    lineCfg: lineCfg, portalUrl: portalUrl, lineUrl: lineUrl, lineId: lineId, qrData: qrData, printLabel: printLabel, editMachine: editMachine, root: ROOT };
})();
