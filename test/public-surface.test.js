'use strict';

var assert = require('assert');
var http = require('http');
var spamGuard = require('../lib/spam-guard');

process.env.GA4_MEASUREMENT_ID = 'G-PUBLIC123';
process.env.CALENDLY_URL = 'https://calendly.com/whk-test/intake';
process.env.LEAD_WEBHOOK_URL = 'https://hooks.example.test/lead-secret-xyz';
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

var app = require('../server');

function request(method, urlPath, body) {
  return new Promise(function (resolve, reject) {
    var payload = body ? JSON.stringify(body) : '';
    var addr = server.address();
    var req = http.request({
      hostname: '127.0.0.1',
      port: addr.port,
      path: urlPath,
      method: method,
      headers: body ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      } : {}
    }, function (res) {
      var data = '';
      res.on('data', function (c) { data += c; });
      res.on('end', function () { resolve({ status: res.statusCode, body: data }); });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

var calls = [];
global.fetch = function (url, opts) {
  calls.push({ url: String(url), body: opts && opts.body });
  return Promise.resolve({ ok: true, status: 200 });
};

var server = app.listen(0, '127.0.0.1', function () {
  Promise.resolve()
    .then(function () { return request('GET', '/'); })
    .then(function (res) {
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.indexOf('id="ga4-script"') !== -1, 'GA4-tag ontbreekt');
      assert.ok(res.body.indexOf('https://www.googletagmanager.com/gtag/js?id=G-PUBLIC123') !== -1);
      assert.ok(res.body.indexOf('gtag("config", "G-PUBLIC123"') !== -1);
      assert.ok(res.body.indexOf('https://calendly.com/whk-test/intake') !== -1, 'Calendly-link ontbreekt');
      assert.ok(res.body.indexOf('Afspraak inplannen') !== -1);
      assert.ok(res.body.indexOf('id="footer-calendly"') !== -1, 'footer mist de afspraaklink');
      assert.ok(res.body.indexOf('id="modal-calendly"') !== -1, 'contactmodal mist de afspraaklink');
      assert.ok(res.body.indexOf('hooks.example.test') === -1, 'webhook-URL lekt in de HTML');
      assert.ok(res.body.indexOf('lead-secret') === -1, 'webhook-geheim lekt in de HTML');
      assert.ok(!/no[\s-]*cure[\s,]*no[\s-]*pay/i.test(res.body), 'homepage noemt nog no cure no pay');
      assert.ok(res.body.indexOf('47.000') === -1, 'homepage noemt nog 47.000');
      var pubMatch = res.body.match(/<script id="whk-public-config">window\.WHK_PUBLIC=(\{.*?\});<\/script>/);
      assert.ok(pubMatch, 'publieke config ontbreekt');
      var pub = JSON.parse(pubMatch[1]);
      assert.strictEqual(pub.ga4Id, 'G-PUBLIC123');
      assert.strictEqual(pub.calendlyUrl, 'https://calendly.com/whk-test/intake');
      assert.deepStrictEqual(Object.keys(pub).sort(), ['calendlyUrl', 'ga4Id']);
      return request('GET', '/api/settings/ga4id');
    })
    .then(function (res) {
      assert.strictEqual(res.status, 401, 'ga4-setting is publiek geworden');
      return request('GET', '/api/settings/webhook_url');
    })
    .then(function (res) {
      assert.strictEqual(res.status, 401, 'webhook-setting is publiek geworden');
      return request('GET', '/api/settings/calendly_url');
    })
    .then(function (res) {
      assert.strictEqual(res.status, 401, 'calendly-setting is publiek geworden');
      return request('GET', '/faq');
    })
    .then(function (res) {
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.indexOf('id="ga4-script"') !== -1, 'FAQ mist de GA4-tag');
      assert.ok(res.body.indexOf('hooks.example.test') === -1);
      return request('GET', '/whk_checklist.html');
    })
    .then(function (res) {
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.indexOf('id="ga4-script"') !== -1, 'checklist mist de GA4-tag');
      assert.ok(res.body.indexOf('hooks.example.test') === -1, 'checklist lekt de webhook-URL');
      return request('POST', '/api/lead/notify', {
        name: 'Petra Jansen',
        phone: '0651239876',
        email: 'petra.jansen@acme.nl',
        source: 'footer-form',
        message: 'Graag een terugbelverzoek',
        page: '/',
        whk_ts: spamGuard.issue(Date.now() - 5000)
      });
    })
    .then(function (res) {
      assert.strictEqual(res.status, 200, res.body);
      var json = JSON.parse(res.body);
      assert.strictEqual(json.ok, true);
      assert.strictEqual(json.notified, true);
      assert.ok(calls.length >= 1, 'webhook is niet aangeroepen');
      assert.strictEqual(calls[0].url, 'https://hooks.example.test/lead-secret-xyz');
      var posted = JSON.parse(calls[0].body);
      assert.strictEqual(posted.type, 'new_lead');
      assert.strictEqual(posted.lead.email, 'petra.jansen@acme.nl');
      assert.strictEqual(posted.lead.name, 'Petra Jansen');
      console.log('public-surface tests ok');
      server.close();
    })
    .catch(function (err) {
      console.error(err);
      server.close();
      process.exit(1);
    });
});
