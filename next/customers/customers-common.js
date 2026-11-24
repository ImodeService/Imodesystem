/* I-MODE System (ระบบใหม่) · ลูกค้า · ของที่ใช้ร่วม (2026-11-24)
   ตาราง customers เดิม (ไม่เปลี่ยนโครงสร้าง) · ผู้ติดต่อเก็บใน contacts jsonb แบบเดิม
   [{id,name,position,note,channels:[{id,type:'phone'|'email'|'line',value}]}] */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var F = { name: 'fName', branch: 'fBranch', location: 'fLoc', address: 'fAddr', map_url: 'fMap', contact: 'fContact', phone: 'fPhone', email: 'fEmail', note: 'fNote' };
  function uid() { try { return crypto.randomUUID(); } catch (e) { return 'c-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); } }
  function chan(ct, type) { var x = (ct.channels || []).filter(function (c) { return c.type === type && c.value; })[0]; return x ? x.value : ''; }
  function mapsUrl(c) {
    if (c.map_url) return c.map_url;
    if (c.latitude && c.longitude) return 'https://www.google.com/maps?q=' + c.latitude + ',' + c.longitude;
    var q = [c.name, c.branch, c.address || c.location].filter(Boolean).join(' ');
    return q ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q) : '';
  }
  /* ฟอร์มเพิ่ม/แก้ลูกค้า · resolve แถวที่บันทึกแล้ว หรือ null ถ้ายกเลิก */
  function editCustomer(sb, row) {
    return new Promise(function (done) {
      var dlg = $('dlg'), frm = $('frm'), err = $('dlgErr');
      $('dlgT').textContent = row ? 'แก้ไขข้อมูลลูกค้า' : 'เพิ่มลูกค้า';
      Object.keys(F).forEach(function (k) { $(F[k]).value = row && row[k] || ''; });
      err.hidden = true;
      function close() { frm.removeEventListener('submit', submit); dlg.removeEventListener('close', cancel); }
      function cancel() { close(); done(null); }
      async function submit(e) {
        if (e.submitter && e.submitter.value !== 'ok') return;
        e.preventDefault();
        var v = {}; Object.keys(F).forEach(function (k) { v[k] = $(F[k]).value.trim(); });
        if (!v.name) { $(F.name).focus(); return; }
        $('dlgOk').disabled = true;
        var res = row ? await sb.from('customers').update(v).eq('id', row.id).select().maybeSingle()
          : await sb.from('customers').insert(Object.assign({ id: uid(), contacts: [] }, v)).select().maybeSingle();
        $('dlgOk').disabled = false;
        if (res.error) { err.textContent = 'บันทึกไม่สำเร็จ: ' + res.error.message; err.hidden = false; return; }
        close(); dlg.close(); done(res.data || Object.assign({}, row, v));
      }
      frm.addEventListener('submit', submit); dlg.addEventListener('close', cancel);
      dlg.showModal(); $(F.name).focus();
    });
  }
  window.CuCommon = { uid: uid, chan: chan, mapsUrl: mapsUrl, editCustomer: editCustomer };
})();
