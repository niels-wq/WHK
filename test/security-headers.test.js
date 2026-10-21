'use strict';

var assert = require('assert');
var http = require('http');

delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

var app = require('../server');

function request(method, urlPath, host) {
  return new Promise(function (resolve, reject) {
    var addr = server.address();
    var req = http.request({
      hostname: '127.0.0.1',
      port: addr.port,
      path: urlPath,
      method: method,
      headers: { Host: host || 'werkhervattingskas.nl' }
    }, function (res) {
      res.resume();
      res.on('end', function () {
        resolve({ status: res.statusCode, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function assertSecurityHeaders(res, route) {
  var h = res.headers;
  assert.strictEqual(
    h['strict-transport-security'],
    'max-age=31536000; includeSubDomains',
    route + ' HSTS'
  );
  assert.strictEqual(h['x-frame-options'], 'SAMEORIGIN', route + ' X-Frame-Options');
  assert.strictEqual(h['x-content-type-options'], 'nosniff', route + ' nosniff');
  assert.strictEqual(
    h['referrer-policy'],
    'strict-origin-when-cross-origin',
    route + ' Referrer-Policy'
  );
  assert.strictEqual(
    h['permissions-policy'],
    'camera=(), microphone=(), geolocation=()',
    route + ' Permissions-Policy'
  );
  assert.ok(!h['x-powered-by'], route + ' lekt X-Powered-By');

  var csp = h['content-security-policy'] || '';
  assert.ok(csp.indexOf("frame-ancestors 'self'") !== -1, route + ' mist frame-ancestors in CSP');
  assert.ok(csp.indexOf('script-src') === -1, route + ' afdwingende CSP beperkt scripts');
  assert.ok(csp.indexOf('style-src') === -1, route + ' afdwingende CSP beperkt styles');

  var report = h['content-security-policy-report-only'] || '';
  assert.ok(report.indexOf("default-src 'self'") !== -1, route + ' mist default-src');
  assert.ok(report.indexOf("frame-ancestors 'self'") !== -1, route + ' mist frame-ancestors in report-only');
  assert.ok(report.indexOf("'unsafe-inline'") !== -1, route + ' mist inline scripts/styles');
  assert.ok(report.indexOf('https://www.googletagmanager.com') !== -1, route + ' mist GA4/gtag');
  assert.ok(report.indexOf('https://www.google-analytics.com') !== -1, route + ' mist google-analytics');
  assert.ok(report.indexOf('https://calendly.com') !== -1, route + ' mist Calendly');
  assert.ok(report.indexOf('https://assets.calendly.com') !== -1, route + ' mist Calendly-assets');
  assert.ok(report.indexOf("connect-src 'self'") !== -1, route + ' mist connect-src self voor /api/chat');
  assert.ok(report.indexOf('https://fonts.googleapis.com') !== -1, route + ' mist Google Fonts');
}

var routes = [
  ['GET', '/', 'werkhervattingskas.nl'],
  ['GET', '/faq', 'werkhervattingskas.nl'],
  ['GET', '/health', 'werkhervattingskas.nl'],
  ['GET', '/robots.txt', 'werkhervattingskas.nl'],
  ['GET', '/contact', 'werkhervattingskas.nl'],
  ['GET', '/chat/whk-chat.js', 'werkhervattingskas.nl'],
  ['GET', '/geen-pagina', 'werkhervattingskas.nl'],
  ['POST', '/api/lead/notify', 'werkhervattingskas.nl'],
  ['GET', '/blog', 'www.werkhervattingskas.nl']
];

var server = app.listen(0, '127.0.0.1', function () {
  routes.reduce(function (chain, pair) {
    return chain.then(function () {
      return request(pair[0], pair[1], pair[2]).then(function (res) {
        var label = pair[0] + ' ' + pair[1] + ' (' + pair[2] + ')';
        assert.ok(res.status >= 200 && res.status < 500, label + ' status ' + res.status);
        if (pair[2].indexOf('www.') === 0) assert.strictEqual(res.status, 301, label + ' moet naar de apex');
        assertSecurityHeaders(res, label);
      });
    });
  }, Promise.resolve())
    .then(function () {
      console.log('security-headers tests ok');
      server.close();
    })
    .catch(function (err) {
      console.error(err);
      server.close();
      process.exit(1);
    });
});
