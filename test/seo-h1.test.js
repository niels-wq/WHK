'use strict';

var assert = require('assert');
var http = require('http');
var path = require('path');

var APEX = 'https://werkhervattingskas.nl';
var WIA_DESC = 'Zie hoe hoog een WIA-, WGA- of IVA-uitkering uitvalt en wat dat doet met de WHK-premie. Gebruik de gratis calculator 2026.';
var HOME_DESC = 'Klopt uw WHK-beschikking? Laat hem gratis controleren door een erkend arbeidsdeskundige en bekijk of bezwaar loont. Resultaat binnen 5 werkdagen.';

var routes = [
  {
    path: '/',
    title: 'WHK-beschikking laten controleren (2026) | Werkhervattingskas.nl',
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
    drop: ['home-view', 'wia-calc-view']
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
    title: 'ERD 2027 aanvragen vóór 2 oktober | Werkhervattingskas.nl',
    h1: 'ERD 2027 aanvragen vóór 2 oktober',
    keep: ['blogpost-view', 'Belastingdienst'],
    drop: ['home-view', 'blog-view', 'faq-view']
  },
  {
    path: '/blog/whk-premies-2027-wga-en-zw',
    title: 'Whk-premies 2027: WGA 1,07% en ZW 0,60% voor werkgevers | Werkhervattingskas.nl',
    h1: 'Whk-premies 2027: WGA 1,07% en ZW 0,60% voor werkgevers',
    keep: ['blogpost-view', '1,07%'],
    drop: ['home-view', 'blog-view', 'faq-view']
  },
  {
    path: '/blog/lkv-deadlines-kalender-werkgever',
    title: 'LKV-deadlines: kalender voor werkgevers in het Wtl-jaar | Werkhervattingskas.nl',
    h1: 'LKV-deadlines: kalender voor werkgevers in het Wtl-jaar',
    keep: ['blogpost-view', '15 maart'],
    drop: ['home-view', 'blog-view', 'faq-view']
  },
  {
    path: '/blog/zw-eigenrisicodrager-checklist',
    title: 'ZW-eigenrisicodrager: checklist vóór je overstapt in 2027 | Werkhervattingskas.nl',
    h1: 'ZW-eigenrisicodrager: checklist vóór je overstapt in 2027',
    keep: ['blogpost-view', 'Gratis WHK-beschikking check'],
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

function headOf(html) {
  var start = html.toLowerCase().indexOf('<head');
  var end = html.toLowerCase().indexOf('</head>');
  assert.ok(start !== -1 && end > start, 'document has a head');
  return html.slice(start, end);
}

var FAQ_ROUTES = { '/faq': true, '/tools/wia-calculator': true };

function faqLdBlocks(html) {
  return (html.match(/<script type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/g) || [])
    .filter(function (b) { return b.indexOf('FAQPage') !== -1; });
}

function faqPages(html) {
  var pages = [];
  faqLdBlocks(html).forEach(function (block) {
    var json = block.replace(/^<script[^>]*>/, '').replace(/<\/script>\s*$/, '');
    var data = JSON.parse(json);
    var nodes = Array.isArray(data['@graph']) ? data['@graph'] : [data];
    nodes.forEach(function (node) {
      var t = node && node['@type'];
      var isFaq = t === 'FAQPage' || (Array.isArray(t) && t.indexOf('FAQPage') !== -1);
      if (isFaq && node.mainEntity) pages.push(node);
    });
  });
  return pages;
}

function stripInline(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(parseInt(n, 10)); })
    .replace(/\s+/g, ' ')
    .trim();
}

function visibleWiaPairs(html) {
  var start = html.indexOf('id="wia-faq"');
  var end = html.indexOf('id="wia-faq-cta"');
  assert.ok(start !== -1 && end > start, 'wia faq block');
  var block = html.slice(start, end);
  var pairs = [];
  var re = /<h3\b[^>]*>([\s\S]*?)<\/h3>\s*<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  var m;
  while ((m = re.exec(block))) {
    pairs.push({ question: stripInline(m[1]), answer: stripInline(m[2]) });
  }
  return pairs;
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
      var head = headOf(res.body);
      assert.ok(head.indexOf('—') === -1, route.path + ' head em dash');
      assert.ok(!/no cure/i.test(head), route.path + ' head no cure');
      assert.ok(head.indexOf('47.000') === -1, route.path + ' head 47.000');
      if (route.path === '/') {
        assert.strictEqual(desc, HOME_DESC, 'home description');
        assert.ok(desc.length <= 155, 'home description length ' + desc.length);
      }
      if (route.path === '/tools/wia-calculator') {
        assert.strictEqual(desc, WIA_DESC, 'wia description');
        assert.ok(desc.length <= 155, 'wia description length ' + desc.length);
        assert.ok(desc.indexOf('gratis calculator 2026') !== -1, 'wia phrase');
      }
      if (FAQ_ROUTES[route.path]) {
        assert.ok(faqLdBlocks(res.body).length >= 1, route.path + ' should emit FAQPage');
      } else {
        assert.strictEqual(faqLdBlocks(res.body).length, 0, route.path + ' should not emit FAQPage');
      }
    });

    var wiaBody = results[routes.findIndex(function (r) { return r.path === '/tools/wia-calculator'; })].body;
    var faqBody = results[routes.findIndex(function (r) { return r.path === '/faq'; })].body;
    assert.strictEqual(countH1(wiaBody), 1, 'wia calculator h1');
    assert.ok(wiaBody.indexOf('Veelgestelde vragen') !== -1, 'wia faq heading');
    assert.strictEqual((wiaBody.match(/<h1\b/gi) || []).length, 1, 'wia still one h1');
    var wiaStart = wiaBody.indexOf('id="wia-faq"');
    var wiaEnd = wiaBody.indexOf('</section>', wiaStart);
    var wiaFaq = wiaBody.slice(wiaStart, wiaEnd);
    assert.ok(wiaFaq.indexOf('erd-partneradvies') === -1, 'wia faq must not link ERD');
    assert.ok(wiaFaq.indexOf('/diensten/erd') === -1, 'wia faq must not link ERD path');
    assert.ok(!/\bERD\b/.test(wiaFaq), 'wia faq must not mention ERD');
    assert.ok(wiaFaq.indexOf('—') === -1 && wiaFaq.indexOf('–') === -1, 'wia faq dash');
    assert.ok(!/no cure/i.test(wiaFaq), 'wia faq no cure');
    assert.ok(wiaFaq.indexOf('47.000') === -1 && wiaFaq.indexOf('47000') === -1, 'wia faq amount');
    ['/beschikking-uitleg', '/diensten/arbeidsdeskundig-onderzoek', '/faq', '/blog/whk-premies-2027-wga-en-zw'].forEach(function (href) {
      assert.ok(wiaFaq.indexOf('href="' + href + '"') !== -1, 'wia faq missing ' + href);
    });
    assert.ok(wiaFaq.indexOf('€282,15') !== -1, 'wia faq maximumdagloon');
    var visible = visibleWiaPairs(wiaBody);
    assert.ok(visible.length >= 5 && visible.length <= 6, 'wia faq question count ' + visible.length);
    var wiaSchema = faqPages(wiaBody);
    assert.strictEqual(wiaSchema.length, 1, 'one FAQPage schema on calculator');
    assert.strictEqual(wiaSchema[0].mainEntity.length, visible.length, 'schema questions match visible');
    visible.forEach(function (pair, i) {
      var entity = wiaSchema[0].mainEntity[i];
      assert.strictEqual(entity.name, pair.question, 'schema question ' + i);
      assert.strictEqual(entity.acceptedAnswer.text, pair.answer, 'schema answer ' + i);
    });
    var faqNames = {};
    faqPages(faqBody).forEach(function (page) {
      page.mainEntity.forEach(function (q) { faqNames[q.name] = true; });
    });
    visible.forEach(function (pair) {
      assert.ok(!faqNames[pair.question], 'question overlaps /faq: ' + pair.question);
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
