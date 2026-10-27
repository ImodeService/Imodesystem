/* Writes www/version.json for the in-app live update: the version from app.js (VERSION / NATIVE)
   the SHA-256 and size of every file under www (sizes drive the progress bar). Run before each release:  node tools/make-version.js
   With a new APK: build it, copy it to release/I-MODE-Tech-v<versionName>.apk (versionName / versionCode from
   android/app/build.gradle), then run this again; "apk" in version.json then offers it to older APKs.
   Without one, the "apk" entry already in version.json is kept. */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const www = path.join(__dirname, '..', 'www');
const app = fs.readFileSync(path.join(www, 'app.js'), 'utf8');
const version = (/var VERSION = '([0-9.]+)'/.exec(app) || [])[1];
const native = Number((/var NATIVE = (\d+)/.exec(app) || [])[1] || 1);
if (!version) throw new Error('VERSION not found in app.js');
const files = {}, sizes = {};
(function walk(dir) {
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name), rel = path.relative(www, full).split(path.sep).join('/');
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (rel !== 'version.json') { const data = fs.readFileSync(full); files[rel] = crypto.createHash('sha256').update(data).digest('hex'); sizes[rel] = data.length; }
  }
})(www);
const out = { version, native, files, sizes };
const gradle = fs.readFileSync(path.join(__dirname, '..', 'android', 'app', 'build.gradle'), 'utf8');
const code = Number((/versionCode\s+(\d+)/.exec(gradle) || [])[1] || 0), name = (/versionName\s+"([^"]+)"/.exec(gradle) || [])[1] || '';
const apkRel = 'release/I-MODE-Tech-v' + name + '.apk', apkFile = path.join(__dirname, '..', apkRel);
if (code && name && fs.existsSync(apkFile)) {
  const data = fs.readFileSync(apkFile);
  out.apk = { code, name, path: apkRel, sha256: crypto.createHash('sha256').update(data).digest('hex'), size: data.length };
} else {
  try { const prev = JSON.parse(fs.readFileSync(path.join(www, 'version.json'), 'utf8')); if (prev.apk) out.apk = prev.apk; } catch (e) {}
}
fs.writeFileSync(path.join(www, 'version.json'), JSON.stringify(out, null, 1) + '\n');
console.log('version.json', version, Object.keys(files).length, 'files', out.apk ? 'apk ' + out.apk.name + ' (' + out.apk.code + ')' : 'no apk');
