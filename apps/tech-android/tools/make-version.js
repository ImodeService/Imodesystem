/* Writes www/version.json for the in-app live update: the version from app.js (VERSION / NATIVE)
   the SHA-256 and size of every file under www (sizes drive the progress bar). Run before each release:  node tools/make-version.js */
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
fs.writeFileSync(path.join(www, 'version.json'), JSON.stringify({ version, native, files, sizes }, null, 1) + '\n');
console.log('version.json', version, Object.keys(files).length, 'files');
