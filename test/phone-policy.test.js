'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var skipDirs = { node_modules: true, '.git': true, assets: true };
var telMobile = 'tel:' + '+3165';
var telShort = 'tel:' + '06';
var hits = [];

function walk(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (ent) {
    if (skipDirs[ent.name]) return;
    var full = path.join(dir, ent.name);
    if (ent.isDirectory()) return walk(full);
    if (!/\.(html|js|md|txt|json|css|sql)$/i.test(ent.name)) return;
    if (ent.name === 'package-lock.json') return;
    var text = fs.readFileSync(full, 'utf8');
    var rel = path.relative(root, full);
    text.split(/\n/).forEach(function (line, i) {
      var where = rel + ':' + (i + 1);
      if (line.indexOf(telMobile) !== -1) hits.push(where + ' bevat ' + telMobile);
      if (line.indexOf(telShort) !== -1) hits.push(where + ' bevat ' + telShort);
      var re = /["']telephone["']\s*:\s*["']([^"']*)["']/g;
      var m;
      while ((m = re.exec(line))) {
        if (m[1].indexOf('+316') !== -1 || m[1].indexOf('06') !== -1) {
          hits.push(where + ' telephone ' + m[1]);
        }
      }
    });
  });
}

walk(root);
assert.deepStrictEqual(hits, [], '06 mag niet als belnummer of telephone staan:\n' + hits.join('\n'));

var html = fs.readFileSync(path.join(root, 'whk_verzuim.html'), 'utf8');
var server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
var chat = fs.readFileSync(path.join(root, 'lib', 'chat-api.js'), 'utf8');
assert.ok(html.indexOf('"telephone": "+31850870307"') !== -1, 'homepage JSON-LD mist het vaste nummer');
assert.ok(server.indexOf('"telephone": "+31850870307"') !== -1, 'server JSON-LD mist het vaste nummer');
assert.ok(html.indexOf('tel:+31850870307') !== -1, 'tel-link naar het vaste nummer ontbreekt');
assert.ok(html.indexOf('https://wa.me/31650213593') !== -1, 'WhatsApp-link ontbreekt');
assert.ok(server.indexOf('085-0870307') !== -1, 'llms.txt of mail mist het vaste nummer');
assert.ok(server.indexOf('https://wa.me/31650213593') !== -1, 'llms.txt of mail mist WhatsApp');
assert.ok(chat.indexOf('function fallbackText') !== -1, 'fallback ontbreekt');
assert.ok(chat.indexOf('Bel \' + config.phoneDisplay') !== -1, 'fallback noemt het belnummer niet');
assert.ok(chat.indexOf('app via WhatsApp') !== -1, 'fallback noemt WhatsApp niet');

console.log('phone policy tests ok');
