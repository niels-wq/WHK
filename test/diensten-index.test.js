'use strict';

var assert = require('assert');
var fs = require('fs');
var http = require('http');
var path = require('path');

var root = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(root, 'whk_verzuim.html'), 'utf8');

function section(id) {
  var re = new RegExp('<section[^>]*id="' + id + '"[\\s\\S]*?</section>');
  var m = html.match(re);
  assert.ok(m, 'missing section ' + id);
  return m[0];
}

var diensten = section('diensten-view');
[
  '/diensten/whk-controle',
  '/diensten/besparingsonderzoek',
  '/diensten/letselschade',
  '/diensten/arbeidsdeskundig-onderzoek',
  '/diensten/tweede-spoor',
  '/diensten/consultancy',
  '/diensten/erd-partneradvies'
].forEach(function (href) {
  assert.ok(diensten.indexOf('href="' + href + '"') !== -1, 'missing link ' + href);
});
assert.ok(diensten.indexOf('Gratis WHK-beschikking check') !== -1, 'missing primary CTA');
assert.ok(diensten.indexOf('data-cta="calculator"') !== -1, 'CTA should open the WHK check');
assert.ok(diensten.indexOf('—') === -1 && diensten.indexOf('&mdash;') === -1, 'diensten copy should not use an em dash');
assert.ok(html.indexOf("'diensten-view':                '/diensten'") !== -1, 'client route missing');
assert.ok(html.indexOf('diensten-view') !== -1, 'view id missing from client');

function request(port, urlPath, headers) {
  return new Promise(function (resolve, reject) {
    var req = http.request({
      hostname: '127.0.0.1',
      port: port,
      path: urlPath,
      method: 'GET',
      headers: headers || {}
    }, function (res) {
      var body = '';
      res.on('data', function (chunk) { body += chunk; });
      res.on('end', function () {
        resolve({ status: res.statusCode, headers: res.headers, body: body });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

delete process.env.DATABASE_URL;
var app = require('../server');

var server = app.listen(0, '127.0.0.1', function () {
  var port = server.address().port;
  Promise.all([
    request(port, '/diensten'),
    request(port, '/diensten/'),
    request(port, '/aanpak/'),
    request(port, '/sitemap.xml'),
    request(port, '/diensten', { host: 'www.werkhervattingskas.nl' }),
    request(port, '/niet-bestaand')
  ]).then(function (results) {
    var index = results[0];
    var slashed = results[1];
    var aanpakSlash = results[2];
    var sitemap = results[3];
    var www = results[4];
    var missing = results[5];

    assert.strictEqual(index.status, 200, '/diensten should be 200');
    assert.ok(index.body.indexOf('id="diensten-view"') !== -1, 'index HTML missing diensten view');
    assert.ok(index.body.indexOf('<title>Diensten: WHK-controle, re-integratie en advies</title>') !== -1, 'index title');
    assert.ok(index.body.indexOf('rel="canonical" href="https://werkhervattingskas.nl/diensten"') !== -1, 'canonical should be /diensten');

    assert.strictEqual(slashed.status, 200, '/diensten/ should be 200, not a redirect to a 404');
    assert.ok(slashed.body.indexOf('rel="canonical" href="https://werkhervattingskas.nl/diensten"') !== -1, 'slashed canonical');
    assert.ok(slashed.body.indexOf('href="/diensten/whk-controle"') !== -1, 'slashed page missing service link');

    assert.strictEqual(aanpakSlash.status, 301, 'other trailing slashes stay 301');
    assert.strictEqual(aanpakSlash.headers.location, '/aanpak');

    assert.strictEqual(sitemap.status, 200);
    assert.ok(sitemap.body.indexOf('<loc>https://werkhervattingskas.nl/diensten</loc>') !== -1, 'sitemap missing /diensten');

    assert.strictEqual(www.status, 301, 'www should still redirect to apex');
    assert.strictEqual(www.headers.location, 'https://werkhervattingskas.nl/diensten');

    assert.strictEqual(missing.status, 404);

    console.log('diensten index tests ok');
    server.close();
  }).catch(function (err) {
    console.error(err);
    server.close();
    process.exit(1);
  });
});
