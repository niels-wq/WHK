'use strict';

var assert = require('assert');
var http = require('http');
var path = require('path');

var APEX = 'https://werkhervattingskas.nl';
var WIA_DESC = 'Zie hoe hoog een WIA-, WGA- of IVA-uitkering uitvalt en wat dat doet met de WHK-premie. Gebruik de gratis calculator 2026.';

var routes = [
  {
    path: '/',
    title: 'WHK-beschikking controleren — in 8 van de 10 gevallen vinden wij iets',
    h1: 'Betaalt u onbewust te veel WHK',
    keep: ['home-view', 'results-view'],
    drop: ['faq-view', 'wia-calc-view', 'privacy-view']
  },
  {
    path: '/tools/wia-calculator',
    title: 'WIA-uitkering berekenen 2026: gratis WGA- en IVA-calculator',
    h1: 'WIA-uitkering berekenen (2026): WGA, IVA of loonaanvulling',
    keep: ['wia-calc-view', 'wia-calc-btn'],
    drop: ['home-view', 'faq-view', 'premiehistorie-view'],
    links: ['/faq', '/beschikking-uitleg', '/diensten/arbeidsdeskundig-onderzoek', '/tools/premiehistorie']
  },
  {
    path: '/faq',
    title: 'Wat is de Werkhervattingskas (WHK)? Premie, WIA en bezwaar [2026]',
    h1: 'Wat is de Werkhervattingskas?',
    keep: ['faq-view'],
    drop: ['home-view', 'wia-calc-view'],
    faq: true
  },
  {
    path: '/diensten',
    title: 'WHK-diensten 2026: beschikking controleren en besparen',
    h1: 'WHK-diensten: beschikking controleren, besparen en re-integratie.',
    keep: ['diensten-view'],
    drop: ['home-view', 'faq-view']
  },
  {
    path: '/beschikking-uitleg',
    title: 'WHK-beschikking lezen (2026): loonsom, premie en toerekening',
    h1: 'WHK-beschikking lezen: dagtekening, loonsom, premie en toerekening',
    keep: ['beschikking-uitleg-view'],
    drop: ['home-view', 'faq-view']
  },
  {
    path: '/tools/premiehistorie',
    title: 'WGA-premie 2022-2026: historisch overzicht en loonsomgrenzen',
    h1: 'WGA-premie 2022-2026: historisch overzicht',
    keep: ['premiehistorie-view'],
    drop: ['home-view', 'wia-calc-view']
  },
  {
    path: '/blog/erd-2027-aanvragen-voor-2-oktober',
    title: 'ERD 2027 aanvragen vóór 2 oktober — werkhervattingskas.nl',
    h1: 'ERD 2027 aanvragen vóór 2 oktober',
    keep: ['blogpost-view', 'Belastingdienst'],
    drop: ['home-view', 'blog-view', 'faq-view']
  }
];

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

function countH1(html) {
  var m = html.match(/<h1\b/gi);
  return m ? m.length : 0;
}

function meta(html, name) {
  var re = new RegExp('<meta name="' + name + '" content="([^"]*)"');
  var m = html.match(re);
  return m ? m[1] : '';
}

function faqLdCount(html) {
  var blocks = html.match(/<script type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/g) || [];
  return blocks.filter(function (b) { return b.indexOf('FAQPage') !== -1; }).length;
}

delete process.env.DATABASE_URL;
var app = require(path.join(__dirname, '..', 'server'));

var server = app.listen(0, '127.0.0.1', function () {
  var port = server.address().port;
  var paths = routes.map(function (r) { return r.path; }).concat(['/diensten/arbeidsdeskundig-onderzoek']);
  Promise.all(paths.map(function (p) { return request(port, p); })).then(function (results) {
    routes.forEach(function (route, i) {
      var res = results[i];
      assert.strictEqual(res.status, 200, route.path + ' status');
      assert.strictEqual(countH1(res.body), 1, route.path + ' h1 count ' + countH1(res.body));
      assert.ok(res.body.indexOf('<title>' + route.title + '</title>') !== -1, route.path + ' title');
      assert.ok(
        res.body.indexOf('rel="canonical" href="' + APEX + route.path + '"') !== -1,
        route.path + ' canonical'
      );
      assert.ok(res.body.indexOf(route.h1) !== -1, route.path + ' h1 text');
      assert.ok(res.body.indexOf('https://www.werkhervattingskas.nl') === -1, route.path + ' www');
      (route.keep || []).forEach(function (id) {
        assert.ok(res.body.indexOf(id) !== -1, route.path + ' missing ' + id);
      });
      (route.drop || []).forEach(function (id) {
        assert.ok(res.body.indexOf('id="' + id + '"') === -1, route.path + ' still has ' + id);
      });
      if (route.links) {
        route.links.forEach(function (href) {
          assert.ok(res.body.indexOf('href="' + href + '"') !== -1, route.path + ' missing link ' + href);
        });
      }
      var desc = meta(res.body, 'description');
      assert.ok(desc.indexOf('—') === -1 && desc.indexOf('–') === -1, route.path + ' description dash');
      if (route.path === '/tools/wia-calculator') {
        assert.strictEqual(desc, WIA_DESC, 'wia description');
        assert.ok(desc.length <= 155, 'wia description length ' + desc.length);
        assert.ok(desc.indexOf('gratis calculator 2026') !== -1, 'wia phrase');
      }
      if (route.faq) {
        assert.ok(faqLdCount(res.body) >= 1, route.path + ' should emit FAQPage');
      } else {
        assert.strictEqual(faqLdCount(res.body), 0, route.path + ' should not emit FAQPage');
      }
    });

    var ado = results[results.length - 1];
    assert.strictEqual(ado.status, 200, 'arbeidsdeskundig onderzoek exists');
    assert.strictEqual(countH1(ado.body), 1, 'ado h1');
    assert.ok(
      ado.body.indexOf('rel="canonical" href="' + APEX + '/diensten/arbeidsdeskundig-onderzoek"') !== -1,
      'ado canonical'
    );

    console.log('seo h1 tests ok (' + routes.length + ' routes, one h1 each)');
    server.close();
  }).catch(function (err) {
    console.error(err);
    server.close();
    process.exit(1);
  });
});
