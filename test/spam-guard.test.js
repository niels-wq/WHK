'use strict';

var assert = require('assert');
var crypto = require('crypto');
var http = require('http');
var https = require('https');

process.env.SPAM_HMAC_SECRET = 'unit-test-spam-secret';
process.env.JWT_SECRET = 'unit-test-jwt-secret';
process.env.RESEND_API_KEY = 'test-resend-key';
process.env.LEAD_WEBHOOK_URL = 'https://hooks.example.test/lead';
process.env.WHK_CAPTURE_LEADS = '1';
delete process.env.DATABASE_URL;
delete process.env.ADMIN_PASSWORD;

var spamGuard = require('../lib/spam-guard');
var app = require('../server');

var calls = [];
var mailCalls = [];
global.fetch = function (url, opts) {
  calls.push({ url: String(url), body: opts && opts.body });
  return Promise.resolve({ ok: true, status: 200 });
};

var origRequest = https.request;
https.request = function (opts, cb) {
  var host = opts && (opts.hostname || opts.host);
  if (host === 'api.resend.com') {
    mailCalls.push(host);
    return {
      on: function () { return this; },
      write: function () { return this; },
      end: function () {
        var res = {
          statusCode: 200,
          on: function (ev, fn) {
            if (ev === 'data' || ev === 'end') process.nextTick(fn);
            return res;
          }
        };
        if (typeof cb === 'function') cb(res);
      }
    };
  }
  return origRequest.apply(https, arguments);
};

function request(method, urlPath, body, headers) {
  return new Promise(function (resolve, reject) {
    var payload = body ? JSON.stringify(body) : '';
    var addr = server.address();
    var hdrs = Object.assign({}, headers || {});
    if (body) {
      hdrs['Content-Type'] = 'application/json';
      hdrs['Content-Length'] = Buffer.byteLength(payload);
    }
    var req = http.request({
      hostname: '127.0.0.1',
      port: addr.port,
      path: urlPath,
      method: method,
      headers: hdrs
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

function leadBody(email, extra) {
  return Object.assign({
    name: 'Marieke de Vries',
    phone: '0651987432',
    email: email,
    source: 'calculator',
    message: 'WHK-check',
    page: '/'
  }, extra || {});
}

function postLead(email, extra, ip) {
  return request('POST', '/api/lead/notify', leadBody(email, extra), { 'X-Forwarded-For': ip });
}

function agedToken(msAgo) {
  return spamGuard.issue(Date.now() - msAgo);
}

function assertSuccess(res) {
  assert.strictEqual(res.status, 200, res.body);
  var json = JSON.parse(res.body);
  assert.strictEqual(json.ok, true);
  assert.strictEqual(json.status, 'new');
  assert.strictEqual(json.notified, true);
  assert.ok(json.id);
  return json;
}

function storedEmails() {
  return app.capturedLeads.map(function (lead) { return lead.email; });
}

var now = Date.now();
var signed = spamGuard.issue(now - 4000);
var ts = signed.split('.')[0];
var expectedSig = crypto.createHmac('sha256', 'unit-test-spam-secret').update(ts).digest('hex');
assert.strictEqual(signed, ts + '.' + expectedSig, 'tijdstempel moet met het env-geheim zijn ondertekend');

var fresh = spamGuard.issue(now);
assert.strictEqual(spamGuard.evaluate({ body: { whk_ts: fresh }, ip: '198.51.100.1', now: now }).reason, 'too_fast');
assert.strictEqual(spamGuard.evaluate({
  body: { whk_ts: signed, website: 'https://spam.example' },
  ip: '198.51.100.2',
  now: now
}).reason, 'honeypot');
var forged = ts + '.' + expectedSig.replace(/.$/, expectedSig.slice(-1) === 'a' ? 'b' : 'a');
assert.strictEqual(spamGuard.evaluate({ body: { whk_ts: forged }, ip: '198.51.100.3', now: now }).reason, 'invalid');
assert.strictEqual(spamGuard.evaluate({
  body: { whk_ts: spamGuard.issue(now - spamGuard.MAX_AGE_MS - 1000) },
  ip: '198.51.100.4',
  now: now
}).reason, 'expired');

spamGuard.reset();
var rateToken = spamGuard.issue(now - 4000);
for (var i = 0; i < spamGuard.RATE_LIMIT; i++) {
  var allowed = spamGuard.evaluate({ body: { whk_ts: rateToken }, ip: '198.51.100.5', now: now });
  assert.strictEqual(allowed.spam, false, 'inzending ' + (i + 1));
}
var limited = spamGuard.evaluate({ body: { whk_ts: rateToken }, ip: '198.51.100.5', now: now });
assert.strictEqual(limited.reason, 'rate');
var otherIp = spamGuard.evaluate({ body: { whk_ts: rateToken }, ip: '198.51.100.6', now: now });
assert.strictEqual(otherIp.spam, false);

var stamped = spamGuard.stampHtml('<html><head></head><body><form id="demo"><input name="email"></form></body></html>', signed);
assert.ok(stamped.indexOf('name="website"') !== -1);
assert.ok(stamped.indexOf('tabindex="-1"') !== -1);
assert.ok(stamped.indexOf('autocomplete="off"') !== -1);
assert.ok(stamped.indexOf('aria-hidden="true">Website</label>') !== -1);
assert.ok(stamped.indexOf('class="hp-field"') !== -1);
assert.ok(stamped.indexOf('name="whk_ts" value="' + signed + '"') !== -1);
assert.ok(stamped.indexOf('id="whk-form-guard"') !== -1);

spamGuard.reset();
app.capturedLeads.length = 0;
app.capturedNewsletter.length = 0;

var server = app.listen(0, '127.0.0.1', function () {
  var before;
  Promise.resolve()
    .then(function () { return request('GET', '/'); })
    .then(function (res) {
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.indexOf('class="hp-field"') !== -1, 'honeypot-CSS ontbreekt');
      assert.ok(res.body.indexOf('.hp-field{position:absolute;left:-9999px;') !== -1);
      assert.ok(res.body.indexOf('tabindex="-1"') !== -1);
      assert.ok(res.body.indexOf('autocomplete="off"') !== -1);
      assert.ok(res.body.indexOf('aria-hidden="true">Website</label>') !== -1);
      assert.ok(res.body.indexOf('id="calc-honeypot"') !== -1, 'WHK-check mist honeypot');
      assert.ok(res.body.indexOf('id="newsletter-form"') !== -1, 'nieuwsbriefformulier ontbreekt');
      assert.ok(res.body.indexOf('id="nl-honeypot"') !== -1);
      assert.ok(res.body.indexOf('name="whk_ts"') !== -1, 'tijdstempel ontbreekt in het formulier');
      assert.ok(res.body.indexOf('id="whk-form-guard"') !== -1);
      assert.ok(res.body.indexOf('unit-test-spam-secret') === -1, 'ondertekengeheim lekt in de HTML');
      var pageToken = (res.body.match(/name="whk_ts" value="([^"]+)"/) || [])[1];
      assert.ok(pageToken, 'geen whk_ts-waarde');
      before = { calls: calls.length, mail: mailCalls.length, leads: app.capturedLeads.length };
      return postLead('marieke.page@acme-holding.nl', { whk_ts: pageToken }, '203.0.113.9');
    })
    .then(function (res) {
      assertSuccess(res);
      assert.strictEqual(calls.length, before.calls, 'verse paginatoken mag geen webhook sturen');
      assert.strictEqual(mailCalls.length, before.mail);
      assert.strictEqual(app.capturedLeads.length, before.leads);
      assert.ok(spamGuard.stats().too_fast >= 1);
      before = { calls: calls.length, mail: mailCalls.length, leads: app.capturedLeads.length };
      return postLead('marieke.real@acme-holding.nl', { whk_ts: agedToken(5000), source: 'footer-form' }, '203.0.113.10');
    })
    .then(function (res) {
      assertSuccess(res);
      assert.strictEqual(calls.length, before.calls + 1, 'echte inzending moet de webhook aanroepen');
      assert.strictEqual(calls[calls.length - 1].url, 'https://hooks.example.test/lead');
      var posted = JSON.parse(calls[calls.length - 1].body);
      assert.strictEqual(posted.type, 'new_lead');
      assert.strictEqual(posted.lead.email, 'marieke.real@acme-holding.nl');
      assert.strictEqual(posted.lead.name, 'Marieke de Vries');
      assert.strictEqual(posted.lead.source, 'footer-form');
      assert.strictEqual(mailCalls.length, before.mail + 1, 'echte inzending moet mail sturen');
      assert.ok(storedEmails().indexOf('marieke.real@acme-holding.nl') !== -1, 'echte inzending is niet opgeslagen');
      before = { calls: calls.length, mail: mailCalls.length, leads: app.capturedLeads.length };
      return postLead('marieke.hp@acme-holding.nl', { whk_ts: agedToken(5000), website: 'https://spam.example' }, '203.0.113.11');
    })
    .then(function (res) {
      assertSuccess(res);
      assert.strictEqual(calls.length, before.calls, 'honeypot stuurde een webhook');
      assert.strictEqual(mailCalls.length, before.mail, 'honeypot stuurde mail');
      assert.ok(storedEmails().indexOf('marieke.hp@acme-holding.nl') === -1, 'honeypot is opgeslagen');
      assert.ok(spamGuard.stats().honeypot >= 1);
      before = { calls: calls.length, mail: mailCalls.length };
      return postLead('marieke.fast@acme-holding.nl', { whk_ts: agedToken(500) }, '203.0.113.12');
    })
    .then(function (res) {
      assertSuccess(res);
      assert.strictEqual(calls.length, before.calls, 'te snelle inzending stuurde een webhook');
      assert.strictEqual(mailCalls.length, before.mail);
      assert.ok(storedEmails().indexOf('marieke.fast@acme-holding.nl') === -1);
      var bad = agedToken(5000);
      bad = bad.slice(0, -1) + (bad.slice(-1) === '0' ? '1' : '0');
      before = { calls: calls.length, mail: mailCalls.length };
      return postLead('marieke.forge@acme-holding.nl', { whk_ts: bad }, '203.0.113.13');
    })
    .then(function (res) {
      assertSuccess(res);
      assert.strictEqual(calls.length, before.calls, 'vervalste tijdstempel stuurde een webhook');
      assert.strictEqual(mailCalls.length, before.mail);
      assert.ok(storedEmails().indexOf('marieke.forge@acme-holding.nl') === -1);
      assert.ok(spamGuard.stats().invalid >= 1);
      before = { calls: calls.length, mail: mailCalls.length, leads: app.capturedLeads.length };
      var chain = Promise.resolve();
      for (var n = 1; n <= 5; n++) {
        (function (n) {
          chain = chain.then(function () {
            return postLead('marieke.rate' + n + '@acme-holding.nl', { whk_ts: agedToken(5000) }, '203.0.113.20');
          }).then(function (res) {
            assertSuccess(res);
          });
        })(n);
      }
      return chain.then(function () {
        assert.strictEqual(calls.length, before.calls + 5, 'vijf inzendingen binnen de limiet');
        assert.strictEqual(mailCalls.length, before.mail + 5);
        assert.strictEqual(app.capturedLeads.length, before.leads + 5);
        return postLead('marieke.rate6@acme-holding.nl', { whk_ts: agedToken(5000) }, '203.0.113.20');
      });
    })
    .then(function (res) {
      assertSuccess(res);
      assert.strictEqual(calls.length, before.calls + 5, 'zesde inzending ging door de rate limit');
      assert.strictEqual(mailCalls.length, before.mail + 5);
      assert.ok(storedEmails().indexOf('marieke.rate6@acme-holding.nl') === -1);
      assert.ok(spamGuard.stats().rate >= 1);
      return postLead('marieke.other@acme-holding.nl', {
        whk_ts: agedToken(5000)
      }, '203.0.113.21, 10.0.0.8');
    })
    .then(function (res) {
      assertSuccess(res);
      assert.strictEqual(calls.length, before.calls + 6, 'ander IP achter de proxy deelt de teller');
      assert.ok(storedEmails().indexOf('marieke.other@acme-holding.nl') !== -1);
      before = { news: app.capturedNewsletter.length, calls: calls.length };
      return request('POST', '/api/newsletter', {
        email: 'nieuws@acme-holding.nl',
        whk_ts: agedToken(5000)
      }, { 'X-Forwarded-For': '203.0.113.30' });
    })
    .then(function (res) {
      assert.strictEqual(res.status, 200, res.body);
      assert.strictEqual(JSON.parse(res.body).ok, true);
      assert.strictEqual(app.capturedNewsletter.length, before.news + 1);
      assert.strictEqual(app.capturedNewsletter[0].email, 'nieuws@acme-holding.nl');
      assert.strictEqual(calls.length, before.calls, 'nieuwsbrief mag geen lead-webhook sturen');
      return request('POST', '/api/newsletter', {
        email: 'spam-nieuws@acme-holding.nl',
        website: 'https://spam.example',
        whk_ts: agedToken(5000)
      }, { 'X-Forwarded-For': '203.0.113.31' });
    })
    .then(function (res) {
      assert.strictEqual(res.status, 200, res.body);
      assert.strictEqual(JSON.parse(res.body).ok, true);
      var emails = app.capturedNewsletter.map(function (row) { return row.email; });
      assert.ok(emails.indexOf('spam-nieuws@acme-holding.nl') === -1, 'spam-nieuwsbrief is opgeslagen');
      return request('GET', '/whk_checklist.html');
    })
    .then(function (res) {
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.indexOf('id="callback-honeypot"') !== -1);
      assert.ok(res.body.indexOf('aria-hidden="true">Website</label>') !== -1);
      assert.ok(res.body.indexOf('name="whk_ts"') !== -1);
      assert.ok(res.body.indexOf('tabindex="-1"') !== -1);
      console.log('spam-guard tests ok');
      server.close();
    })
    .catch(function (err) {
      console.error(err);
      server.close();
      process.exit(1);
    });
});
