'use strict';

var assert = require('assert');
var http = require('http');
var path = require('path');

var expected = {
  '/tools/wia-calculator': 'WIA-uitkering berekenen 2026: gratis WGA- en IVA-calculator',
  '/faq': 'Wat is de Werkhervattingskas (WHK)? Premie, WIA en bezwaar [2026]',
  '/beschikking-uitleg': 'WHK-beschikking lezen (2026): loonsom, premie en toerekening',
  '/tools/premiehistorie': 'WGA-premie 2022-2026: historisch overzicht en loonsomgrenzen',
  '/diensten': 'WHK-diensten 2026: beschikking controleren en besparen',
  '/diensten/besparingsonderzoek': 'WHK-besparingsonderzoek 2026: wat u onnodig betaalt',
  '/diensten/tweede-spoor': 'Tweede spoor re-integratie: voorkom loonsanctie en WGA-instroom',
  '/voor/directeur': 'WHK-besparing voor directeuren: in 8 van de 10 gevallen',
  '/vergelijking': 'WHK-beschikking controleren: specialist, controller of arbodienst',
  '/sectoren/onderwijs': 'WHK-premie onderwijs 2026: fouten in de beschikking',
  '/tools': 'Gratis WHK-tools: WIA-calculator, premies en beschikking'
};

function request(port, urlPath) {
  return new Promise(function (resolve, reject) {
    var req = http.request({
      hostname: '127.0.0.1',
      port: port,
      path: urlPath,
      method: 'GET'
    }, function (res) {
      var body = '';
      res.on('data', function (chunk) { body += chunk; });
      res.on('end', function () { resolve({ status: res.statusCode, body: body }); });
    });
    req.on('error', reject);
    req.end();
  });
}

delete process.env.DATABASE_URL;
var app = require(path.join(__dirname, '..', 'server'));

var server = app.listen(0, '127.0.0.1', function () {
  var port = server.address().port;
  var paths = Object.keys(expected).concat(['/llms.txt']);
  Promise.all(paths.map(function (p) { return request(port, p); })).then(function (results) {
    paths.forEach(function (p, i) {
      var res = results[i];
      assert.strictEqual(res.status, 200, p + ' should be 200');
      assert.ok(res.body.indexOf('https://www.werkhervattingskas.nl') === -1, p + ' should not emit www URLs');
      if (expected[p]) {
        var title = expected[p];
        assert.ok(title.indexOf('—') === -1, 'title contains an em dash: ' + title);
        assert.ok(res.body.indexOf('<title>' + title + '</title>') !== -1, p + ' title mismatch');
        assert.ok(
          res.body.indexOf('rel="canonical" href="https://werkhervattingskas.nl' + p + '"') !== -1,
          p + ' canonical'
        );
      }
    });
    var llms = results[results.length - 1].body;
    assert.ok(llms.indexOf('https://werkhervattingskas.nl/tools/wia-calculator') !== -1, 'llms missing calculator');
    assert.ok(llms.indexOf('https://werkhervattingskas.nl/beschikking-uitleg') !== -1, 'llms missing beschikking');
    assert.ok(llms.indexOf('WIA-uitkering berekenen') !== -1, 'llms calculator label');
    assert.ok(llms.indexOf('https://www.') === -1, 'llms should stay on the apex');
    console.log('seo ctr title tests ok (' + Object.keys(expected).length + ' urls)');
    server.close();
  }).catch(function (err) {
    console.error(err);
    server.close();
    process.exit(1);
  });
});
