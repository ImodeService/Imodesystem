/* I-MODE System (ระบบใหม่) · ปฏิทินงาน มุมมองรายวัน + ข้อความแผนงานช่างแบบ LINE
   งานของวัน = เคส Service ที่นัดวันนั้น (appointment) + งานอื่นในตาราง calendar_jobs
   จัดกลุ่มตามชุดช่าง แล้วสร้างข้อความรูปแบบเดิม:
     แจ้งแพลนงานช่าง 17-11-69 ค่ะ / @ช่าง ... / - ลูกค้า // งาน เครื่อง เวลา ... / ขอบคุณค่ะ */
(async function () {
  'use strict';
  var C = window.SvCommon, esc = window.NextShell.esc;
  var $ = function (id) { return document.getElementById(id); };
  var api, techs = [], monthCases = [], monthJobs = [], day = new Date(), month = null, editJob = null, picked = false, colors = {}, acct = {}, colorCol = true;
  var PALETTE = ['#2F6FDE', '#E0793B', '#2E9E6B', '#8A4FBF', '#C2415D', '#0E8A9A', '#9A7B0A', '#5A6478'];
  var K_NOTIFY = 'imode.next.cal.notify', K_POLITE = 'imode.next.cal.polite', K_TAGS = 'imode.next.cal.tags', tags = {};
  var MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function short(d) { return String(d.getDate()).padStart(2, '0') + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String((d.getFullYear() + 543) % 100).padStart(2, '0'); }
  function showErr(m) { $('err').innerHTML = m ? '<div class="nx-err" role="alert">' + esc(m) + '</div>' : ''; }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k) || ''; localStorage.setItem(k, v); } catch (e) { return ''; } }
  function techName(id) { var t = techs.filter(function (x) { return x.id === id; })[0]; return t ? t.name : id; }
  /* สีประจำ Account: สีของบัญชีที่ผูกกับช่าง (profiles.color) ถ้ายังไม่ตั้ง ใช้สีเดิมของช่าง แล้วค่อยใช้สีสำรอง */
  function colorOf(tid) {
    if (!tid) return '#8A93A3';
    if (colors[tid]) return colors[tid];
    var i = Math.max(0, techs.findIndex(function (t) { return t.id === tid; })), t = techs[i];
    return (t && /^#[0-9a-f]{6}$/i.test(t.color || '') ? t.color : PALETTE[i % PALETTE.length]);
  }
  function firstLine(s, n) { s = String(s || '').split('\n')[0].trim(); return s.length > n ? s.slice(0, n) + '…' : s; }

  /* รายการงานของวันที่เลือก */
  function dayItems(k) {
    k = k || ymd(day); var out = [];
    monthCases.forEach(function (c) {
      if (String(c.appointment || '').slice(0, 10) !== k) return;
      var t = (String(c.appointment).match(/T(\d\d:\d\d)/) || [])[1] || '';
      out.push({ kind: 'case', id: c.id, color: colorOf(String(c.assignee || '').split(',')[0].trim()), ticket: c.ticket, techs: String(c.assignee || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean),
        customer: c.customer || '', task: firstLine(c.issue, 70) || C.typeName(c.service_type), machine: [c.machine, c.model].filter(Boolean).join(' '),
        time: t ? t.replace(/^0/, '') + ' น.' : '', sort: t || '99' });
    });
    monthJobs.forEach(function (j) {
      if (j.day !== k) return;
      out.push({ kind: 'job', id: j.id, color: colorOf((j.techs || [])[0]), techs: j.techs || [], customer: j.customer || '', task: j.task || '', machine: j.machine || '', time: j.time_text || '',
        sort: (String(j.time_text || '').match(/\d{1,2}[:.]\d\d/) || ['99'])[0].replace('.', ':').padStart(5, '0') });
    });
    out.sort(function (a, b) { return a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0; });
    return out;
  }
  function groups(items) {
    var map = {}, order = [];
    items.forEach(function (it) {
      var key = it.techs.slice().sort().join(',');
      if (!map[key]) { map[key] = { techs: it.techs.slice(), items: [] }; order.push(key); }
      map[key].items.push(it);
    });
    order.sort(function (a, b) { return (a === '') - (b === ''); }); // ไม่ระบุช่างไว้ท้าย
    return order.map(function (k) { return map[k]; });
  }

  function lineText(gs) {
    var p = $('polite').value || 'ค่ะ', notify = $('notify').value.trim(), L = [];
    if (notify) L.push(notify);
    L.push('แจ้งแพลนงานช่าง ' + short(day) + ' ' + p);
    if (!gs.length) L.push('- ไม่มีงาน');
    gs.forEach(function (g) {
      L.push(g.techs.length ? g.techs.map(function (t) { return '@' + (tags[t] || techName(t)); }).join(' ') : '(ยังไม่ระบุช่าง)');
      g.items.forEach(function (it) {
        var s = '- ' + [it.customer, it.task].filter(Boolean).join(' // ');
        if (it.machine) s += ' ' + it.machine;
        if (it.time) s += ' เวลา ' + it.time;
        L.push(s);
      });
    });
    L.push('ขอบคุณ' + p);
    return L.join('\n');
  }

  function renderMonth() {
    var y = month.getFullYear(), m = month.getMonth(), first = new Date(y, m, 1).getDay(), n = new Date(y, m + 1, 0).getDate();
    var h = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map(function (w) { return '<span class="wd">' + w + '</span>'; }).join('');
    for (var i = 0; i < first; i++) h += '<span class="pad"></span>';
    var sel = picked ? ymd(day) : '', tk = ymd(new Date());
    for (var d = 1; d <= n; d++) {
      var k = ymd(new Date(y, m, d)), its = dayItems(k);
      var chips = its.slice(0, 3).map(function (it) { return '<span class="chip" style="background:' + it.color + '">' + esc(it.customer || it.task || '-') + '</span>'; }).join('') + (its.length > 3 ? '<span class="more">+' + (its.length - 3) + ' งาน</span>' : '');
      var dots = its.map(function (it) { return '<i style="background:' + it.color + '"></i>'; }).join('');
      h += '<button type="button" data-day="' + k + '" class="' + (its.length ? 'has ' : '') + (k === tk ? 'today' : '') + '" aria-selected="' + (k === sel) + '" aria-label="' + d + ' ' + MONTHS[m] + (its.length ? ' มี ' + its.length + ' งาน' : '') + '">' +
        '<b class="dn">' + d + '</b><span class="chips">' + chips + '</span><span class="dots">' + dots + '</span></button>';
    }
    $('month').innerHTML = h;
    $('mTitle').textContent = MONTHS[m] + ' ' + (y + 543);
  }
  /* กล่อง "สีประจำ Account": ช่างที่มีบัญชีผูกอยู่ ตั้งสีได้ถ้ามีสิทธิ์แก้ปฏิทิน */
  function renderLegend() {
    var canEdit = api.can('calendar.edit') && colorCol;
    $('legend').innerHTML = techs.map(function (t) {
      var c = colorOf(t.id);
      return '<label class="cl-lg"' + (acct[t.id] || !colorCol ? '' : ' title="ยังไม่มีบัญชีผูกกับช่างคนนี้"') + '><input type="color" value="' + c + '" data-tc="' + esc(t.id) + '"' + (canEdit && acct[t.id] ? '' : ' disabled') + ' aria-label="สีของ ' + esc(t.name) + '"><span>' + esc(t.name) + '</span></label>';
    }).join('');
    $('legNote').textContent = colorCol ? (canEdit ? 'กดที่สีเพื่อเปลี่ยน' : '') : 'ตั้งสีไม่ได้จนกว่าจะรัน SQL 05 (ตอนนี้ใช้สีเดิมของช่าง)';
  }

  function render() {
    var mainEl = document.querySelector('.cl-main'), boxEl = mainEl.querySelector('.cl-side>.cl-box'), wasBig = mainEl.classList.contains('cl-big');
    var f = boxEl.getBoundingClientRect();
    mainEl.classList.toggle('cl-big', !picked);
    if (wasBig !== !picked && !window.matchMedia('(prefers-reduced-motion:reduce)').matches) {
      var l = boxEl.getBoundingClientRect();
      if (l.width && f.width) {
        mainEl.classList.add('cl-anim');
        boxEl.style.transition = 'none'; boxEl.style.transformOrigin = '0 0';
        boxEl.style.transform = 'translate(' + (f.left - l.left) + 'px,' + (f.top - l.top) + 'px) scale(' + (f.width / l.width) + ',' + (f.height / l.height) + ')';
        void boxEl.offsetWidth;
        boxEl.style.transition = 'transform .38s cubic-bezier(.2,.7,.2,1)'; boxEl.style.transform = '';
        setTimeout(function () { boxEl.style.transition = ''; boxEl.style.transformOrigin = ''; mainEl.classList.remove('cl-anim'); }, 420);
      }
    }
    renderMonth(); renderLegend();
    if (!picked) return;
    var items = dayItems(), gs = groups(items), canEdit = api.can('calendar.edit');
    $('dTitle').textContent = day.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    $('sheet').innerHTML = '<div class="ttl">แผนงานช่าง ' + esc(short(day)) + '</div><div class="sub">' + items.length + ' งาน · ช่าง ' +
      Object.keys(items.reduce(function (a, it) { it.techs.forEach(function (t) { a[t] = 1; }); return a; }, {})).length + ' คน</div>' +
      (gs.length ? gs.map(function (g) {
        return '<div class="cl-g"><div class="who">' + (g.techs.length ? g.techs.map(function (t) { return '<span style="border-left:6px solid ' + colorOf(t) + '">' + esc(techName(t)) + '</span>'; }).join('') : '<span class="none">ยังไม่ระบุช่าง</span>') + '</div>' +
          '<table class="cl-t"><thead><tr><th>#</th><th>ลูกค้า</th><th>รายละเอียดงาน</th><th>เครื่อง</th><th>เวลา</th></tr></thead><tbody>' +
          g.items.map(function (it, i) {
            var cust = it.kind === 'case'
              ? '<a href="../service/case.html?id=' + encodeURIComponent(it.id) + '">' + esc(it.customer || '-') + '</a><span class="tag">' + esc(it.ticket || '') + '</span>'
              : (canEdit ? '<button type="button" class="ed" data-job="' + esc(it.id) + '">' + esc(it.customer || '(แก้ไข)') + '</button>' : esc(it.customer)) + '<span class="tag">งานในปฏิทิน</span>';
            return '<tr><td class="n">' + (i + 1) + '</td><td>' + cust + '</td><td>' + esc(it.task) + '</td><td>' + esc(it.machine) + '</td><td class="tm">' + esc(it.time) + '</td></tr>';
          }).join('') + '</tbody></table></div>';
      }).join('') : '<div class="nx-empty">ไม่มีงานวันนี้</div>');
    $('lineText').value = lineText(gs);
    // สรุปช่าง
    var cnt = {}; items.forEach(function (it) { it.techs.forEach(function (t) { cnt[t] = (cnt[t] || 0) + 1; }); });
    var free = techs.filter(function (t) { return !cnt[t.id]; });
    $('techSum').innerHTML = techs.filter(function (t) { return cnt[t.id]; }).map(function (t) { return '<div class="cl-ts"><span>' + esc(t.name) + '</span><b>' + cnt[t.id] + ' งาน</b></div>'; }).join('') +
      '<div class="cl-ts mut"><span>ว่าง</span><span>' + (free.length ? esc(free.map(function (t) { return t.name; }).join(', ')) : '-') + '</span></div>';
  }

  async function loadMonth(d) {
    month = new Date(d.getFullYear(), d.getMonth(), 1);
    var a = ymd(month), b = ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)), pref = a.slice(0, 7);
    var r = await Promise.all([
      api.sb.from('service_cases').select('id,ticket,customer,machine,model,issue,service_type,assignee,appointment,stage,status').like('appointment', pref + '%').is('deleted_at', null).limit(1000),
      api.sb.from('calendar_jobs').select('id,day,time_text,techs,customer,task,machine').gte('day', a).lte('day', b).limit(1000)
    ]);
    if (r[0].error) showErr('โหลดเคสไม่ได้: ' + r[0].error.message);
    else if (r[1].error) showErr('โหลดงานในปฏิทินไม่ได้ (รัน SQL 03 แล้วหรือยัง?): ' + r[1].error.message);
    else showErr('');
    monthCases = r[0].data || []; monthJobs = r[1].data || [];
  }
  async function go(d) {
    var same = month && d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth();
    day = d; if (!same) await loadMonth(d); render();
  }

  try { api = await window.NextShell.start({ title: 'ปฏิทินงาน', moduleId: 'calendar' }); }
  catch (e) { $('sheet').innerHTML = ''; showErr(e.message); return; }
  try { tags = JSON.parse(ls(K_TAGS) || '{}') || {}; } catch (e) { tags = {}; }
  $('tagNames').addEventListener('input', function (e) { var i = e.target.closest('[data-tg]'); if (!i) return; var v = i.value.trim(); if (v) tags[i.getAttribute('data-tg')] = v; else delete tags[i.getAttribute('data-tg')]; ls(K_TAGS, JSON.stringify(tags)); render(); });
  $('notify').value = ls(K_NOTIFY); $('polite').value = ls(K_POLITE) || 'ค่ะ';
  if (api.can('calendar.edit')) { $('addJob').hidden = false; $('mAdd').hidden = false; }
  var q = new URLSearchParams(location.search).get('d');
  if (q && /^\d{4}-\d\d-\d\d$/.test(q)) day = new Date(q + 'T00:00');
  techs = await C.loadTechs(api.sb);
  $('tagNames').innerHTML = techs.map(function (t) { return '<label class="cl-f">@ ของ ' + esc(t.name) + '<input data-tg="' + esc(t.id) + '" value="' + esc(tags[t.id] || '') + '" placeholder="' + esc(t.name) + '" autocomplete="off"></label>'; }).join('');
  async function loadColors() {
    var r = await api.sb.from('profiles').select('technician_id,color').not('technician_id', 'is', null);
    if (r.error) { colorCol = false; return; }
    colors = {}; acct = {}; (r.data || []).forEach(function (p) { if (p.technician_id) acct[p.technician_id] = 1; if (p.technician_id && /^#[0-9a-f]{6}$/i.test(p.color || '')) colors[p.technician_id] = p.color; });
  }
  await loadColors();
  picked = !!(q && /^\d{4}-\d\d-\d\d$/.test(q));
  await go(day);

  $('month').addEventListener('click', function (e) { var b = e.target.closest('[data-day]'); if (b) { picked = true; go(new Date(b.getAttribute('data-day') + 'T00:00')).then(function () { if (window.matchMedia('(max-width:860px)').matches) $('dTitle').scrollIntoView({ behavior: 'smooth', block: 'start' }); }); } });
  $('legend').addEventListener('change', async function (e) {
    var i = e.target.closest('[data-tc]'); if (!i) return;
    var t = i.getAttribute('data-tc'), c = i.value;
    var p = await api.sb.rpc('account_set_color', { p_tech: t, p_color: c });
    if (p.error) { showErr('เปลี่ยนสีไม่สำเร็จ: ' + p.error.message); return; }
    colors[t] = c; showErr(''); render();
  });
  $('mToday').onclick = function () { var t = new Date(); picked = false; go(new Date(t.getFullYear(), t.getMonth(), 1)); };
  $('mAdd').onclick = function () { openJob(null); };
  $('backBig').onclick = function () { picked = false; render(); };
  $('mPrev').onclick = function () { go(new Date(month.getFullYear(), month.getMonth() - 1, 1)); };
  $('mNext').onclick = function () { go(new Date(month.getFullYear(), month.getMonth() + 1, 1)); };
  $('dPrev').onclick = function () { picked = true; go(new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1)); };
  $('dNext').onclick = function () { picked = true; go(new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)); };
  $('today').onclick = function () { var t = new Date(); picked = true; go(new Date(t.getFullYear(), t.getMonth(), t.getDate())); };
  $('notify').addEventListener('input', function () { ls(K_NOTIFY, this.value); render(); });
  $('polite').addEventListener('change', function () { ls(K_POLITE, this.value); render(); });

  $('copy').onclick = async function () {
    var t = $('lineText').value, b = this, ok = false;
    try { await navigator.clipboard.writeText(t); ok = true; } catch (e) { $('lineText').select(); try { ok = document.execCommand('copy'); } catch (x) {} }
    b.textContent = ok ? 'คัดลอกแล้ว ✓' : 'คัดลอกไม่ได้ ลองกด Ctrl+C'; setTimeout(function () { b.textContent = 'คัดลอกข้อความไป LINE'; }, 2000);
  };
  $('saveImg').onclick = async function () {
    var b = this; b.disabled = true; b.textContent = 'กำลังสร้างรูป…';
    try {
      if (!window.html2canvas) await new Promise(function (ok, bad) {
        var s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'; s.onload = ok; s.onerror = bad; document.head.appendChild(s);
      });
      var cv = await window.html2canvas($('sheet'), { scale: 2, backgroundColor: getComputedStyle(document.body).backgroundColor });
      var a = document.createElement('a'); a.download = 'แผนงานช่าง-' + short(day) + '.png'; a.href = cv.toDataURL('image/png'); a.click();
    } catch (e) { showErr('สร้างรูปไม่ได้ ลองแคปหน้าจอแทน'); }
    b.disabled = false; b.textContent = 'บันทึกเป็นรูป';
  };

  // เพิ่ม/แก้ งานในปฏิทิน
  var dlg = $('jobDlg');
  function openJob(j) {
    editJob = j || null;
    $('jobTitle').textContent = j ? 'แก้ไขงาน' : 'เพิ่มงาน';
    $('jDay').value = j ? j.day : ymd(day); $('jTime').value = j ? (j.time_text || '') : '';
    $('jCust').value = j ? (j.customer || '') : ''; $('jTask').value = j ? (j.task || '') : ''; $('jMach').value = j ? (j.machine || '') : '';
    var sel = j ? (j.techs || []) : [];
    $('jTechs').innerHTML = techs.map(function (t) { return '<label><input type="checkbox" value="' + esc(t.id) + '"' + (sel.indexOf(t.id) >= 0 ? ' checked' : '') + '>' + esc(t.name) + '</label>'; }).join('');
    $('jDel').hidden = !j; dlg.showModal();
  }
  $('addJob').onclick = function () { openJob(null); };
  $('sheet').addEventListener('click', function (e) { var b = e.target.closest('[data-job]'); if (b) openJob(monthJobs.filter(function (j) { return j.id === b.getAttribute('data-job'); })[0]); });
  $('jDel').onclick = async function () {
    if (!editJob || !window.confirm('ลบงานนี้ออกจากปฏิทิน?')) return;
    var r = await api.sb.from('calendar_jobs').delete().eq('id', editJob.id);
    dlg.close('cancel');
    if (r.error) { showErr('ลบไม่สำเร็จ: ' + r.error.message); return; }
    monthJobs = monthJobs.filter(function (j) { return j.id !== editJob.id; }); render();
  };
  dlg.addEventListener('close', async function () {
    if (dlg.returnValue !== 'ok') return;
    var row = { day: $('jDay').value, time_text: $('jTime').value.trim(), customer: $('jCust').value.trim(), task: $('jTask').value.trim(), machine: $('jMach').value.trim(),
      techs: Array.prototype.map.call($('jTechs').querySelectorAll('input:checked'), function (x) { return x.value; }) };
    if (!row.day || !row.task) { showErr('ต้องใส่วันที่และรายละเอียดงาน'); return; }
    var r = editJob ? await api.sb.from('calendar_jobs').update(row).eq('id', editJob.id) : await api.sb.from('calendar_jobs').insert(row);
    if (r.error) { showErr('บันทึกไม่สำเร็จ: ' + r.error.message); return; }
    month = null; picked = true; await go(new Date(row.day + 'T00:00'));
  });
})();
