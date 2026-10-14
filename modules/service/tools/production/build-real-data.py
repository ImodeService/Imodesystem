"""
I-MODE Plus Service & Maintenance · Version 1.0
tools/build-real-data.py — turns the owner's real data in Data/ into database/seed/03-real-data.sql

    python tools/production/build-real-data.py  [path to the development repository]   (default: this repository)

Reads (never writes) three files in <repo>/Data/:
    iMODE_DB_Ready_สรุปตามลูกค้า_22-09-2026.xlsx     DB_Customers / DB_Machines / DB_Warranties
    iMODE_Machine_Master_Database_Ready_v2.xlsx       DB_Import (the model master)
and two snapshots next to the output:
    database/seed/base-settings.json      configuration only, no test data, no password hashes
    database/seed/base-technicians.json   the four real technician records

Writes:
    database/seed/03-real-data.sql        run it once, after 01-schema.sql and 02-security.sql
    database/seed/03-real-data-report.txt what was imported and what needs a human look

Rules it follows, and why:
  * Identity fields are copied as they are — serial, customer, model. Eleven machines share a
    serial with another machine and four have none; they are imported unchanged (CLAUDE.md:
    never edit identity fields to make the data look tidier). The app already asks which
    machine is meant when a serial matches two.
  * Every machine gets a RANDOM qrToken (128 bits). It is the secret in the printed QR code;
    the old QR-<machine id> form was guessable, so anyone could open any machine.
  * A machine is linked to machine_models only on an exact model-name match. Nothing is guessed.
  * Warranty status is computed from the end date on the day the script runs, not copied from
    the 22/09/2026 snapshot, so a warranty that ended since is not shown as active.
  * Inserts are ON CONFLICT DO NOTHING: re-running never overwrites a record somebody has
    since edited in the application.
"""
import datetime as dt
import json
import re
import secrets
import sys
from pathlib import Path

import openpyxl

REPO = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parents[2])
OUT_DIR = Path(__file__).resolve().parents[2] / 'production' / 'database' / 'seed'
DATA = REPO / 'Data'
TODAY = dt.date.today()
STAMP = dt.datetime.now().replace(microsecond=0).isoformat()
SOURCE = 'I-MODE Machine Master 22/09/2026'


def rows(path, sheet):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    it = wb[sheet].iter_rows(values_only=True)
    head = [str(h).strip() for h in next(it)]
    out = [dict(zip(head, r)) for r in it if any(v not in (None, '') for v in r)]
    wb.close()
    return out


def txt(v):
    if v is None:
        return ''
    if isinstance(v, (dt.datetime, dt.date)):
        return v.strftime('%Y-%m-%d')
    return re.sub(r'\s+', ' ', str(v)).strip()


def iso(v):
    if isinstance(v, dt.datetime):
        return v.date()
    if isinstance(v, dt.date):
        return v
    return None


def q(v):
    """SQL literal."""
    if v is None:
        return 'null'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def jsonb(v):
    return q(json.dumps(v, ensure_ascii=False)) + '::jsonb'


def norm(s):
    return re.sub(r'[\s_\-/]+', '', str(s or '')).lower()


# --- what kind of machine a model string is: name TH / EN, service size, and why ---
FAMILIES = [
    (r'^ho|hydrogen', 'เครื่องผลิตแก๊สไฮโดรเจน', 'Hydrogen Gas Generator', 'L',
     'ระบบก๊าซ/แรงดัน/สารละลาย; HO-200WT/350WT/500WT อยู่กลุ่ม Large'),
    (r'ไนโตรเจน|nitrogen|^n-?\d', 'เครื่องผลิตแก๊สไนโตรเจน', 'Nitrogen Gas Generator', 'L',
     'Nitrogen Generator ใน Service Master อยู่กลุ่ม Large / installed gas utility'),
    (r'mark|bgf|bn30|leser', 'เครื่องมาร์กเลเซอร์', 'Laser Marking Machine', 'S',
     'Laser Marking แบบตั้งโต๊ะ/แยกชุดใน Machine Master จัดเป็น Small'),
    (r'^bl[eu]{2} ?thunder', 'เครื่องเชื่อม', 'Welding Machine', 'L',
     'Blue/Bull Thunder จัดเข้ากลุ่มงานเชื่อมที่ใช้ระบบเฉพาะ; Technical Confirm ได้ภายหลัง'),
    (r'weld|thunder|orotig|sw-?sw', 'เครื่องเชื่อมเลเซอร์', 'Laser Welding Machine', 'L',
     'Laser Welding 60–300W/Bull Thunder ใน Machine Master จัดเป็น Large'),
    (r'msh|gyrat', 'เครื่องขัดระบบไจเรต', 'Gyratory Polishing Machine', 'L',
     'เครื่องขัดระบบไจเรต จัดเป็น Large polishing system'),
    (r'^va|20lx', 'เครื่องขัดแบบจานหมุนเหวี่ยง', 'Centrifugal Disc Finishing Machine', 'L',
     'VA20/VA38 series ใน Machine Master เป็น Large; รุ่นใกล้เคียงจัดตามตระกูลเครื่องขัด production'),
    (r'เครื่องขัด|polish', 'เครื่องขัด', 'Polishing Machine', '',
     'ข้อมูลไม่เพียงพอสำหรับระบุ S/M/L'),
    (r'cnc|banglemaster|^b50', 'เครื่อง CNC ทำกำไล', 'CNC Bangle Machine', '',
     'ข้อมูลไม่เพียงพอสำหรับระบุ S/M/L'),
]


def family(model, category):
    m = txt(model).lower()
    for pat, th, en, size, basis in FAMILIES:
        if m and re.search(pat, m):
            return th, en, size, basis
    cat = txt(category).lower()
    if 'hydrogen' in cat:
        return FAMILIES[0][1:]
    if 'nitrogen' in cat:
        return FAMILIES[1][1:]
    return 'เครื่องจักรไม่ระบุรุ่น', 'Unspecified Machine', '', 'ข้อมูลไม่เพียงพอสำหรับระบุ S/M/L'


SERVICE = {'มี Service': 'ต่อ Service', 'ไม่มี Service': 'ไม่ต่อ Service', 'ไม่ระบุ': 'ไม่ระบุ'}
SIZE_NAME = {'S': 'Small Machine', 'M': 'Medium Machine', 'L': 'Large Machine'}


def months_between(a, b):
    # 29/11/2022 → 28/11/2023 is 12 months, not 11: count the end day as covered.
    if not a or not b:
        return 0
    return max(round(((b - a).days + 1) / 30.4375), 0)


def main():
    db = next(DATA.glob('iMODE_DB_Ready_*.xlsx'))
    master = DATA / 'iMODE_Machine_Master_Database_Ready_v2.xlsx'
    customers = rows(db, 'DB_Customers')
    machines = rows(db, 'DB_Machines')
    warranties = rows(db, 'DB_Warranties')
    models = rows(master, 'DB_Import')
    cat_names = {r['category_code']: r['category_name'] for r in rows(master, 'Categories')}
    settings = json.loads((OUT_DIR / 'base-settings.json').read_text(encoding='utf-8'))
    techs = json.loads((OUT_DIR / 'base-technicians.json').read_text(encoding='utf-8'))

    report = []
    by_model = {}
    for r in models:
        by_model.setdefault(norm(r['model']), []).append(r['machine_model_id'])

    cust_ids = {r['customer_id'] for r in customers}
    mach_by_id = {}
    sql = [
        '-- I-MODE Plus Service & Maintenance · Version 1.0',
        '-- database/seed/03-real-data.sql — GENERATED by tools/build-real-data.py on ' + STAMP,
        '-- REAL CUSTOMER DATA. Never commit this file to a public repository.',
        '-- Run once on a new database, after 01-schema.sql and 02-security.sql.',
        '-- Re-running is harmless: every insert is ON CONFLICT DO NOTHING.',
        '',
        'begin;',
        '',
    ]

    # ---------- machine_models ----------
    sql.append('-- machine_models (%d)' % len(models))
    for r in models:
        sql.append('insert into public.machine_models (id,category_code,category_name,machine_type,model,variant,display_name,brand,image_path,status,notes) values (%s) on conflict (id) do nothing;' % ','.join(map(q, [
            txt(r['machine_model_id']), txt(r['category_code']), cat_names.get(r['category_code'], ''),
            txt(r['machine_type']), txt(r['model']), txt(r['variant']), txt(r['display_name']),
            txt(r['brand']), txt(r['image_relative_path']), txt(r['db_status']), txt(r['notes'])])))

    # ---------- customers ----------
    sql += ['', '-- customers (%d)' % len(customers)]
    for r in customers:
        addr = txt(r['address'])
        contact, phone = txt(r['contact_name']), txt(r['phone'])
        contacts = [{'id': 'CT-' + txt(r['customer_id']) + '-1', 'name': contact, 'position': '', 'note': '',
                     'channels': ([{'id': 'CH-' + txt(r['customer_id']) + '-1', 'type': 'phone', 'value': phone}] if phone else [])}] if (contact or phone) else []
        sql.append('insert into public.customers (id,name,branch,contact,phone,email,location,address,map_url,note,line_user_id,line_display_name,contacts) values (%s,%s) on conflict (id) do nothing;' % (
            ','.join(map(q, [txt(r['customer_id']), txt(r['company_name']), '', contact, phone, '', addr, addr, '', '', '', ''])),
            jsonb(contacts)))

    # I-MODE's own record, used by QC / internal parts issue (js/04 ensureInternalCustomer()).
    # Seeded here so every device finds the same one instead of each creating its own.
    sql.append("insert into public.customers (id,name,branch,contact,phone,email,location,address,map_url,note,line_user_id,line_display_name) values (%s) on conflict (id) do nothing;" % ','.join(map(q, [
        'CUST-INTERNAL-IMODE', 'บริษัท ไอโมด พลัส จำกัด', 'สำนักงานใหญ่', 'แผนก Service', settings.get('companyPhone', ''),
        settings.get('companyEmail', ''), 'ภายในบริษัท', settings.get('companyAddress', ''), '',
        'ลูกค้าภายในสำหรับ QC / เบิกภายใน / งานคลัง', '', ''])))

    # ---------- machines ----------
    tokens = set()
    linked = 0
    sql += ['', '-- machines (%d)' % len(machines)]
    for r in machines:
        mid, cid = txt(r['machine_id']), txt(r['customer_id'])
        if cid not in cust_ids:
            report.append('machine %s points at unknown customer %s — imported anyway' % (mid, cid))
        th, en, size, basis = family(r['model'], r['category'])
        hits = by_model.get(norm(r['model']), []) if txt(r['model']) else []
        model_id = hits[0] if len(hits) == 1 else ''
        linked += bool(model_id)
        tok = 'Q' + secrets.token_urlsafe(16)
        while tok in tokens:
            tok = 'Q' + secrets.token_urlsafe(16)
        tokens.add(tok)
        note = ' · '.join(x for x in [txt(r['note']),
                                      txt(r['data_issue']) if txt(r['data_issue']) and txt(r['note']) not in txt(r['data_issue']) else ''] if x)
        mach_by_id[mid] = {'customerId': cid}
        sql.append('insert into public.machines (id,"customerId",name,"nameTh","nameEn",model,serial,"issueYear","serviceStatus",size,"sizeStatus","serviceSize","sizeBasis",warranty,"pmDue",note,photo,source,"sourceOrder","qrToken","modelId") values (%s) on conflict (id) do nothing;' % ','.join(map(q, [
            mid, cid, th, th, en, txt(r['model']), txt(r['serial_no']), txt(r['machine_year']),
            SERVICE.get(txt(r['source_service_status']), 'ไม่ระบุ'), size,
            'Family Mapping' if size else 'Technical Confirm', SIZE_NAME.get(size, 'Technical Confirm'), basis,
            '', '', note, '', SOURCE, txt(r['source_row']), tok, model_id])))
        if not txt(r['serial_no']):
            report.append('machine %s (%s) has no serial number' % (mid, txt(r['model'])))
        if txt(r['data_issue']):
            report.append('machine %s: %s' % (mid, txt(r['data_issue'])))

    # ---------- warranties, and the machine.warranty summary text ----------
    sql += ['', '-- machine_warranties']
    wcount = skipped = 0
    state = {}
    for r in warranties:
        mid = txt(r['machine_id'])
        start, end = iso(r['warranty_start_date']), iso(r['warranty_end_date'])
        if end:
            state[mid] = 'อยู่ในประกัน' if end >= TODAY else 'หมดประกัน'
        else:
            state[mid] = 'ไม่ทราบ'
        if not start and not end:
            skipped += 1
            continue
        wcount += 1
        m = mach_by_id.get(mid, {})
        sql.append('insert into public.machine_warranties (id,warranty_no,customer_id,machine_id,purchase_date,install_date,start_date,end_date,months,coverage,exclusions,note,issued_by,attachment_name,attachment_type,attachment_data,created_at,updated_at) values (%s) on conflict (id) do nothing;' % ','.join(map(q, [
            txt(r['warranty_id']), txt(r['warranty_id']), m.get('customerId', ''), mid, '',
            start.isoformat() if start else '', start.isoformat() if start else '', end.isoformat() if end else '',
            months_between(start, end), 'Imported from I-MODE warranty database 22/09/2026', '',
            txt(r['status_basis']), 'I-MODE Plus', '', '', '', STAMP, STAMP])))
        if not end:
            report.append('warranty %s (machine %s) has a start date but no end date' % (txt(r['warranty_id']), mid))
    sql += ['', '-- machine.warranty summary, computed on %s' % TODAY.isoformat()]
    for mid, s in state.items():
        sql.append('update public.machines set warranty = %s where id = %s and coalesce(warranty,\'\') = \'\';' % (q(s), q(mid)))

    # ---------- technicians and settings ----------
    sql += ['', '-- technicians (%d)' % len(techs)]
    for t in techs:
        sql.append('insert into public.technicians (id,name,role,team,phone,email,status,skills,color,photo) values (%s) on conflict (id) do nothing;' % ','.join(map(q, [
            t['id'], t.get('name', ''), t.get('role', ''), t.get('team', ''), t.get('phone', ''), t.get('email', ''),
            t.get('status', 'พร้อมรับงาน'), t.get('skills', ''), t.get('color', ''), ''])))
    sql += ['', '-- system_settings: configuration only (no test data, no password hashes)',
            "insert into public.system_settings (id,data,updated_at) values ('main',%s,%s) on conflict (id) do nothing;" % (jsonb(settings), q(STAMP)),
            '', 'commit;', '',
            '-- expected: select (select count(*) from customers), (select count(*) from machines),',
            '--           (select count(*) from machine_warranties), (select count(*) from machine_models);',
            '-- -> %d, %d, %d, %d' % (len(customers), len(machines), wcount, len(models))]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / '03-real-data.sql').write_text('\n'.join(sql) + '\n', encoding='utf-8')
    from collections import Counter
    summary = [
        'Generated ' + STAMP + ' from ' + str(DATA),
        'customers        %d' % len(customers),
        'machines         %d   (linked to a model: %d, not linked: %d)' % (len(machines), linked, len(machines) - linked),
        'warranties       %d   (skipped, no dates at all: %d)' % (wcount, skipped),
        'machine models   %d' % len(models),
        'technicians      %d' % len(techs),
        'warranty on %s: %s' % (TODAY.isoformat(), dict(Counter(state.values()))),
        '',
        'Needs a human look (%d):' % len(report),
    ] + ['  ' + x for x in report]
    (OUT_DIR / '03-real-data-report.txt').write_text('\n'.join(summary) + '\n', encoding='utf-8')
    print('\n'.join(summary[:8]))


if __name__ == '__main__':
    main()
