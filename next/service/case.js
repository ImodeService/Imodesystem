/* I-MODE System (ระบบใหม่) · หน้ารายละเอียดเคส Service  (case.html?id=...)
   - แถบขั้น กดย้ายขั้นได้, ปุ่มขั้นต่อไป, พัก Hold / ลูกค้าตอบแล้ว (ผ่าน rpc case_move_stage)
   - ข้อมูลลูกค้า เครื่อง (+ประกัน) งาน ใบเสนอราคา รายงานบริการ รูป
   - แชทเคส (ตาราง case_messages เดิม) + แท็บประวัติการย้ายขั้น · ลากขอบซ้ายปรับความกว้างได้ (จำไว้ในเครื่อง)
   - ลบ = ย้ายไปถังขยะ (app_soft_delete ต้องมีเหตุผล) */
(async function () {
  'use strict';
  var C = window.SvCommon, esc = window.NextShell.esc;
  var $ = function (id) { return document.getElementById(id); };
  var pageEl = $('page'), errEl = $('err');
  var id = new URLSearchParams(location.search).get('id') || '';
  var api, c, techs = [], machine = null, warranty = null, quotes = [], reports = [], msgs = [], tab = 'chat', busy = false;
  var WKEY = 'imode.next.caseChatW';

  function showErr(m) { errEl.innerHTML = m ? '<div class="nx-err" role="alert">' + esc(m) + '</div>' : ''; }
  function field(label, val, cls) { return '<div class="lb">' + esc(label) + '</div><div class="v' + (cls ? ' ' + cls : '') + '">' + (val || '<span class="mut">-</span>') + '</div>'; }

  function stageBar() {
    var st = C.stageOf(c), held = st === 'hold', base = held ? C.unholdStage(c) : st, at = C.FLOW.indexOf(base), edit = api.can('service.edit');
    return '<nav class="cs-steps" aria-label="ขั้นของเคส">' + C.FLOW.map(function (s, i) {
      var cls = i < at ? 'done' : (i === at ? (held ? 'held' : 'cur') : '');
      var label = (i < at ? '✓ ' : (i === at ? '● ' : '')) + C.stageName(s).replace(' / รับเครื่อง', '');
      return edit && !(i === at && !held)
        ? '<button type="button" class="' + cls + '" data-stage="' + s + '" title="ย้ายไปขั้นนี้">' + esc(label) + '</button>'
        : '<span class="' + cls + '"' + (i === at ? ' aria-current="step"' : '') + '>' + esc(label) + '</span>';
    }).join('') + (held ? '<span class="held-tag">Hold ' + C.holdDays(c) + ' วัน · รอลูกค้า</span>' : '') + '</nav>';
  }

  function mediaHtml() {
    var m = Array.isArray(c.media) ? c.media : [];
    if (!m.length) return '<div class="mut" style="font-size:14px">ยังไม่มีรูป</div>';
    return '<div class="cs-media">' + m.map(function (x, i) {
      var src = x.data || x.url || '', isImg = /^data:image|\.(jpe?g|png|webp|gif)(\?|$)/i.test(src) || /^image\//.test(x.type || '');
      var isVid = /^data:video|\.(mp4|mov|webm)(\?|$)/i.test(src) || /^video\//.test(x.type || '');
      var inner = src && isImg ? '<img src="' + esc(src) + '" alt="" loading="lazy">' : '<span>' + (isVid ? '▶ วิดีโอ' : 'ไฟล์') + '<br><small>' + esc(x.name || '') + '</small></span>';
      return src ? '<button type="button" data-media="' + i + '" aria-label="เปิดไฟล์ ' + (i + 1) + '">' + inner + '</button>'
                 : '<div class="off" title="ไฟล์อยู่ในเครื่องที่อัปโหลด ยังไม่ได้ขึ้นเซิร์ฟเวอร์">' + inner + '</div>';
    }).join('') + '</div>';
  }

  function chatHtml() {
    var log = (Array.isArray(c.stage_log) ? c.stage_log : []).slice().reverse();
    var body = tab === 'chat'
      ? (msgs.length ? msgs.map(function (m) {
          var mine = m.author_id && api.user && m.author_id === api.user.id;
          var photos = Array.isArray(m.photos) ? m.photos.map(function (p) { var s = typeof p === 'string' ? p : (p && (p.data || p.url)); return s ? '<img src="' + esc(s) + '" alt="" loading="lazy">' : ''; }).join('') : '';
          return '<div class="msg' + (mine ? ' me' : '') + '"><b>' + esc(m.author_name || '') + ' · ' + esc(C.fmtDate(m.created_at)) + '</b>' + esc(m.body || '') + photos + '</div>';
        }).join('') : '<div class="mut" style="text-align:center;padding:24px 0">ยังไม่มีข้อความ</div>')
      : (log.length ? log.map(function (l) {
          return '<div class="ev">● ' + esc(l.by_name || '') + ' ย้าย ' + esc(l.from ? C.stageName(l.from) : '-') + ' → ' + esc(C.stageName(l.to)) +
            (l.note ? ' · ' + esc(l.note) : '') + '<br><small>' + esc(C.fmtDate(l.at)) + '</small></div>';
        }).join('') : '<div class="mut" style="text-align:center;padding:24px 0">ยังไม่มีประวัติการย้ายขั้นในระบบใหม่</div>');
    return '<section class="cs-chat nx-card" aria-label="แชทเคส">' +
      '<div class="rz" data-resize role="separator" aria-orientation="vertical" aria-label="ลากเพื่อปรับความกว้างแชท" tabindex="0"></div>' +
      '<div class="tabs" role="tablist"><button role="tab" type="button" data-tab="chat" aria-selected="' + (tab === 'chat') + '">แชทเคส</button><button role="tab" type="button" data-tab="log" aria-selected="' + (tab === 'log') + '">ประวัติ</button></div>' +
      '<div class="body" id="chatBody">' + body + '</div>' +
      (tab === 'chat' ? '<form class="send" id="sendForm"><label class="vh" for="msg">ข้อความ</label><input id="msg" autocomplete="off" placeholder="พิมพ์ข้อความ…"><button class="nx-btn primary" type="submit">ส่ง</button></form>' : '') +
      '</section>';
  }

  function render() {
    var st = C.stageOf(c), held = st === 'hold', edit = api.can('service.edit'), nx = C.nextStage(c);
    var urgent = c.priority === 'ด่วนมาก' || c.priority === 'สูง';
    var acts = '';
    if (edit && st !== 'closed') acts += held
      ? '<button type="button" class="nx-btn edit" data-move="' + C.unholdStage(c) + '">ลูกค้าตอบแล้ว</button>'
      : '<button type="button" class="nx-btn cs-hold" data-move="hold">พัก Hold (รอลูกค้า)</button>';
    if (api.can('service.delete')) acts += '<button type="button" class="nx-btn cs-del" data-del>ลบ</button>';
    if (edit && !held && nx) acts += '<button type="button" class="nx-btn primary" data-move="' + nx + '">' + esc(C.NEXT_LABEL[st] || 'ขั้นต่อไป') + ' →</button>';

    var mName = machine ? (machine.nameTh || machine.name || '') : (c.machine || '');
    var sn = machine ? (machine.imodeSn || '') : '';
    var w = '';
    if (warranty && warranty.end_date) {
      var live = new Date(warranty.end_date) >= new Date(new Date().toDateString());
      w = '<span class="nx-badge ' + (live ? 'ok' : 'bad') + '">' + (live ? 'ในประกัน ถึง ' : 'หมดประกัน ') + esc(C.fmtDate(warranty.end_date, false)) + '</span>';
    } else if (machine && machine.warranty) w = esc(machine.warranty);
    var map = c.map_url && /^https?:\/\//i.test(c.map_url) ? ' · <a href="' + esc(c.map_url) + '" target="_blank" rel="noopener">เปิดแผนที่</a>' : '';

    pageEl.innerHTML =
      '<div class="cs-head"><h1>' + esc(c.ticket || c.id) + '</h1>' +
      '<span class="nx-badge">' + esc(C.typeName(c.service_type)) + '</span>' +
      (c.priority ? '<span class="nx-badge' + (urgent ? ' bad' : '') + '">' + esc(c.priority) + '</span>' : '') +
      '<div class="sp"></div><div class="acts">' + acts + '</div></div>' +
      stageBar() +
      '<div class="cs-grid" id="grid">' +
        '<div class="col">' +
          '<section class="nx-card cs-box"><h2>ลูกค้า</h2>' +
            field('บริษัท / ชื่อ', esc(c.customer || '')) + field('ผู้ติดต่อ', esc([c.contact, c.phone].filter(Boolean).join(' · '))) +
            field('ที่อยู่ / แผนที่', esc(c.location || '') + map) + '</section>' +
          '<section class="nx-card cs-box"><h2>อาการที่แจ้ง</h2><div class="v pre">' + esc(c.issue || '-') + '</div>' +
            (c.note ? '<div class="lb">หมายเหตุ</div><div class="v pre">' + esc(c.note) + '</div>' : '') + '</section>' +
        '</div>' +
        '<div class="col">' +
          '<section class="nx-card cs-box"><h2>เครื่อง</h2>' +
            field('รุ่น', esc([mName, machine ? machine.model : c.model].filter(Boolean).join(' · '))) +
            field('I-MODE S/N', sn ? '<span class="mono">' + esc(sn) + '</span>' : '') +
            field('S/N โรงงาน', esc(machine ? (machine.factorySn || machine.serial || '') : (c.serial || ''))) +
            field('ประกัน', w) + '</section>' +
          '<section class="nx-card cs-box"><h2>งาน</h2><div class="two">' +
            '<div>' + field('ช่างรับผิดชอบ', esc(C.techNames(c.assignee, techs))) + '</div>' +
            '<div>' + field('นัดหมาย', esc(C.fmtDate(c.appointment))) + '</div>' +
            '<div>' + field('ใบเสนอราคา', quotes.map(function (q) { return esc(q.id) + (q.status ? ' · ' + esc(q.status) : ''); }).join('<br>')) + '</div>' +
            '<div>' + field('รายงานบริการ', reports.map(function (r) { return '<a href="reports.html?id=' + encodeURIComponent(r.id) + '">' + esc(r.report_no || r.id) + '</a>' + (r.status ? ' · ' + esc(r.status) : ''); }).join('<br>')) + '</div>' +
            '<div>' + field('ช่องทางที่แจ้ง', esc(c.channel || '')) + '</div>' +
            '<div>' + field('เปิดเคสเมื่อ', esc(C.fmtDate(c.created_at))) + '</div>' +
          '</div></section>' +
          '<section class="nx-card cs-box"><h2>รูป / วิดีโอ (' + (Array.isArray(c.media) ? c.media.length : 0) + ')</h2>' + mediaHtml() + '</section>' +
        '</div>' +
        chatHtml() +
      '</div>';
    var w0 = 0; try { w0 = parseInt(localStorage.getItem(WKEY), 10) || 0; } catch (e) {}
    if (w0) $('grid').style.setProperty('--chat-w', w0 + 'px');
    var b = $('chatBody'); if (b && tab === 'chat') b.scrollTop = b.scrollHeight;
  }

  async function loadMsgs() {
    var r = await api.sb.from('case_messages').select('id,body,photos,author_id,author_name,created_at').eq('case_id', id).order('created_at').limit(300);
    msgs = r.error ? [] : (r.data || []);
  }
  async function load() {
    var r = await api.sb.from('service_cases').select('*').eq('id', id).is('deleted_at', null).maybeSingle();
    if (r.error) throw new Error('โหลดเคสไม่ได้: ' + r.error.message);
    if (!r.data) throw new Error('ไม่พบเคสนี้ (อาจถูกย้ายไปถังขยะแล้ว)');
    c = r.data;
    document.title = (c.ticket || 'เคส') + ' · I-MODE System';
    var jobs = [
      C.loadTechs(api.sb).then(function (t) { techs = t; }),
      api.sb.from('quotations').select('id,status,grand').eq('case_id', id).is('deleted_at', null).then(function (x) { quotes = x.data || []; }),
      api.sb.from('service_reports').select('id,report_no,status').eq('case_id', id).then(function (x) { reports = x.data || []; }),
      loadMsgs()
    ];
    if (c.machine_id) {
      jobs.push(api.sb.from('machines').select('id,name,nameTh,model,serial,factorySn,imodeSn,warranty').eq('id', c.machine_id).maybeSingle().then(function (x) { machine = x.data || null; }));
      jobs.push(api.sb.from('machine_warranties').select('end_date').eq('machine_id', c.machine_id).order('end_date', { ascending: false }).limit(1).then(function (x) { warranty = (x.data || [])[0] || null; }));
    }
    await Promise.all(jobs);
  }

  async function move(stage) {
    if (busy) return; busy = true; showErr('');
    var res = await api.sb.rpc('case_move_stage', { p_case: id, p_stage: stage, p_note: '' });
    if (res.error) showErr('ย้ายขั้นไม่สำเร็จ: ' + res.error.message);
    else { var r = await api.sb.from('service_cases').select('*').eq('id', id).maybeSingle(); if (r.data) c = r.data; }
    busy = false; render();
  }

  try {
    api = await window.NextShell.start({ title: 'Service', moduleId: 'service' });
    if (!id) throw new Error('ไม่ได้ระบุเคส');
    await load(); render();
  } catch (e) { pageEl.innerHTML = ''; showErr(e.message); return; }

  pageEl.addEventListener('click', function (e) {
    var b;
    if ((b = e.target.closest('[data-move]'))) move(b.getAttribute('data-move'));
    else if ((b = e.target.closest('[data-stage]'))) {
      var to = b.getAttribute('data-stage');
      if (window.confirm('ย้ายเคสไปขั้น "' + C.stageName(to) + '"?')) move(to);
    }
    else if ((b = e.target.closest('[data-tab]'))) { tab = b.getAttribute('data-tab'); render(); }
    else if ((b = e.target.closest('[data-media]'))) openMedia(c.media[+b.getAttribute('data-media')]);
    else if (e.target.closest('[data-del]')) {
      $('delWhat').textContent = (c.ticket || c.id) + ' · ' + (c.customer || '') + ' (กู้คืนได้จากหน้าถังขยะ)';
      $('delReason').value = ''; $('delDlg').showModal();
    }
  });
  pageEl.addEventListener('submit', async function (e) {
    if (e.target.id !== 'sendForm') return;
    e.preventDefault();
    var inp = $('msg'), text = inp.value.trim(); if (!text) return;
    inp.disabled = true;
    var r = await api.sb.from('case_messages').insert({ case_id: id, body: text });
    if (r.error) { showErr('ส่งข้อความไม่สำเร็จ: ' + r.error.message); inp.disabled = false; return; }
    await loadMsgs(); render(); var n = $('msg'); if (n) n.focus();
  });
  // ลากขอบซ้ายของแชทเพื่อปรับความกว้าง (คอม)
  pageEl.addEventListener('pointerdown', function (e) {
    var h = e.target.closest('[data-resize]'); if (!h) return;
    var grid = $('grid'), right = grid.getBoundingClientRect().right;
    h.setPointerCapture(e.pointerId);
    function mv(ev) { var w = Math.min(760, Math.max(300, right - ev.clientX)); grid.style.setProperty('--chat-w', w + 'px'); }
    function up() { h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', up);
      try { localStorage.setItem(WKEY, parseInt(getComputedStyle(grid).getPropertyValue('--chat-w'), 10) || ''); } catch (x) {} }
    h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up);
  });
  pageEl.addEventListener('keydown', function (e) {
    var h = e.target.closest('[data-resize]'); if (!h || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    var grid = $('grid'), cur = parseInt(getComputedStyle(grid).getPropertyValue('--chat-w'), 10) || 420;
    var w = Math.min(760, Math.max(300, cur + (e.key === 'ArrowLeft' ? 40 : -40)));
    grid.style.setProperty('--chat-w', w + 'px'); try { localStorage.setItem(WKEY, w); } catch (x) {}
    e.preventDefault();
  });

  function openMedia(m) {
    if (!m) return;
    var src = m.data || m.url || '', vid = /^data:video|\.(mp4|mov|webm)/i.test(src) || /^video\//.test(m.type || '');
    var d = document.createElement('dialog'); d.className = 'sv-dlg cs-view';
    d.innerHTML = (vid ? '<video controls src="' + esc(src) + '"></video>' : '<img alt="" src="' + esc(src) + '">') +
      '<form method="dialog" class="sv-dlg-btns"><button class="nx-btn">ปิด</button></form>';
    document.body.appendChild(d); d.addEventListener('close', function () { d.remove(); }); d.showModal();
  }

  $('delDlg').addEventListener('close', async function () {
    if (this.returnValue !== 'ok') return;
    var reason = $('delReason').value.trim(); if (!reason) return;
    var res = await api.sb.rpc('app_soft_delete', { p_table: 'service_cases', p_id: id, p_reason: reason });
    if (res.error) { showErr('ลบไม่สำเร็จ: ' + res.error.message); return; }
    location.href = 'index.html';
  });
})();
